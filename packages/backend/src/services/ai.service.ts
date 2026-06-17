
import fs from 'fs/promises';
import openai, { createOpenAIClient } from '../config/openai';
import { config } from '../config';
import { AIGenerationStatus, JsonValue } from '../types';
import { aiGenerationLogRepository } from '../models/ai-log.model';
import {
  AI_PROVIDER_OPENAI,
  AI_SUBJECT_SCOPE_MATH,
  DEFAULT_AI_TRANSPARENCY_METADATA,
  type AITransparencyMetadata,
} from '../constants/ai-governance';
import {
  createSamplingParams,
  createTokenLimitParam,
} from '../utils/openai-chat-compat';
import { ValidationError } from '../utils/errors';
import {
  aiProviderRegistryService,
  type AIProviderKind,
} from './ai-provider-registry.service';

export interface AICompletionOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  maxRetries?: number;
  fallbackContent?: string;
  fallbackData?: unknown;
}

export interface AICompletionResult {
  content: string;
  tokensUsed: {
    input: number;
    output: number;
  };
}

const DEFAULT_MODEL = config.openai.model || 'gpt-4o-mini';
const SENSITIVE_KEY_PATTERN = /(email|phone|address|password|token|api_?key|secret|full_?name|name|content|text|answer|image|url)/i;
const MAX_REDACTED_STRING_LENGTH = 160;
const DEFAULT_AI_TIMEOUT_MS = 15_000;
const DEFAULT_AI_MAX_RETRIES = 1;
const DEFAULT_RETRY_DELAY_MS = 250;

type ChatCompletionResponse = {
  choices: Array<{ message?: { content?: unknown } }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
  };
};

type AIChatClient = {
  chat: {
    completions: {
      create: (body: unknown, options?: { timeout?: number; maxRetries?: number }) => Promise<ChatCompletionResponse>;
    };
  };
};

export interface AIServiceRuntimeOptions {
  defaultTimeoutMs?: number;
  defaultMaxRetries?: number;
  retryDelayMs?: number;
}

export interface AIImageTextExtractionResult {
  parsedText: string;
  tokensUsed: {
    input: number;
    output: number;
  };
}

export interface AILogGenerationMetadataInput extends AITransparencyMetadata {
  promptTemplate?: string | null;
  promptVersion?: string | null;
}

export interface AILogGenerationInput {
  studentId?: string | null;
  type: string;
  prompt?: unknown;
  response?: unknown;
  model?: string | null;
  tokensInput?: number | null;
  tokensOutput?: number | null;
  durationMs?: number | null;
  status?: AIGenerationStatus | string;
  errorMessage?: string;
  metadata?: AILogGenerationMetadataInput;
}

export class AIService {
  private readonly client: AIChatClient;
  private readonly defaultTimeoutMs: number;
  private readonly defaultMaxRetries: number;
  private readonly retryDelayMs: number;

  constructor(
    client: AIChatClient = openai as unknown as AIChatClient,
    runtimeOptions: AIServiceRuntimeOptions = {}
  ) {
    this.client = client;
    this.defaultTimeoutMs = runtimeOptions.defaultTimeoutMs ?? DEFAULT_AI_TIMEOUT_MS;
    this.defaultMaxRetries = runtimeOptions.defaultMaxRetries ?? DEFAULT_AI_MAX_RETRIES;
    this.retryDelayMs = runtimeOptions.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;
  }

  /**
   * Resolve the AI client dynamically: prefer active provider from the
   * registry (DB), fallback to the env-configured default client.
   */
  private async resolveClient(): Promise<AIChatClient> {
    try {
      const runtimeConfig = await aiProviderRegistryService.getRuntimeConfig();
      console.log('[AIService.resolveClient] Runtime config:', {
        hasApiKey: Boolean(runtimeConfig.apiKey),
        baseUrl: runtimeConfig.baseUrl,
        model: runtimeConfig.model,
        provider: runtimeConfig.provider,
      });
      if (runtimeConfig.apiKey && runtimeConfig.baseUrl) {
        const dynamicClient = createOpenAIClient(runtimeConfig.baseUrl, runtimeConfig.apiKey);
        return dynamicClient as unknown as AIChatClient;
      }
    } catch (err) {
      console.error('[AIService.resolveClient] Error resolving provider:', err instanceof Error ? err.message : err);
    }
    return this.client;
  }

  /**
   * Resolve the model name from the active provider registry, fallback to env default.
   */
  private async resolveModel(): Promise<string> {
    try {
      const runtimeConfig = await aiProviderRegistryService.getRuntimeConfig();
      if (runtimeConfig.model) {
        return runtimeConfig.model;
      }
    } catch {
      // Fallback to default model
    }
    return DEFAULT_MODEL;
  }

  /**
   * Resolve provider kind so request parameters match OpenAI vs compatible APIs.
   */
  private async resolveProviderKind(): Promise<AIProviderKind> {
    try {
      const runtimeConfig = await aiProviderRegistryService.getRuntimeConfig();
      return runtimeConfig.provider;
    } catch {
      return AI_PROVIDER_OPENAI;
    }
  }

  public async generateCompletion(
    systemPrompt: string,
    userPrompt: string,
    options: AICompletionOptions = {}
  ): Promise<AICompletionResult> {
    // Resolve AI client: prefer active provider from registry, fallback to env config
    const client = await this.resolveClient();
    const model = options.model ?? (await this.resolveModel());
    const provider = await this.resolveProviderKind();

    try {
      const completion = await this.createChatCompletionWithResilience(
        {
          model,
          ...createSamplingParams(provider, model, options.temperature ?? 0.2),
          ...createTokenLimitParam(provider, model, options.maxTokens),
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
        },
        options,
        client
      );

      const content = completion.choices[0]?.message?.content;

      if (!content || typeof content !== 'string') {
        throw new ValidationError('AI không trả về nội dung hợp lệ');
      }

      return {
        content,
        tokensUsed: {
          input: completion.usage?.prompt_tokens ?? 0,
          output: completion.usage?.completion_tokens ?? 0,
        },
      };
    } catch (error) {
      // Fallback to default env-configured client if dynamic provider fails
      const activeProvider = await aiProviderRegistryService.getActiveProvider().catch(() => null);
      if (activeProvider !== null) {
        console.warn(
          `[AIService] Dynamic provider (${activeProvider.name}) failed. Falling back to default env-configured client. Error:`,
          error instanceof Error ? error.message : error
        );

        const completion = await this.createChatCompletionWithResilience(
          {
            model: DEFAULT_MODEL,
            ...createSamplingParams(AI_PROVIDER_OPENAI, DEFAULT_MODEL, options.temperature ?? 0.2),
            ...createTokenLimitParam(AI_PROVIDER_OPENAI, DEFAULT_MODEL, options.maxTokens),
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt },
            ],
          },
          options,
          this.client
        );

        const content = completion.choices[0]?.message?.content;

        if (!content || typeof content !== 'string') {
          throw new ValidationError('AI (fallback) không trả về nội dung hợp lệ');
        }

        return {
          content,
          tokensUsed: {
            input: completion.usage?.prompt_tokens ?? 0,
            output: completion.usage?.completion_tokens ?? 0,
          },
        };
      }

      throw error;
    }
  }

  public async generateJSON<T>(
    systemPrompt: string,
    userPrompt: string,
    options: AICompletionOptions = {}
  ): Promise<{ data: T; tokensUsed: { input: number; output: number } }> {
    let result: AICompletionResult;

    try {
      result = await this.generateCompletion(
        `${systemPrompt}\n\nChỉ trả về JSON hợp lệ, không kèm markdown fence hay giải thích thêm.`,
        userPrompt,
        options
      );
    } catch (error) {
      if ('fallbackData' in options) {
        return {
          data: options.fallbackData as T,
          tokensUsed: { input: 0, output: 0 },
        };
      }

      throw error;
    }

    const jsonText = this.extractJson(result.content);

    try {
      return {
        data: JSON.parse(jsonText) as T,
        tokensUsed: result.tokensUsed,
      };
    } catch (error: unknown) {
      // Safety net: model thường trả LaTeX với backslash đơn ("\frac", "\sqrt")
      // trong chuỗi JSON — escape không hợp lệ làm JSON.parse thất bại và toàn
      // bộ nội dung bị loại bỏ. Escape lại các backslash không hợp lệ rồi thử lần nữa.
      try {
        return {
          data: JSON.parse(this.repairInvalidJsonEscapes(jsonText)) as T,
          tokensUsed: result.tokensUsed,
        };
      } catch {
        throw new ValidationError('Không thể parse JSON từ phản hồi AI', {
          rawContent: result.content,
          cause: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  }

  /**
   * Escape lại backslash không hợp lệ trong chuỗi JSON (vd "\frac" → "\\frac").
   * Giữ nguyên các escape hợp lệ: \" \\ \/ \b \f \n \r \t \uXXXX.
   */
  private repairInvalidJsonEscapes(jsonText: string): string {
    return jsonText.replace(/\\(?!["\\/bfnrt]|u[0-9a-fA-F]{4})/g, '\\\\');
  }

  public async extractTextFromImage(
    imagePath: string,
    mimeType: string,
    options: AICompletionOptions = {}
  ): Promise<AIImageTextExtractionResult> {
    if (!config.openai.apiKey) {
      throw new ValidationError('Chưa cấu hình AI provider để OCR ảnh');
    }

    const imageBuffer = await fs.readFile(imagePath);
    const imageBase64 = imageBuffer.toString('base64');
    const model = options.model ?? DEFAULT_MODEL;

    const completion = await this.createChatCompletionWithResilience(
      {
        model,
        ...createSamplingParams(AI_PROVIDER_OPENAI, model, options.temperature ?? 0),
        ...createTokenLimitParam(AI_PROVIDER_OPENAI, model, options.maxTokens ?? 600),
        messages: [
          {
            role: 'system',
            content: [
              'Bạn là bộ OCR an toàn cho đề toán tiếng Việt.',
              'Nhiệm vụ duy nhất: đọc nội dung đề toán trong ảnh và chép lại thành text.',
              'Không giải bài, không suy đoán nội dung bị che/mờ, không tự thêm dữ kiện.',
              'Nếu ảnh không đọc được hoặc không có đề toán, trả về chuỗi rỗng.',
            ].join('\n'),
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Hãy OCR đề toán trong ảnh. Chỉ trả về phần đề bài dạng văn bản thuần.',
              },
              {
                type: 'image_url',
                image_url: {
                  url: `data:${mimeType};base64,${imageBase64}`,
                },
              },
            ],
          },
        ],
      },
      options
    );

    const content = completion.choices[0]?.message?.content;
    const parsedText = typeof content === 'string' ? content.trim() : '';

    return {
      parsedText,
      tokensUsed: {
        input: completion.usage?.prompt_tokens ?? 0,
        output: completion.usage?.completion_tokens ?? 0,
      },
    };
  }

  public async logGeneration(
    studentIdOrInput: string | AILogGenerationInput | null,
    type?: string,
    prompt?: unknown,
    response?: unknown,
    model?: string,
    tokensInput?: number,
    tokensOutput?: number,
    durationMs?: number,
    status?: string,
    errorMessage?: string,
    metadata?: AILogGenerationMetadataInput
  ): Promise<void> {
    const input = this.normalizeLogInput(
      studentIdOrInput,
      type,
      prompt,
      response,
      model,
      tokensInput,
      tokensOutput,
      durationMs,
      status,
      errorMessage,
      metadata
    );
    const normalizedMetadata = this.normalizeMetadata(input.type, input.model, input.metadata);

    await aiGenerationLogRepository.log({
      student_id: input.studentId ?? null,
      generation_type: input.type,
      purpose: normalizedMetadata.purpose ?? input.type,
      subject_scope: AI_SUBJECT_SCOPE_MATH,
      prompt_template: normalizedMetadata.promptTemplate ?? input.type,
      prompt_version: normalizedMetadata.promptVersion ?? 'v1',
      prompt_template_name: normalizedMetadata.promptTemplate ?? input.type,
      ai_model: normalizedMetadata.model ?? input.model ?? DEFAULT_MODEL,
      ai_provider: normalizedMetadata.provider ?? AI_PROVIDER_OPENAI,
      confidence: normalizedMetadata.confidence ?? null,
      safety_status: normalizedMetadata.safetyStatus ?? DEFAULT_AI_TRANSPARENCY_METADATA.safetyStatus,
      input_data: this.redactForLog({ prompt: input.prompt }) as JsonValue,
      output_data: this.redactForLog({ response: input.response }) as JsonValue,
      input_redacted: normalizedMetadata.inputRedacted ?? true,
      output_redacted: normalizedMetadata.outputRedacted ?? true,
      requires_approval: normalizedMetadata.requiresApproval ?? false,
      approval_id: normalizedMetadata.approvalId ?? null,
      approval_status: normalizedMetadata.approvalStatus ?? (normalizedMetadata.requiresApproval ? 'draft' : 'not_required'),
      actor: normalizedMetadata.actor ?? null,
      student_context: normalizedMetadata.studentContext ?? (input.studentId ? { student_id: input.studentId } : null),
      criteria: normalizedMetadata.criteria ?? null,
      explanation: normalizedMetadata.explanation ?? null,
      metadata: normalizedMetadata,
      tokens_input: input.tokensInput ?? null,
      tokens_output: input.tokensOutput ?? null,
      response_time_ms: input.durationMs ?? null,
      status: input.status as AIGenerationStatus,
      error_message: input.errorMessage ?? null,
    } as any);
  }

  public redactForLog(value: unknown): JsonValue {
    return this.redactValue(value, 0) as JsonValue;
  }

  private async createChatCompletionWithResilience(
    body: unknown,
    options: AICompletionOptions,
    client?: AIChatClient
  ): Promise<ChatCompletionResponse> {
    const effectiveClient = client ?? this.client;
    const maxRetries = this.normalizeNonNegativeInteger(
      options.maxRetries,
      this.defaultMaxRetries
    );
    const timeoutMs = this.normalizePositiveInteger(
      options.timeoutMs,
      this.defaultTimeoutMs
    );
    let lastError: unknown;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await effectiveClient.chat.completions.create(body, {
          timeout: timeoutMs,
          maxRetries: 0,
        });
      } catch (error) {
        lastError = error;

        if (!this.isRetryableProviderError(error) || attempt === maxRetries) {
          break;
        }

        await this.delay(this.retryDelayMs);
      }
    }

    if (options.fallbackContent !== undefined) {
      return {
        choices: [{ message: { content: options.fallbackContent } }],
        usage: { prompt_tokens: 0, completion_tokens: 0 },
      };
    }

    throw lastError;
  }

  private isRetryableProviderError(error: unknown): boolean {
    if (!(error instanceof Error)) {
      return false;
    }

    const status = (error as { status?: unknown }).status;
    if (typeof status === 'number') {
      // 408 is Request Timeout, 504 is Gateway Timeout - exclude them to prevent gateway cutoff on Vercel
      return status === 409 || status === 429 || (status >= 500 && status !== 504);
    }

    const code = String((error as { code?: unknown }).code ?? '').toLowerCase();
    // econnreset means connection was abruptly reset, which is safe to retry.
    // We explicitly exclude 'etimedout' and 'econnaborted' to avoid wasting time.
    if (code === 'econnreset') {
      return true;
    }

    const message = error.message.toLowerCase();
    if (message.includes('timeout')) {
      return false;
    }

    return message.includes('temporarily unavailable') || message.includes('rate limit');
  }

  private normalizePositiveInteger(value: number | undefined, fallback: number): number {
    return Number.isInteger(value) && value !== undefined && value > 0 ? value : fallback;
  }

  private normalizeNonNegativeInteger(value: number | undefined, fallback: number): number {
    return Number.isInteger(value) && value !== undefined && value >= 0 ? value : fallback;
  }

  private async delay(durationMs: number): Promise<void> {
    if (durationMs <= 0) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, durationMs));
  }

  private normalizeLogInput(
    studentIdOrInput: string | AILogGenerationInput | null,
    type?: string,
    prompt?: unknown,
    response?: unknown,
    model?: string,
    tokensInput?: number,
    tokensOutput?: number,
    durationMs?: number,
    status?: string,
    errorMessage?: string,
    metadata?: AILogGenerationMetadataInput
  ): Required<Pick<AILogGenerationInput, 'type' | 'status'>> & Omit<AILogGenerationInput, 'type' | 'status'> {
    if (studentIdOrInput && typeof studentIdOrInput === 'object') {
      return {
        studentId: studentIdOrInput.studentId ?? null,
        type: studentIdOrInput.type,
        prompt: studentIdOrInput.prompt,
        response: studentIdOrInput.response,
        model: studentIdOrInput.model ?? DEFAULT_MODEL,
        tokensInput: studentIdOrInput.tokensInput ?? null,
        tokensOutput: studentIdOrInput.tokensOutput ?? null,
        durationMs: studentIdOrInput.durationMs ?? null,
        status: studentIdOrInput.status ?? 'success',
        errorMessage: studentIdOrInput.errorMessage,
        metadata: studentIdOrInput.metadata,
      };
    }

    return {
      studentId: studentIdOrInput ?? null,
      type: type ?? 'unknown',
      prompt,
      response,
      model: model ?? DEFAULT_MODEL,
      tokensInput: tokensInput ?? null,
      tokensOutput: tokensOutput ?? null,
      durationMs: durationMs ?? null,
      status: status ?? 'success',
      errorMessage,
      metadata,
    };
  }

  private normalizeMetadata(type: string, model?: string | null, metadata?: AILogGenerationMetadataInput): AITransparencyMetadata {
    return {
      ...DEFAULT_AI_TRANSPARENCY_METADATA,
      purpose: metadata?.purpose ?? type,
      subjectScope: AI_SUBJECT_SCOPE_MATH,
      promptTemplate: metadata?.promptTemplate ?? metadata?.promptTemplate ?? type,
      promptVersion: metadata?.promptVersion ?? 'v1',
      provider: metadata?.provider ?? AI_PROVIDER_OPENAI,
      model: metadata?.model ?? model ?? DEFAULT_MODEL,
      confidence: metadata?.confidence ?? null,
      safetyStatus: metadata?.safetyStatus ?? DEFAULT_AI_TRANSPARENCY_METADATA.safetyStatus,
      inputRedacted: metadata?.inputRedacted ?? true,
      outputRedacted: metadata?.outputRedacted ?? true,
      requiresApproval: metadata?.requiresApproval ?? false,
      approvalId: metadata?.approvalId ?? null,
      approvalStatus: metadata?.approvalStatus ?? (metadata?.requiresApproval ? 'draft' : 'not_required'),
      actor: metadata?.actor ?? null,
      studentContext: metadata?.studentContext ?? null,
      criteria: metadata?.criteria ?? null,
      explanation: metadata?.explanation ?? null,
    };
  }

  private redactValue(value: unknown, depth: number): unknown {
    if (value === null || value === undefined) return null;
    if (typeof value === 'number' || typeof value === 'boolean') return value;
    if (typeof value === 'string') return this.redactString(value);
    if (depth >= 4) return '[REDACTED_DEPTH]';
    if (Array.isArray(value)) return value.slice(0, 20).map((item) => this.redactValue(item, depth + 1));
    if (typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(value as Record<string, unknown>).map(([key, item]) => [
          key,
          SENSITIVE_KEY_PATTERN.test(key) ? this.redactString(String(item ?? '')) : this.redactValue(item, depth + 1),
        ])
      );
    }
    return '[REDACTED]';
  }

  private redactString(value: string): string {
    const normalized = value.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[REDACTED_EMAIL]').replace(/\b(?:\+?84|0)\d{8,10}\b/g, '[REDACTED_PHONE]');
    if (normalized.length <= MAX_REDACTED_STRING_LENGTH) return normalized;
    return `${normalized.slice(0, MAX_REDACTED_STRING_LENGTH)}...[TRUNCATED_${normalized.length}]`;
  }

  private extractJson(content: string): string {
    const trimmedContent = content.trim();

    // Extract JSON from markdown code fences
    const fenceMatch = trimmedContent.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenceMatch) {
      return fenceMatch[1].trim();
    }

    return trimmedContent;
  }
}

export const aiService = new AIService();

export default aiService;
