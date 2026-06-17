import { config } from "../config";

export interface EmailMessage {
	to: string;
	subject: string;
	text: string;
}

export interface PasswordResetEmailMessage extends EmailMessage {}

export interface TemplatedEmailInput {
	template_id: string;
	to: string;
	vars: Record<string, unknown>;
	subject?: string;
	html?: string;
	text?: string;
}

export interface SendTemplatedResult {
	success: boolean;
	provider_message_id: string | null;
	error_code: string | null;
}

type EmailProvider = "console" | "http";

type FetchFn = typeof fetch;

export interface EmailServiceOptions {
	provider: EmailProvider;
	from: string;
	replyTo?: string;
	apiUrl: string;
	apiKey: string;
	fetchFn?: FetchFn;
	timeoutMs?: number;
	maxRetries?: number;
	retryDelayMs?: number;
}

export interface EmailProviderSmokeEvidence {
	provider: EmailProvider;
	environment: string;
	status: "passed";
	source: string;
	generatedAt: string;
}

export interface EmailProviderSmokeEvidenceInput {
	provider: EmailProvider;
	environment: string;
	status: "passed";
	source: string;
}

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_RETRIES = 1;
const DEFAULT_RETRY_DELAY_MS = 200;

const SEND_TEMPLATED_MAX_RETRIES = 3;
const SEND_TEMPLATED_BASE_DELAY_MS = 200;
const SEND_TEMPLATED_BACKOFF_FACTOR = 4;

export class EmailService {
	private readonly provider: EmailProvider;
	private readonly from: string;
	private readonly replyTo: string;
	private readonly apiUrl: string;
	private readonly apiKey: string;
	private readonly fetchFn: FetchFn;
	private readonly timeoutMs: number;
	private readonly maxRetries: number;
	private readonly retryDelayMs: number;

	constructor(options: EmailServiceOptions = config.email) {
		this.provider = options.provider;
		this.from = options.from;
		this.replyTo = options.replyTo ?? "";
		this.apiUrl = options.apiUrl;
		this.apiKey = options.apiKey;
		this.fetchFn = options.fetchFn ?? fetch;
		this.timeoutMs = normalizePositiveInteger(
			options.timeoutMs,
			DEFAULT_TIMEOUT_MS,
		);
		this.maxRetries = normalizeNonNegativeInteger(
			options.maxRetries,
			DEFAULT_MAX_RETRIES,
		);
		this.retryDelayMs = normalizeNonNegativeInteger(
			options.retryDelayMs,
			DEFAULT_RETRY_DELAY_MS,
		);
	}

	public async sendPasswordResetEmail(
		message: PasswordResetEmailMessage,
	): Promise<void> {
		await this.send({
			...message,
			subject: message.subject || "MathAI password reset",
		});
	}

	/**
	 * Send a templated email via the configured HTTP provider.
	 * Implements 3 retries with exponential backoff (200ms → 800ms → 3.2s) for 5xx/timeout.
	 * Does NOT expose raw provider errors — returns sanitized error_code instead.
	 */
	public async sendTemplated(
		input: TemplatedEmailInput,
	): Promise<SendTemplatedResult> {
		if (this.provider === "console") {
			console.info("[email:console:templated]", {
				from: this.from,
				replyTo: this.replyTo,
				to: input.to,
				template_id: input.template_id,
				vars: input.vars,
			});
			return {
				success: true,
				provider_message_id: `console_${Date.now()}`,
				error_code: null,
			};
		}

		return this.sendTemplatedHttp(input);
	}

	private async sendTemplatedHttp(
		input: TemplatedEmailInput,
	): Promise<SendTemplatedResult> {
		const requestBody = JSON.stringify({
			from: this.from,
			reply_to: this.replyTo || undefined,
			to: input.to,
			template_id: input.template_id,
			template_vars: input.vars,
			subject: input.subject,
			html: input.html,
			text: input.text,
		});

		const headers: Record<string, string> = {
			"Content-Type": "application/json",
			Authorization: `Bearer ${this.apiKey}`,
		};
		if (this.replyTo) {
			headers["X-Reply-To"] = this.replyTo;
		}

		let lastError: unknown;

		for (let attempt = 0; attempt <= SEND_TEMPLATED_MAX_RETRIES; attempt += 1) {
			const controller = new AbortController();
			const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

			try {
				const response = await this.fetchFn(this.apiUrl, {
					method: "POST",
					headers,
					body: requestBody,
					signal: controller.signal,
				});

				if (response.ok) {
					const data = await safeParseJson(response);
					return {
						success: true,
						provider_message_id: extractMessageId(data),
						error_code: null,
					};
				}

				const error = new EmailProviderError(
					`Email provider failed with status ${response.status}`,
					response.status,
				);

				if (!error.retryable || attempt === SEND_TEMPLATED_MAX_RETRIES) {
					return {
						success: false,
						provider_message_id: null,
						error_code: buildSafeErrorCode(error),
					};
				}
				lastError = error;
			} catch (error) {
				lastError = error;
				if (
					!isRetryableEmailError(error) ||
					attempt === SEND_TEMPLATED_MAX_RETRIES
				) {
					return {
						success: false,
						provider_message_id: null,
						error_code: buildSafeErrorCode(error),
					};
				}
			} finally {
				clearTimeout(timeoutId);
			}

			if (attempt < SEND_TEMPLATED_MAX_RETRIES) {
				const delayMs =
					SEND_TEMPLATED_BASE_DELAY_MS *
					Math.pow(SEND_TEMPLATED_BACKOFF_FACTOR, attempt);
				await delay(delayMs);
			}
		}

		return {
			success: false,
			provider_message_id: null,
			error_code: buildSafeErrorCode(lastError),
		};
	}

	private async send(message: EmailMessage): Promise<void> {
		if (this.provider === "console") {
			this.logConsoleMessage(message);
			return;
		}

		await this.sendHttpMessage(message);
	}

	private logConsoleMessage(message: EmailMessage): void {
		console.info("[email:console]", {
			from: this.from,
			to: message.to,
			subject: message.subject,
			text: message.text,
		});
	}

	private async sendHttpMessage(message: EmailMessage): Promise<void> {
		const requestBody = JSON.stringify({
			from: this.from,
			to: message.to,
			subject: message.subject,
			text: message.text,
		});

		let lastError: unknown;

		for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
			const controller = new AbortController();
			const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);
			try {
				const response = await this.fetchFn(this.apiUrl, {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Authorization: `Bearer ${this.apiKey}`,
					},
					body: requestBody,
					signal: controller.signal,
				});

				if (response.ok) {
					return;
				}

				const error = new EmailProviderError(
					`Email provider failed with status ${response.status}`,
					response.status,
				);
				if (!error.retryable || attempt === this.maxRetries) {
					throw error;
				}
				lastError = error;
			} catch (error) {
				lastError = error;
				if (!isRetryableEmailError(error) || attempt === this.maxRetries) {
					throw buildSafeEmailError(error, this.timeoutMs);
				}
			} finally {
				clearTimeout(timeoutId);
			}

			if (attempt < this.maxRetries && this.retryDelayMs > 0) {
				await delay(this.retryDelayMs);
			}
		}

		throw buildSafeEmailError(lastError, this.timeoutMs);
	}
}

export function buildEmailProviderSmokeEvidence(
	input: EmailProviderSmokeEvidenceInput,
): EmailProviderSmokeEvidence {
	return {
		provider: input.provider,
		environment: input.environment,
		status: input.status,
		source: input.source,
		generatedAt: new Date().toISOString(),
	};
}

function normalizePositiveInteger(
	value: number | undefined,
	fallback: number,
): number {
	return typeof value === "number" && Number.isInteger(value) && value > 0
		? value
		: fallback;
}

function normalizeNonNegativeInteger(
	value: number | undefined,
	fallback: number,
): number {
	return typeof value === "number" && Number.isInteger(value) && value >= 0
		? value
		: fallback;
}

class EmailProviderError extends Error {
	public readonly status: number;
	public readonly retryable: boolean;

	constructor(message: string, status: number) {
		super(message);
		this.name = "EmailProviderError";
		this.status = status;
		this.retryable =
			status === 408 ||
			status === 409 ||
			status === 425 ||
			status === 429 ||
			status >= 500;
	}
}

function isRetryableEmailError(error: unknown): boolean {
	if (!(error instanceof Error)) {
		return false;
	}

	const errorWithCode = error as Error & { code?: string; name?: string };
	if (error instanceof EmailProviderError) {
		return error.retryable;
	}

	if (errorWithCode.name === "AbortError") {
		return true;
	}

	return (
		errorWithCode.code === "ETIMEDOUT" ||
		errorWithCode.code === "ECONNRESET" ||
		errorWithCode.code === "ECONNABORTED" ||
		/timeout|temporarily unavailable|network/i.test(error.message)
	);
}

function buildSafeEmailError(error: unknown, timeoutMs: number): Error {
	if (error instanceof Error) {
		if (error.name === "AbortError") {
			return new Error(`Email provider request timed out after ${timeoutMs}ms`);
		}

		if (/status \d{3}/i.test(error.message)) {
			return error;
		}
	}

	return new Error("Email provider request failed");
}

function buildSafeErrorCode(error: unknown): string {
	if (error instanceof EmailProviderError) {
		if (error.status >= 500) {
			return "provider_unavailable";
		}
		if (error.status === 429) {
			return "rate_limited";
		}
		if (error.status >= 400) {
			return "request_rejected";
		}
	}

	if (error instanceof Error) {
		if (error.name === "AbortError") {
			return "timeout";
		}
		const errorWithCode = error as Error & { code?: string };
		if (
			errorWithCode.code === "ETIMEDOUT" ||
			errorWithCode.code === "ECONNRESET" ||
			errorWithCode.code === "ECONNABORTED"
		) {
			return "network_error";
		}
	}

	return "delivery_failed";
}

async function safeParseJson(response: Response): Promise<unknown> {
	try {
		return await response.json();
	} catch {
		return null;
	}
}

function extractMessageId(data: unknown): string | null {
	if (data && typeof data === "object") {
		const obj = data as Record<string, unknown>;
		if (typeof obj.id === "string") return obj.id;
		if (typeof obj.messageId === "string") return obj.messageId;
		if (typeof obj.message_id === "string") return obj.message_id;
	}
	return null;
}

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => {
		setTimeout(resolve, ms);
	});
}

export const emailService = new EmailService();

export default emailService;
