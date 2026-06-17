import {
	SolverRequestModel,
	SolverRequestRepository,
} from "../models/solver.model";
import { ocrResultRepository } from "../models/ocr-result.model";
import type { JsonValue, SolverRequest } from "../types";
import { ForbiddenError, ValidationError } from "../utils/errors";
import aiService from "./ai.service";
import {
	GRAPH_BLOCK_GUIDELINES,
	MATH_FORMAT_GUIDELINES,
	MATH_FORMAT_JSON_GUIDELINES,
} from "../constants/math-format";
import {
	type AISafetyGuardResult,
	aiSafetyGuardService,
} from "./ai-safety-guard.service";
import { engagementTrackingService } from "./engagement.service";
import { solverAbuseDetectorService } from "./solver-abuse-detector.service";

const OCR_LOG_TYPE = "solver_image_ocr";
const OCR_PURPOSE = "ocr_math_problem";
const OCR_MODEL = "gpt-4o-mini";

const STORAGE_OCR_RETENTION_DAYS = Number(
	process.env.STORAGE_OCR_RETENTION_DAYS ?? 90,
);
const OCR_DAILY_QUOTA_PER_STUDENT = Number(
	process.env.OCR_DAILY_QUOTA_PER_STUDENT ?? 30,
);
const OCR_RETRY_BACKOFF_MS = 500;
const OCR_CONFIDENCE_HIGH_THRESHOLD = 0.85;
const OCR_CONFIDENCE_LOW_THRESHOLD = 0.5;

const FEATURE_BILLING_ENFORCEMENT =
	process.env.FEATURE_BILLING_ENFORCEMENT === "true";
const FREE_DAILY_QUOTA = Number(process.env.FREE_DAILY_QUOTA ?? 5);

/**
 * SolverService - Hint-first approach
 *
 * Progressive disclosure:
 * 1. First request → hint only (gợi mở, không đưa đáp án)
 * 2. Second request → more detailed hint with approach
 * 3. Third request → full solution with steps
 *
 * Tracks whether student is learning vs just getting answers:
 * - If student always requests full solution → flag dependency risk
 * - If student solves after hint → positive signal
 */
export type SolverStage = "hint" | "detailed_hint" | "full_solution";

export interface SolverSimilarProblem {
	problem: string;
	hint: string;
	difficulty: string;
	topic: string;
	answer?: string;
	solution_outline?: string;
}

export interface SolverSimilarProblemsMeta {
	message: string;
}

export interface SolverImageParseResponse {
	input_type: "image";
	image_url: string;
	parsed_text: string;
	ocr_status: "parsed" | "manual_required" | "failed";
	confidence: number;
	warnings: string[];
	ocr_result_id: string | null;
	remaining_quota: number;
	message: string;
}

export interface SolverResponse {
	stage: SolverStage;
	content: string;
	can_request_more: boolean;
	hint_count: number;
	dependency_warning: boolean;
	similar_problems: SolverSimilarProblem[];
	similar_problems_meta: SolverSimilarProblemsMeta;
}

export class SolverService {
	private readonly solverRepo: SolverRequestRepository;
	public ocrResultRepo: typeof ocrResultRepository;

	/** If student skips to full solution more than this rate, warn */
	private static readonly DEPENDENCY_THRESHOLD = 0.6;

	constructor() {
		this.solverRepo = new SolverRequestRepository();
		this.ocrResultRepo = ocrResultRepository;
	}

	private async enforceDailyFeatureLimit(input: {
		studentId: string;
		feature: string;
		usageToday: number;
		fallbackQuota: number;
		message: string;
		unlimitedFeature?: string;
	}): Promise<void> {
		const { billingService } = await import("./billing.service");
		if (input.unlimitedFeature) {
			const hasUnlimited = await billingService.hasEntitlement(
				input.studentId,
				input.unlimitedFeature,
			);
			if (hasUnlimited) return;
		}

		const entitlementLimit = await billingService.getEntitlementLimit(
			input.studentId,
			input.feature,
		);
		const quota = entitlementLimit.has_entitlement
			? entitlementLimit.limit
			: input.fallbackQuota;

		if (quota !== null && input.usageToday >= quota) {
			throw new ForbiddenError(input.message);
		}
	}

	/**
	 * Generate random math problem examples for a given grade level.
	 */
	public async generateExamples(
		gradeLevel: number,
		count: number,
	): Promise<string[]> {
		const systemPrompt = [
			"Bạn là gia sư toán cho học sinh Việt Nam.",
			`Học sinh đang học lớp ${gradeLevel}.`,
			`Hãy tạo ${count} bài toán ngẫu nhiên, đa dạng về chủ đề (số học, đại số, hình học, tổ hợp...), đúng chương trình GDPT 2018 của lớp ${gradeLevel}.`,
			"Mỗi bài toán là một câu ngắn gọn (1 dòng), dễ hiểu, đề bài phải đầy đủ dữ kiện và có lời giải xác định.",
			"Chỉ trả về JSON array của các string, không giải thích thêm.",
			'Ví dụ: ["Giải phương trình x² - 5x + 6 = 0", "Tìm diện tích hình tròn bán kính 5cm"]',
		].join("\n");

		const result = await aiService.generateJSON<string[]>(
			systemPrompt,
			`Tạo ${count} bài toán lớp ${gradeLevel} ngẫu nhiên.`,
			{ temperature: 0.9 },
		);

		return result.data;
	}

	public async parseImage(
		studentId: string,
		imageUrl: string,
		imagePath: string,
		mimeType: string,
		storageInfo?: {
			storage_key: string;
			storage_url: string;
			sha256: string;
			size_bytes: number;
		},
	): Promise<SolverImageParseResponse> {
		// ── Entitlement gate (billing enforcement) ──────────────────────────
		// When FEATURE_BILLING_ENFORCEMENT=true, enforce the image_ocr
		// entitlement limit. Users without a paid entitlement use the free quota.
		if (FEATURE_BILLING_ENFORCEMENT) {
			const usageToday = await this.ocrResultRepo.countSuccessfulToday(studentId);
			await this.enforceDailyFeatureLimit({
				studentId,
				feature: "image_ocr",
				usageToday,
				fallbackQuota: FREE_DAILY_QUOTA,
				message: "Đã hết lượt OCR ảnh bài toán hôm nay. Hãy nâng cấp gói dịch vụ để tăng hạn mức.",
			});
		}

		const startedAt = Date.now();
		let parsedText = "";
		let confidence = 0;
		let ocrStatus: SolverImageParseResponse["ocr_status"] = "manual_required";
		let warnings: string[] = [];
		let message =
			"Đã nhận ảnh. Vui lòng nhập hoặc chỉnh lại đề bài trước khi xin gợi ý.";
		let tokensInput = 0;
		let tokensOutput = 0;
		let aiModel: string | null = OCR_MODEL;
		let extractionFailed = false;

		// Attempt AI extraction with 1 retry on failure
		const extractionResult = await this.attemptExtractionWithRetry(
			imagePath,
			mimeType,
		);

		if (extractionResult.success) {
			parsedText = extractionResult.parsedText;
			tokensInput = extractionResult.tokensInput;
			tokensOutput = extractionResult.tokensOutput;
			confidence = this.computeConfidence(parsedText);

			// Classify confidence
			if (!parsedText || confidence < OCR_CONFIDENCE_LOW_THRESHOLD) {
				ocrStatus = "manual_required";
				message =
					"Đã nhận ảnh. Vui lòng nhập hoặc chỉnh lại đề bài trước khi xin gợi ý.";
			} else if (confidence < OCR_CONFIDENCE_HIGH_THRESHOLD) {
				ocrStatus = "parsed";
				warnings.push("low_confidence");
				message =
					"AI đã đọc được đề từ ảnh nhưng độ tin cậy thấp. Hãy kiểm tra lại đề.";
			} else {
				ocrStatus = "parsed";
				message =
					"AI đã đọc được đề từ ảnh. Vui lòng kiểm tra/chỉnh lại trước khi xin gợi ý.";
			}
		} else {
			// Both attempts failed
			extractionFailed = true;
			ocrStatus = "failed";
			confidence = 0;
			aiModel = null;
			message =
				"Không thể đọc ảnh lúc này. Vui lòng nhập đề bài thủ công.";
		}

		const durationMs = Date.now() - startedAt;

		// Persist OCRResult
		let ocrResultId: string | null = null;
		try {
			const expiresAt = new Date(
				Date.now() + STORAGE_OCR_RETENTION_DAYS * 24 * 60 * 60 * 1000,
			);
			const ocrResult = await this.ocrResultRepo.create({
				student_id: studentId,
				storage_key: storageInfo?.storage_key ?? imageUrl,
				storage_url: storageInfo?.storage_url ?? imageUrl,
				sha256: storageInfo?.sha256 ?? "",
				mime_type: mimeType,
				size_bytes: storageInfo?.size_bytes ?? 0,
				parsed_text: parsedText || null,
				confidence,
				status: ocrStatus === "failed" ? "failed" : ocrStatus,
				ai_model: aiModel,
				ai_tokens_input: tokensInput || null,
				ai_tokens_output: tokensOutput || null,
				duration_ms: durationMs,
				expires_at: expiresAt,
			} as any);
			ocrResultId = ocrResult._id?.toString() ?? null;
		} catch {
			// Non-critical: log but don't fail the response
		}

		// Log OCR generation for governance
		await this.logOcrGeneration({
			studentId,
			imageUrl,
			mimeType,
			parsed: Boolean(parsedText),
			durationMs,
			status: extractionFailed ? "error" : "success",
			tokensInput: tokensInput || null,
			tokensOutput: tokensOutput || null,
			errorMessage: extractionFailed
				? "AI extraction failed after retry"
				: undefined,
		});

		// Persist solver request (existing behavior)
		await this.solverRepo.create({
			student_id: studentId,
			lesson_id: null,
			input_type: "image",
			input_text: null,
			image_url: imageUrl,
			parsed_text: parsedText || null,
			ai_response: null,
			solution_steps: null,
			explanation: null,
			common_mistakes: null,
			ai_model: aiModel,
			tokens_used: tokensInput + tokensOutput || null,
			related_topic: null,
		} as any);

		// Calculate remaining quota
		const successfulToday =
			await this.ocrResultRepo.countSuccessfulToday(studentId);
		const remainingQuota = Math.max(
			0,
			OCR_DAILY_QUOTA_PER_STUDENT - successfulToday,
		);

		return {
			input_type: "image",
			image_url: imageUrl,
			parsed_text: parsedText,
			ocr_status: extractionFailed ? "manual_required" : ocrStatus,
			confidence,
			warnings,
			ocr_result_id: ocrResultId,
			remaining_quota: remainingQuota,
			message,
		};
	}

	/**
	 * Attempt AI text extraction with 1 retry on failure/timeout.
	 * Backoff: 500ms before retry.
	 */
	private async attemptExtractionWithRetry(
		imagePath: string,
		mimeType: string,
	): Promise<
		| { success: true; parsedText: string; tokensInput: number; tokensOutput: number }
		| { success: false; error: string }
	> {
		for (let attempt = 0; attempt < 2; attempt++) {
			try {
				const extraction = await aiService.extractTextFromImage(
					imagePath,
					mimeType,
					{
						temperature: 0,
						maxTokens: 600,
					},
				);
				return {
					success: true,
					parsedText: extraction.parsedText.trim(),
					tokensInput: extraction.tokensUsed.input,
					tokensOutput: extraction.tokensUsed.output,
				};
			} catch (error: unknown) {
				if (attempt === 0) {
					// Wait 500ms before retry
					await new Promise((resolve) => setTimeout(resolve, OCR_RETRY_BACKOFF_MS));
				} else {
					// Second attempt also failed
					const errorMessage =
						error instanceof Error
							? this.redactOcrErrorMessage(error.message)
							: "Unknown OCR extraction error";
					return { success: false, error: errorMessage };
				}
			}
		}
		// Should not reach here, but TypeScript needs it
		return { success: false, error: "Unexpected extraction failure" };
	}

	/**
	 * Compute confidence score [0, 1] based on parsed text quality.
	 * Heuristic: considers text length, presence of math-related content,
	 * and structural indicators of a valid math problem.
	 */
	private computeConfidence(parsedText: string): number {
		if (!parsedText || parsedText.trim().length === 0) {
			return 0;
		}

		const text = parsedText.trim();
		let score = 0;

		// Base score for having any non-empty text
		score += 0.4;

		// Length-based scoring (math problems typically 10-500 chars)
		if (text.length >= 5) score += 0.1;
		if (text.length >= 15) score += 0.1;

		// Math content indicators
		const mathPatterns = [
			/\d/, // contains numbers
			/[+\-×÷=<>≤≥≠]/, // math operators
			/[xyzabc]/i, // variables
			/(?:phương trình|bất phương trình|giải|tính|tìm|chứng minh|biểu thức|diện tích|chu vi|thể tích)/i, // Vietnamese math keywords
			/(?:equation|solve|find|prove|calculate)/i, // English math keywords
			/[²³√∫∑∏π]/, // math symbols
			/\d+\s*[+\-*/=]\s*\d+/, // arithmetic expressions
		];

		let mathIndicators = 0;
		for (const pattern of mathPatterns) {
			if (pattern.test(text)) mathIndicators++;
		}

		// Scale math indicators: each match adds up to 0.4 total
		score += Math.min(0.4, (mathIndicators / 3) * 0.4);

		return Math.min(1, Math.round(score * 100) / 100);
	}

	private async logOcrGeneration(input: {
		studentId: string;
		imageUrl: string;
		mimeType: string;
		parsed: boolean;
		durationMs: number;
		status: "success" | "error";
		tokensInput?: number | null;
		tokensOutput?: number | null;
		errorMessage?: string;
	}): Promise<void> {
		await aiService
			.logGeneration({
				studentId: input.studentId,
				type: OCR_LOG_TYPE,
				prompt: { imageUrl: "[redacted]", mimeType: input.mimeType },
				response: {
					parsedText: "[redacted]",
					ocrStatus: input.parsed ? "parsed" : "manual_required",
				},
				model: input.status === "success" ? OCR_MODEL : null,
				tokensInput: input.tokensInput ?? null,
				tokensOutput: input.tokensOutput ?? null,
				durationMs: input.durationMs,
				status: input.status,
				errorMessage: input.errorMessage,
				metadata: {
					purpose: OCR_PURPOSE,
					promptTemplate: OCR_LOG_TYPE,
					promptVersion: "v1",
					safetyStatus: "not_checked",
					inputRedacted: true,
					outputRedacted: true,
					requiresApproval: false,
					approvalStatus: "not_required",
					actor: { id: input.studentId, role: "student" },
					studentContext: { student_id: input.studentId },
					criteria: {
						mimeType: input.mimeType,
						ocrStatus: input.parsed ? "parsed" : "manual_required",
					},
					explanation: input.parsed
						? "OCR extracted text from a math problem image; raw image URL and OCR text are redacted in governance logs."
						: "OCR did not extract usable text from a math problem image; manual entry fallback remains required and raw image URL is redacted.",
				},
			})
			.catch(() => undefined);
	}

	private redactOcrErrorMessage(message: string): string {
		return message.replace(/https?:\/\/\S+/gi, "[redacted-url]");
	}

	/**
	 * Solve with progressive disclosure.
	 *
	 * @param studentId - Student ID
	 * @param sessionId - Current engagement session (for tracking)
	 * @param problemText - The math problem text
	 * @param stage - Which level of help to provide
	 * @param previousHints - Previous hints given for this problem (for context)
	 */
	public async solve(
		studentId: string,
		sessionId: string | null,
		problemText: string,
		stage: SolverStage = "hint",
		previousHints: string[] = [],
	): Promise<SolverResponse> {
		// ── Entitlement gate (billing enforcement) ──────────────────────────
		// When FEATURE_BILLING_ENFORCEMENT=true, enforce the AI Solver
		// entitlement limit. Users without a paid entitlement use the free quota.
		if (FEATURE_BILLING_ENFORCEMENT) {
			const usageToday = await this.solverRepo.countToday(studentId, "text");
			await this.enforceDailyFeatureLimit({
				studentId,
				feature: "ai_solver_requests",
				usageToday,
				fallbackQuota: FREE_DAILY_QUOTA,
				unlimitedFeature: "ai_solver_unlimited",
				message: "Đã hết lượt dùng AI Solver hôm nay. Hãy nâng cấp gói dịch vụ để tăng hạn mức.",
			});
		}

		const inputSafety = aiSafetyGuardService.evaluate({
			text: problemText,
			purpose: stage === "full_solution" ? "solver_solution" : "solver_hint",
			direction: "input",
		});

		if (inputSafety.decision === "block") {
			await this.logSafetyDecision(
				studentId,
				stage,
				problemText,
				null,
				inputSafety,
				"error",
				"Solver input blocked by AI safety guard.",
			);
			throw new ValidationError(
				"Nội dung cần hỗ trợ phải thuộc phạm vi học Toán và không chứa thông tin/yêu cầu không phù hợp.",
				{
					safety: aiSafetyGuardService.toMetadata(inputSafety),
				},
			);
		}

		// Track hint request in engagement
		if (sessionId) {
			await engagementTrackingService.trackEvent({
				session_id: sessionId,
				event_type: "hint_request",
				payload: {
					stage,
					problem_length: problemText.length,
					safety_decision: inputSafety.decision,
				} as unknown as JsonValue,
			});
		}

		const generation = await this.generateResponse(
			problemText,
			stage,
			previousHints,
		);
		const content = generation.content;
		const outputSafety = aiSafetyGuardService.evaluate({
			text: content,
			purpose: stage === "full_solution" ? "solver_solution" : "solver_hint",
			direction: "output",
		});
		const combinedSafety = this.combineSafety(inputSafety, outputSafety);

		if (outputSafety.decision === "block") {
			await this.logSafetyDecision(
				studentId,
				stage,
				problemText,
				content,
				combinedSafety,
				"error",
				"Solver output blocked by AI safety guard.",
			);
			throw new ValidationError(
				"Phản hồi AI bị chặn bởi bộ lọc an toàn. Vui lòng thử lại với đề Toán rõ ràng hơn.",
				{
					safety: aiSafetyGuardService.toMetadata(combinedSafety),
				},
			);
		}

		const similarProblemsResult =
			stage === "full_solution"
				? await this.generateSimilarProblems(problemText)
				: {
						problems: [] as SolverSimilarProblem[],
						message:
							"Bài luyện thêm sẽ xuất hiện sau khi em xem lời giải đầy đủ.",
					};

		await this.solverRepo.create({
			student_id: studentId,
			lesson_id: null,
			input_type: "text",
			input_text: problemText,
			image_url: null,
			parsed_text: null,
			ai_response: content,
			solution_steps: null,
			explanation: null,
			common_mistakes: null,
			ai_model: generation.model,
			tokens_used: generation.tokensUsed.input + generation.tokensUsed.output,
			related_topic: null,
			similar_problems: similarProblemsResult.problems,
			similar_problems_message: similarProblemsResult.message,
		} as any);

		await aiService.logGeneration({
			studentId,
			type: `solver_${stage}`,
			prompt: problemText,
			response: content,
			model: generation.model,
			tokensInput: generation.tokensUsed.input,
			tokensOutput: generation.tokensUsed.output,
			status: "success",
			metadata: {
				purpose: stage === "full_solution" ? "solver_solution" : "solver_hint",
				promptTemplate: "solver_progressive_disclosure",
				promptVersion: "v1",
				confidence: combinedSafety.confidence,
				safetyStatus: combinedSafety.safetyStatus,
				requiresApproval: combinedSafety.decision === "flag",
				approvalStatus:
					combinedSafety.decision === "flag" ? "draft" : "not_required",
				actor: { id: studentId, role: "student" },
				studentContext: { student_id: studentId },
				criteria: aiSafetyGuardService.toMetadata(combinedSafety),
				explanation: `Solver response generated with progressive disclosure stage ${stage}. Safety decision: ${combinedSafety.decision}.`,
			},
		});

		// Check dependency pattern and emit neutral abuse-risk signals fail-safe.
		const dependencyWarning = await this.checkDependencyRisk(studentId);
		await solverAbuseDetectorService
			.detectForStudent(studentId, {
				persistSignals: true,
				actor: { userId: studentId, role: "student" },
			})
			.catch(() => undefined);

		// Gamification integration: check and award badges on solver resolution (fail-soft)
		// Triggers on any stage (hint usage counts toward solver badges)
		try {
			const { gamificationService } = await import("./gamification.service");
			await gamificationService.checkAndAwardBadges(studentId, {
				type: "solver_resolved",
				stage,
			});
		} catch (error) {
			// Fail-soft: don't block solver response if gamification fails
			console.error(
				`[SolverService] Gamification checkAndAwardBadges failed for student=${studentId}:`,
				error,
			);
		}

		return {
			stage,
			content,
			can_request_more: stage !== "full_solution",
			hint_count: previousHints.length + 1,
			dependency_warning: dependencyWarning,
			similar_problems: similarProblemsResult.problems,
			similar_problems_meta: { message: similarProblemsResult.message },
		};
	}

	/**
	 * Generate similar practice problems after the full solution is requested.
	 * Falls back to an empty list if AI is unavailable or returns invalid data.
	 */
	public async generateSimilarProblems(
		problemText: string,
		topic?: string,
		difficulty?: string,
		count: number = 3,
	): Promise<{ problems: SolverSimilarProblem[]; message: string }> {
		const safeCount = Math.min(Math.max(Math.floor(count) || 3, 2), 3);
		const systemPrompt = [
			"Bạn là gia sư toán cho học sinh Việt Nam.",
			"Nhiệm vụ: tạo bài toán tương tự để học sinh luyện thêm sau khi đã xem lời giải.",
			"Tạo bài mới cùng dạng/kỹ năng với đề gốc nhưng đổi số liệu/ngữ cảnh, không sao chép y nguyên.",
			"Không tạo dữ kiện mơ hồ, không thêm nội dung ngoài toán học phổ thông.",
			MATH_FORMAT_JSON_GUIDELINES,
			`Trả về đúng JSON array gồm ${safeCount} object.`,
			'Mỗi object có schema: {"problem":"...","hint":"...","difficulty":"easy|medium|hard","topic":"...","answer":"..."} hoặc dùng "solution_outline" thay cho answer nếu đáp án quá dài.',
			"Hint chỉ gợi mở 1-2 câu, không giải toàn bộ.",
			topic ? `Chủ đề ưu tiên: ${topic}` : "",
			difficulty ? `Độ khó ưu tiên: ${difficulty}` : "",
		]
			.filter(Boolean)
			.join("\n");

		try {
			const result = await aiService.generateJSON<unknown>(
				systemPrompt,
				`Đề gốc: ${problemText}\n\nHãy tạo ${safeCount} bài tương tự để luyện thêm.`,
				{ temperature: 0.6, maxTokens: 900 },
			);
			const problems = this.normalizeSimilarProblems(result.data).slice(
				0,
				safeCount,
			);

			if (problems.length === 0) {
				return {
					problems: [],
					message: "Chưa tạo được bài luyện thêm từ AI. Em có thể thử lại sau.",
				};
			}

			return {
				problems,
				message: "Đã tạo bài tương tự để em luyện thêm.",
			};
		} catch (error: unknown) {
			return {
				problems: [],
				message:
					"AI chưa khả dụng để tạo bài luyện thêm. Không có bài mẫu giả được thêm vào.",
			};
		}
	}

	private normalizeSimilarProblems(value: unknown): SolverSimilarProblem[] {
		if (!Array.isArray(value)) return [];

		return value
			.map((item): SolverSimilarProblem | null => {
				if (!item || typeof item !== "object") return null;
				const raw = item as Record<string, unknown>;
				const problem =
					typeof raw.problem === "string" ? raw.problem.trim() : "";
				const hint = typeof raw.hint === "string" ? raw.hint.trim() : "";
				const difficulty =
					typeof raw.difficulty === "string" ? raw.difficulty.trim() : "medium";
				const topic =
					typeof raw.topic === "string" ? raw.topic.trim() : "Toán học";
				const answer = typeof raw.answer === "string" ? raw.answer.trim() : "";
				const solutionOutline =
					typeof raw.solution_outline === "string"
						? raw.solution_outline.trim()
						: "";

				if (!problem || !hint) return null;

				return {
					problem,
					hint,
					difficulty: difficulty || "medium",
					topic: topic || "Toán học",
					...(answer ? { answer } : {}),
					...(solutionOutline ? { solution_outline: solutionOutline } : {}),
				};
			})
			.filter((item): item is SolverSimilarProblem => item !== null);
	}

	private async logSafetyDecision(
		studentId: string,
		stage: SolverStage,
		prompt: string,
		response: string | null,
		safety: AISafetyGuardResult,
		status: "success" | "error" | "timeout" | "rate_limited",
		explanation: string,
	): Promise<void> {
		await aiService.logGeneration({
			studentId,
			type: `solver_${stage}_safety`,
			prompt,
			response,
			status,
			metadata: {
				purpose: stage === "full_solution" ? "solver_solution" : "solver_hint",
				promptTemplate: "solver_progressive_disclosure_safety_guard",
				promptVersion: "v1",
				confidence: safety.confidence,
				safetyStatus: safety.safetyStatus,
				requiresApproval: safety.decision === "flag",
				approvalStatus: safety.decision === "flag" ? "draft" : "not_required",
				actor: { id: studentId, role: "student" },
				studentContext: { student_id: studentId },
				criteria: aiSafetyGuardService.toMetadata(safety),
				explanation,
			},
		});
	}

	private combineSafety(
		inputSafety: AISafetyGuardResult,
		outputSafety: AISafetyGuardResult,
	): AISafetyGuardResult {
		const decisions = [inputSafety.decision, outputSafety.decision];
		const decision = decisions.includes("block")
			? "block"
			: decisions.includes("flag")
				? "flag"
				: "allow";
		return {
			decision,
			safetyStatus:
				decision === "block"
					? "blocked"
					: decision === "flag"
						? "flagged"
						: "passed",
			reasons: [...new Set([...inputSafety.reasons, ...outputSafety.reasons])],
			confidence: Math.max(inputSafety.confidence, outputSafety.confidence),
			riskLevel:
				decision === "block" ? "high" : decision === "flag" ? "medium" : "low",
		};
	}

	/**
	 * Generate AI response at the appropriate disclosure level.
	 */
	private async generateResponse(
		problemText: string,
		stage: SolverStage,
		previousHints: string[],
	): Promise<{
		content: string;
		model: string;
		tokensUsed: { input: number; output: number };
	}> {
		const stageInstructions: Record<SolverStage, string> = {
			hint: [
				"CHỈ đưa gợi ý nhẹ, KHÔNG đưa đáp án hoặc lời giải.",
				"Hãy đặt câu hỏi dẫn dắt để học sinh tự suy nghĩ.",
				'Ví dụ: "Em thử nghĩ xem công thức nào liên quan đến...", "Bước đầu tiên em cần làm gì?"',
				"Tối đa 2-3 câu.",
			].join("\n"),
			detailed_hint: [
				"Đưa gợi ý chi tiết hơn về phương pháp giải, nhưng VẪN KHÔNG đưa đáp án cuối cùng.",
				"Chỉ ra hướng tiếp cận cụ thể, công thức cần dùng, và bước đầu tiên.",
				"Nếu học sinh đã nhận gợi ý trước đó, hãy xây dựng dựa trên đó.",
				previousHints.length > 0
					? `Gợi ý trước đó: ${previousHints.join(" | ")}`
					: "",
			].join("\n"),
			full_solution: [
				"Đưa lời giải đầy đủ với từng bước rõ ràng.",
				"Giải thích TẠI SAO mỗi bước được thực hiện.",
				"Cuối cùng, đưa ra lỗi phổ biến mà học sinh hay mắc.",
			].join("\n"),
		};

		const systemPrompt = [
			"Bạn là gia sư toán cho học sinh Việt Nam.",
			"Mục tiêu: giúp học sinh TỰ giải được bài, không phải đưa đáp án.",
			MATH_FORMAT_GUIDELINES,
			stage === "full_solution" ? GRAPH_BLOCK_GUIDELINES : "",
			"Nếu đề bài có vẻ quá thấp hoặc quá cao so với cấp lớp/ngữ cảnh, hãy nêu nhẹ rằng đây là phần ôn nền tảng hoặc mở rộng, không kết luận sai năng lực học sinh.",
			stageInstructions[stage],
		]
			.filter(Boolean)
			.join("\n");

		const model = "gpt-4o-mini";

		try {
			const result = await aiService.generateCompletion(
				systemPrompt,
				`Bài toán: ${problemText}`,
				{
					temperature: 0.3,
					model,
				},
			);

			return { content: result.content, model, tokensUsed: result.tokensUsed };
		} catch (error: unknown) {
			if (!this.isDevSolverFallbackEnabled()) {
				throw error;
			}

			const content = this.generateDevFallbackResponse(
				problemText,
				stage,
				previousHints,
			);
			return {
				content,
				model: "dev-local-solver-fallback",
				tokensUsed: {
					input:
						this.estimateTokens(systemPrompt) +
						this.estimateTokens(problemText),
					output: this.estimateTokens(content),
				},
			};
		}
	}

	private isDevSolverFallbackEnabled(): boolean {
		const enabled = ["1", "true", "yes", "on", "enabled"].includes(
			String(process.env.FEATURE_DEV_SOLVER_FALLBACK || "")
				.trim()
				.toLowerCase(),
		);
		return enabled && process.env.NODE_ENV !== "production";
	}

	private generateDevFallbackResponse(
		problemText: string,
		stage: SolverStage,
		previousHints: string[],
	): string {
		const normalized = problemText.trim();
		const linearMatch = normalized.match(
			/(-?\d+)\s*x\s*([+-])\s*(-?\d+)\s*=\s*(-?\d+)/i,
		);

		if (linearMatch) {
			const coefficient = Number(linearMatch[1]);
			const constant =
				Number(linearMatch[3]) * (linearMatch[2] === "-" ? -1 : 1);
			const target = Number(linearMatch[4]);

			if (stage === "hint") {
				return "Gợi ý local dev: Em hãy đưa hạng tử không chứa x sang vế phải trước. Sau đó chia cả hai vế cho hệ số của x.";
			}

			if (stage === "detailed_hint") {
				const prior =
					previousHints.length > 0
						? ` Dựa trên gợi ý trước: ${previousHints.slice(-2).join(" | ")}.`
						: "";
				return `Gợi ý chi tiết local dev: Với dạng ${coefficient}x ${constant >= 0 ? "+" : "-"} ${Math.abs(constant)} = ${target}, hãy tính ${target} - (${constant}) rồi chia cho ${coefficient}.${prior}`;
			}

			const solution = (target - constant) / coefficient;
			return `Lời giải local dev:\n1. Bắt đầu từ ${normalized}.\n2. Chuyển hạng tử tự do sang vế phải: ${coefficient}x = ${target} - (${constant}) = ${target - constant}.\n3. Chia hai vế cho ${coefficient}: x = ${solution}.\nLỗi hay gặp: quên đổi dấu khi chuyển vế hoặc quên chia cho hệ số của x.`;
		}

		if (stage === "full_solution") {
			return "Lời giải local dev: Hãy xác định dữ kiện đã cho, chọn công thức Toán phù hợp, biến đổi từng bước và kiểm tra lại kết quả bằng cách thay vào đề. Lỗi hay gặp là bỏ qua điều kiện hoặc tính nhẩm quá nhanh.";
		}

		if (stage === "detailed_hint") {
			return "Gợi ý chi tiết local dev: Em hãy gạch chân đại lượng cần tìm, viết công thức liên quan, rồi thay số theo từng bước. Nếu đã có gợi ý trước, hãy tiếp tục từ bước biến đổi đầu tiên.";
		}

		return "Gợi ý local dev: Em hãy xác định đề hỏi gì và công thức/toán tính nào liên quan. Thử viết bước đầu tiên thay vì tìm ngay đáp án.";
	}

	private estimateTokens(value: string): number {
		return Math.max(1, Math.ceil(value.length / 4));
	}

	/**
	 * Check if student has a pattern of skipping to full solutions.
	 * Returns true if dependency risk detected.
	 */
	private async checkDependencyRisk(studentId: string): Promise<boolean> {
		// Look at recent solver requests
		const recent = (await SolverRequestModel.find({ student_id: studentId })
			.sort({ createdAt: -1 })
			.limit(10)
			.exec()) as unknown as SolverRequest[];

		if (recent.length < 5) return false; // not enough data

		// Count how many went straight to full solution (no hints)
		// We check if ai_response contains solution markers
		// In practice, we'd store the stage in the DB. For now, use heuristic.
		const fullSolutionCount = recent.filter((r) => {
			const response = r.ai_response ?? "";
			return response.length > 500; // full solutions are typically longer
		}).length;

		return (
			fullSolutionCount / recent.length > SolverService.DEPENDENCY_THRESHOLD
		);
	}
}

export const solverService = new SolverService();
export default solverService;
