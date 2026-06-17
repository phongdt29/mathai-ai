import mongoose from "mongoose";
import { config } from "../config";
import { MATH_FORMAT_JSON_GUIDELINES } from "../constants/math-format";
import {
	type ILesson,
	type ILessonExercise,
	type ILessonExerciseAnswer,
	type ILessonQuizResult,
	LessonExerciseModel,
	LessonExerciseAnswerModel,
	LessonModel,
	LessonQuizResultModel,
	LessonRecommendationModel,
	lessonExerciseAnswerRepository,
	lessonExerciseRepository,
	lessonQuizResultRepository,
	lessonRepository,
} from "../models/lesson.model";
import { StudentProgressModel, TopicMasteryModel } from "../models/progress.model";
import { studentProfileRepository } from "../models/student.model";
import { AppError, NotFoundError, ValidationError } from "../utils/errors";
import { getStudentProfileId } from "../utils/helpers";
import { decidePostQuizAction } from "../utils/post-quiz-decision";
import { calculatePercentage, validateEarnedPoints } from "../utils/scoring";
import { aiService } from "./ai.service";
import { pointService } from "./point.service";

const ALLOWED_ANSWER_TYPES = new Set([
	"multiple_choice",
	"short_answer",
	"essay",
]);
const MAX_GENERATED_EXERCISES = 5;
const LESSON_QUIZ_PASS_PERCENTAGE = 70;

type LessonExercisePayload = {
	order_index?: unknown;
	topic?: unknown;
	difficulty_level?: unknown;
	answer_type?: unknown;
	question_text?: unknown;
	choices?: unknown;
	correct_answer?: unknown;
	solution_steps?: unknown;
	explanation?: unknown;
};

type LessonExerciseAIResponse = {
	exercises?: LessonExercisePayload[];
};

type NormalizedExercise = {
	topic: string | null;
	difficulty_level: string | null;
	question_text: string;
	answer_type: string;
	choices: string[] | null;
	correct_answer: string;
	solution_steps: string[] | string | null;
	explanation: string | null;
	order_index: number;
};

export type LessonWithExercisesDTO = ReturnType<typeof serializeLesson> & {
	exercises: ReturnType<typeof serializeExercise>[];
};

export interface GenerateLessonExercisesResult {
	lesson: LessonWithExercisesDTO;
	generated: ReturnType<typeof serializeExercise>[];
	source: "existing" | "generated";
}

export interface CreateLessonQuizResultInput {
	score: number;
	max_score: number;
	total_questions?: number;
	correct_answers?: number;
	duration_seconds?: number | null;
	ai_feedback?: string | null;
	/** @deprecated Ignored. Pass/fail is derived server-side from percentage. */
	passed?: boolean;
	started_at?: string | Date | null;
	submitted_at?: string | Date | null;
	attempt_id?: string | null;
	idempotency_key?: string | null;
	metadata?: Record<string, unknown>;
}

export interface LessonCompletionSideEffects {
	lesson_completed: boolean;
	progress_updated: boolean;
	mastery_updated: boolean;
	recommendation_completed: boolean;
}

export interface CreateLessonQuizResultResponse extends LessonCompletionSideEffects {
	result: ReturnType<typeof serializeQuizResult>;
	ledger: unknown;
	idempotent: boolean;
}

export interface SubmitLessonExerciseAnswerInput {
	exercise_id: string;
	student_answer?: string | null;
	selected_choice?: string | null;
}

export interface SubmitLessonExerciseAttemptInput {
	answers: SubmitLessonExerciseAnswerInput[];
	duration_seconds?: number | null;
	started_at?: string | Date | null;
	submitted_at?: string | Date | null;
	idempotency_key?: string | null;
	attempt_id?: string | null;
}

export interface SubmitLessonExerciseAttemptResponse extends LessonCompletionSideEffects {
	result: ReturnType<typeof serializeQuizResult>;
	answers: ReturnType<typeof serializeExerciseAnswer>[];
	ledger: unknown;
	idempotent: boolean;
}

export interface LessonExerciseAttemptHistoryItem {
	result: ReturnType<typeof serializeQuizResult>;
	answers: ReturnType<typeof serializeExerciseAnswer>[];
}

export interface LessonQuizResultWriter {
	createQuizResult(
		data: Partial<ILessonQuizResult>,
		session?: mongoose.ClientSession,
	): Promise<ILessonQuizResult>;
}

export interface LessonPointRecorder {
	recordLessonResult(
		input: Parameters<typeof pointService.recordLessonResult>[0],
	): ReturnType<typeof pointService.recordLessonResult>;
}

function serializeLesson(lesson: ILesson | Record<string, any>) {
	const raw =
		typeof (lesson as any).toObject === "function"
			? (lesson as any).toObject()
			: lesson;
	return {
		...raw,
		_id: raw._id?.toString?.() ?? raw._id,
		curriculum_id: raw.curriculum_id?.toString?.() ?? raw.curriculum_id,
		module_id: raw.module_id?.toString?.() ?? raw.module_id,
		student_id: raw.student_id?.toString?.() ?? raw.student_id,
		ai_tutor_id: raw.ai_tutor_id?.toString?.() ?? raw.ai_tutor_id,
	};
}

function serializeExercise(exercise: ILessonExercise | Record<string, any>) {
	const raw =
		typeof (exercise as any).toObject === "function"
			? (exercise as any).toObject()
			: exercise;
	return {
		...raw,
		_id: raw._id?.toString?.() ?? raw._id,
		lesson_id: raw.lesson_id?.toString?.() ?? raw.lesson_id,
	};
}

function serializeExerciseAnswer(
	answer: ILessonExerciseAnswer | Record<string, any>,
) {
	const raw =
		typeof (answer as any).toObject === "function"
			? (answer as any).toObject()
			: answer;
	return {
		...raw,
		_id: raw._id?.toString?.() ?? raw._id,
		exercise_id: raw.exercise_id?.toString?.() ?? raw.exercise_id,
		lesson_id: raw.lesson_id?.toString?.() ?? raw.lesson_id,
		student_id: raw.student_id?.toString?.() ?? raw.student_id,
		quiz_result_id: raw.quiz_result_id?.toString?.() ?? raw.quiz_result_id,
	};
}

function serializeQuizResult(result: ILessonQuizResult | Record<string, any>) {
	const raw =
		typeof (result as any).toObject === "function"
			? (result as any).toObject()
			: result;
	return {
		...raw,
		_id: raw._id?.toString?.() ?? raw._id,
		lesson_id: raw.lesson_id?.toString?.() ?? raw.lesson_id,
		student_id: raw.student_id?.toString?.() ?? raw.student_id,
		// Module 5: đề xuất rõ ràng sau quiz (≥70% học tiếp / <70% ôn lại).
		next_action: decidePostQuizAction(raw.percentage),
	};
}

function textOrNull(value: unknown): string | null {
	if (typeof value !== "string") return null;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
}

function requiredText(value: unknown, field: string): string {
	const text = textOrNull(value);
	if (!text) {
		throw new AppError(
			`AI trả về bài tập thiếu trường bắt buộc: ${field}`,
			422,
		);
	}
	return text;
}

function normalizeChoices(
	answerType: string,
	choices: unknown,
): string[] | null {
	if (answerType !== "multiple_choice") {
		return Array.isArray(choices)
			? choices
					.map((choice) => String(choice).trim())
					.filter(Boolean)
					.slice(0, 4)
			: null;
	}

	if (!Array.isArray(choices)) {
		throw new AppError(
			"AI trả về bài tập trắc nghiệm thiếu danh sách lựa chọn",
			422,
		);
	}

	const normalized = choices
		.map((choice) => String(choice).trim())
		.filter(Boolean);
	if (normalized.length !== 4) {
		throw new AppError("Bài tập trắc nghiệm phải có đúng 4 lựa chọn", 422);
	}

	return normalized;
}

function normalizeSolutionSteps(value: unknown): string[] | string | null {
	if (Array.isArray(value)) {
		const steps = value.map((step) => String(step).trim()).filter(Boolean);
		return steps.length > 0 ? steps : null;
	}
	return textOrNull(value);
}

function normalizeAIExercises(
	data: LessonExerciseAIResponse,
	lessonId: string,
): Omit<NormalizedExercise, "lesson_id">[] {
	if (!data || !Array.isArray(data.exercises)) {
		throw new AppError("AI không trả về đúng schema exercises", 422);
	}

	const exercises = data.exercises
		.slice(0, MAX_GENERATED_EXERCISES)
		.map((exercise, index) => {
			const answerType = requiredText(exercise.answer_type, "answer_type");
			if (!ALLOWED_ANSWER_TYPES.has(answerType)) {
				throw new AppError(`answer_type không hợp lệ: ${answerType}`, 422);
			}

			return {
				topic: textOrNull(exercise.topic),
				difficulty_level: textOrNull(exercise.difficulty_level),
				question_text: requiredText(exercise.question_text, "question_text"),
				answer_type: answerType,
				choices: normalizeChoices(answerType, exercise.choices),
				correct_answer: requiredText(exercise.correct_answer, "correct_answer"),
				solution_steps: normalizeSolutionSteps(exercise.solution_steps),
				explanation: textOrNull(exercise.explanation),
				order_index:
					Number.isInteger(exercise.order_index) &&
					Number(exercise.order_index) > 0
						? Number(exercise.order_index)
						: index + 1,
			};
		});

	if (exercises.length === 0) {
		throw new AppError("AI không tạo được bài tập nào cho bài học này", 422);
	}

	if (!mongoose.Types.ObjectId.isValid(lessonId)) {
		throw new ValidationError("ID bài học không hợp lệ");
	}

	return exercises;
}

function buildExercisePrompt(lesson: ILesson): {
	systemPrompt: string;
	userPrompt: string;
} {
	const lessonData = serializeLesson(lesson);
	const systemPrompt = [
		"Bạn là giáo viên Toán Việt Nam giàu kinh nghiệm.",
		"Nhiệm vụ: tạo bài tập thực tế bằng tiếng Việt, bám sát bài học, có độ khó tăng dần, giúp học sinh hoàn thành nội dung bài học.",
		"Bài tập phải đúng cấp lớp/chủ đề của bài học theo GDPT 2018; không tạo bài quá dễ hoặc lệch xuống kiến thức lớp dưới nếu lesson không yêu cầu ôn nền tảng.",
		MATH_FORMAT_JSON_GUIDELINES,
		'Chỉ trả JSON hợp lệ theo schema: { "exercises": [{ "order_index", "topic", "difficulty_level", "answer_type", "question_text", "choices", "correct_answer", "solution_steps", "explanation" }] }.',
		"answer_type chỉ được là multiple_choice, short_answer hoặc essay. Với multiple_choice, choices phải có đúng 4 lựa chọn và correct_answer trùng khớp 100% với một lựa chọn.",
		"question_text và correct_answer là bắt buộc. Tạo tối đa 5 bài tập.",
	].join("\n");

	const userPrompt = JSON.stringify({
		lesson_title: lessonData.lesson_title,
		lesson_objective: lessonData.lesson_objective,
		theory_content: lessonData.theory_content,
		estimated_minutes: lessonData.estimated_minutes,
		instruction:
			"Tạo 3-5 bài tập toán thực tế, ưu tiên tình huống đời sống Việt Nam, lời giải rõ ràng, độ khó tăng dần.",
	});

	return { systemPrompt, userPrompt };
}

function isAIConfigurationError(error: unknown): boolean {
	if (!(error instanceof Error)) return false;
	const message = error.message.toLowerCase();
	return (
		message.includes("api key") ||
		message.includes("apikey") ||
		message.includes("openai") ||
		message.includes("401") ||
		message.includes("missing")
	);
}

function parseOptionalDate(
	value: string | Date | null | undefined,
	field: string,
): Date | null {
	if (value === undefined || value === null) return null;
	const date = value instanceof Date ? value : new Date(value);
	if (Number.isNaN(date.getTime())) {
		throw new ValidationError(`${field} must be a valid date`);
	}
	return date;
}

function normalizeIdempotencyKey(
	value: string | null | undefined,
): string | null {
	if (value === undefined || value === null) return null;
	const trimmed = String(value).trim();
	if (!trimmed) return null;
	if (trimmed.length > 128 || !/^[A-Za-z0-9._:-]+$/.test(trimmed)) {
		throw new ValidationError(
			"idempotency_key must be 1-128 characters using letters, numbers, dot, underscore, colon, or dash",
		);
	}
	return trimmed;
}

function normalizeDurationSeconds(
	value: number | null | undefined,
): number | null {
	if (value === undefined || value === null) return null;
	if (!Number.isFinite(value) || !Number.isInteger(value) || value < 0) {
		throw new ValidationError(
			"duration_seconds must be a non-negative integer",
		);
	}
	return value;
}

function isDuplicateKeyError(error: unknown): boolean {
	return (
		typeof error === "object" &&
		error !== null &&
		"code" in error &&
		(error as { code?: unknown }).code === 11000
	);
}

function normalizeComparableAnswer(value: string | null): string {
	return (value ?? "")
		.trim()
		.toLowerCase()
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.replace(/\s+/g, " ");
}

/**
 * \u0110\u1ecdc \u0111\u00e1p \u00e1n d\u1ea1ng s\u1ed1 theo quy \u01b0\u1edbc Vi\u1ec7t Nam (d\u1ea5u ph\u1ea9y th\u1eadp ph\u00e2n "2,5",
 * d\u1ea5u ch\u1ea5m t\u00e1ch ngh\u00ecn "1.000") v\u00e0 ph\u00e2n s\u1ed1 "a/b" (k\u1ec3 c\u1ea3 \frac{a}{b}).
 * Tr\u1ea3 v\u1ec1 null n\u1ebfu kh\u00f4ng ph\u1ea3i \u0111\u00e1p \u00e1n s\u1ed1.
 */
function parseComparableNumber(value: string | null): number | null {
	if (!value) return null;
	let normalized = value
		.trim()
		.replace(/\$/g, "")
		.replace(/\\d?frac\s*\{([^{}]+)\}\s*\{([^{}]+)\}/g, "($1)/($2)");

	if (/^[+-]?[1-9]\d{0,2}(?:\.\d{3})+(?:,\d+)?$/.test(normalized)) {
		normalized = normalized.replace(/\./g, "").replace(",", ".");
	} else {
		normalized = normalized.replace(/,/g, ".");
	}

	if (/^[+-]?\d+(?:\.\d+)?$/.test(normalized)) {
		const parsed = Number(normalized);
		return Number.isFinite(parsed) ? parsed : null;
	}

	const fraction = normalized
		.replace(/[()\s]/g, "")
		.match(/^([+-]?\d+(?:\.\d+)?)\/([+-]?\d+(?:\.\d+)?)$/);
	if (fraction) {
		const denominator = Number(fraction[2]);
		if (denominator === 0) return null;
		const result = Number(fraction[1]) / denominator;
		return Number.isFinite(result) ? result : null;
	}

	return null;
}

function normalizeSubmitAnswers(
	input: SubmitLessonExerciseAttemptInput,
): SubmitLessonExerciseAnswerInput[] {
	if (!input || !Array.isArray(input.answers) || input.answers.length === 0) {
		throw new ValidationError("answers must be a non-empty array");
	}

	return input.answers.map((answer, index) => {
		if (!answer || typeof answer !== "object") {
			throw new ValidationError(`answers[${index}] must be an object`);
		}
		if (!mongoose.Types.ObjectId.isValid(answer.exercise_id)) {
			throw new ValidationError(`answers[${index}].exercise_id is invalid`);
		}
		const studentAnswer = textOrNull(answer.student_answer);
		const selectedChoice = textOrNull(answer.selected_choice);
		if (!studentAnswer && !selectedChoice) {
			throw new ValidationError(
				`answers[${index}] must include student_answer or selected_choice`,
			);
		}
		return {
			exercise_id: answer.exercise_id,
			student_answer: studentAnswer,
			selected_choice: selectedChoice,
		};
	});
}

function buildExerciseSnapshot(exercise: ILessonExercise) {
	const serialized = serializeExercise(exercise);
	return {
		_id: serialized._id,
		lesson_id: serialized.lesson_id,
		topic: serialized.topic ?? null,
		difficulty_level: serialized.difficulty_level ?? null,
		question_text: serialized.question_text,
		answer_type: serialized.answer_type,
		choices: serialized.choices ?? null,
		correct_answer: serialized.correct_answer,
		solution_steps: serialized.solution_steps ?? null,
		explanation: serialized.explanation ?? null,
		order_index: serialized.order_index,
	};
}

function gradeExerciseAnswer(
	exercise: ILessonExercise,
	answer: SubmitLessonExerciseAnswerInput,
): Pick<ILessonExerciseAnswer, "student_answer" | "selected_choice" | "is_correct" | "score" | "ai_comment"> {
	const studentAnswer = textOrNull(answer.student_answer);
	const selectedChoice = textOrNull(answer.selected_choice);
	const submittedAnswer = exercise.answer_type === "multiple_choice"
		? selectedChoice ?? studentAnswer
		: studentAnswer ?? selectedChoice;
	const correctAnswer = textOrNull(exercise.correct_answer);

	if (exercise.answer_type === "essay") {
		return {
			student_answer: studentAnswer ?? selectedChoice,
			selected_choice: selectedChoice,
			is_correct: null,
			score: 0,
			ai_comment: "Câu tự luận đã được lưu, cần giáo viên hoặc AI chấm chi tiết sau.",
		};
	}

	// So sánh số trước (khớp với cách chấm phía frontend): "2,0" = "2",
	// "1/2" = "0,5". Nếu không phải đáp án số thì so sánh chuỗi đã chuẩn hóa.
	const submittedNumber = parseComparableNumber(submittedAnswer);
	const correctNumber = parseComparableNumber(correctAnswer);
	const isCorrect =
		submittedNumber !== null && correctNumber !== null
			? Math.abs(submittedNumber - correctNumber) < 0.0000001
			: Boolean(
					submittedAnswer &&
						correctAnswer &&
						normalizeComparableAnswer(submittedAnswer) ===
							normalizeComparableAnswer(correctAnswer),
				);

	return {
		student_answer: studentAnswer ?? selectedChoice,
		selected_choice: selectedChoice,
		is_correct: isCorrect,
		score: isCorrect ? 1 : 0,
		ai_comment: isCorrect
			? "Chính xác."
			: "Chưa chính xác. Hãy xem lại lời giải và thử luyện thêm.",
	};
}

async function findExistingLessonQuizResult(
	studentId: string,
	lessonId: string,
	idempotencyKey: string,
): Promise<ILessonQuizResult | null> {
	return lessonQuizResultRepository.findByIdempotencyKey(
		studentId,
		lessonId,
		idempotencyKey,
	);
}

async function recordExistingLessonQuizResultLedger(
	pointRecorder: LessonPointRecorder,
	studentId: string,
	lessonId: string,
	result: ILessonQuizResult,
	metadata: Record<string, unknown>,
) {
	const ledger = await pointRecorder.recordLessonResult({
		student_id: studentId,
		lesson_id: lessonId,
		attempt_id: result._id.toString(),
		earned_points: result.score,
		max_points: result.max_score,
		competency_score: result.percentage,
		reason: "Lesson quiz submitted",
		metadata,
	});

	return { result: serializeQuizResult(result), ledger, idempotent: true };
}

function emptyCompletionSideEffects(): LessonCompletionSideEffects {
	return {
		lesson_completed: false,
		progress_updated: false,
		mastery_updated: false,
		recommendation_completed: false,
	};
}

function resolveStrengthLabel(masteryLevel: number): string {
	if (masteryLevel >= 90) return "excellent";
	if (masteryLevel >= 75) return "strong";
	if (masteryLevel >= 60) return "developing";
	if (masteryLevel >= 40) return "needs_practice";
	return "weak";
}

function normalizeTopic(value: unknown): string | null {
	const text = textOrNull(value);
	return text ? text.slice(0, 160) : null;
}

function getLessonFallbackTopic(lesson: ILesson): string {
	return (
		normalizeTopic(lesson.lesson_objective) ??
		normalizeTopic(lesson.lesson_title) ??
		"Bài học"
	);
}

type GradedExerciseForMastery = {
	exercise: ILessonExercise;
	graded: Pick<ILessonExerciseAnswer, "is_correct" | "score">;
};

export interface FinalizePassedLessonQuizInput {
	studentId: string;
	lesson: ILesson;
	result: ILessonQuizResult;
	gradedExercises?: GradedExerciseForMastery[];
	updateMastery?: boolean;
}

export class LessonService {
	constructor(
		private readonly quizResultWriter: LessonQuizResultWriter = lessonQuizResultRepository,
		private readonly pointRecorder: LessonPointRecorder = pointService,
	) {}

	public async getStudentIdForUser(userId: string): Promise<string> {
		return getStudentProfileId(userId);
	}

	public async getOwnedLesson(
		lessonId: string,
		studentId: string,
	): Promise<ILesson> {
		if (!mongoose.Types.ObjectId.isValid(lessonId)) {
			throw new NotFoundError("Bài học không tồn tại");
		}

		const lesson = await lessonRepository.findOne({
			_id: lessonId,
			student_id: studentId,
		} as any);
		if (!lesson) {
			throw new NotFoundError("Bài học không tồn tại");
		}

		return lesson;
	}

	public async getLessonWithExercises(
		userId: string,
		lessonId: string,
	): Promise<LessonWithExercisesDTO> {
		const studentId = await this.getStudentIdForUser(userId);
		const lesson = await this.getOwnedLesson(lessonId, studentId);
		const exercises = await lessonExerciseRepository.findByLessonId(
			lesson._id.toString(),
		);

		return {
			...serializeLesson(lesson),
			exercises: exercises.map(serializeExercise),
		};
	}

	public async completeLesson(
		userId: string,
		lessonId: string,
	): Promise<ReturnType<typeof serializeLesson>> {
		const studentId = await this.getStudentIdForUser(userId);
		const lesson = await this.getOwnedLesson(lessonId, studentId);
		await this.finalizePassedLessonQuiz({
			studentId,
			lesson,
			result: {
				_id: new mongoose.Types.ObjectId(),
				lesson_id: lesson._id,
				student_id: new mongoose.Types.ObjectId(studentId),
				percentage: 100,
				score: 0,
				max_score: 0,
				passed: true,
			} as ILessonQuizResult,
			updateMastery: false,
		});
		const updated = await lessonRepository.findById(lesson._id.toString());
		return serializeLesson(updated ?? lesson);
	}

	protected async finalizePassedLessonQuiz(
		input: FinalizePassedLessonQuizInput,
	): Promise<LessonCompletionSideEffects> {
		if (!input.result.passed) return emptyCompletionSideEffects();

		const lessonId = input.lesson._id.toString();
		const studentId = input.studentId;
		const now = new Date();
		const effects = emptyCompletionSideEffects();

		if (input.lesson.status !== "completed") {
			await LessonModel.updateOne(
				{ _id: lessonId, student_id: studentId, status: { $ne: "completed" } },
				{ $set: { status: "completed" } },
			).exec();
			effects.lesson_completed = true;
		}

		const [totalLessons, completedLessons, quizAgg] = await Promise.all([
			LessonModel.countDocuments({
				student_id: studentId,
				curriculum_id: input.lesson.curriculum_id,
			}).exec(),
			LessonModel.countDocuments({
				student_id: studentId,
				curriculum_id: input.lesson.curriculum_id,
				status: "completed",
			}).exec(),
			LessonQuizResultModel.aggregate([
				{
					$match: {
						student_id: new mongoose.Types.ObjectId(studentId),
						percentage: { $type: "number" },
					},
				},
				{ $group: { _id: null, average: { $avg: "$percentage" } } },
			]).exec(),
		]);
		const progressUpdate = await StudentProgressModel.updateOne(
			{ student_id: studentId, curriculum_id: input.lesson.curriculum_id },
			{
				$set: {
					total_lessons: totalLessons,
					completed_lessons: completedLessons,
					completion_percentage:
						totalLessons > 0
							? Number(((completedLessons / totalLessons) * 100).toFixed(2))
							: 0,
					average_quiz_score:
						quizAgg[0]?.average !== undefined
							? Number(Number(quizAgg[0].average).toFixed(2))
							: null,
					last_study_date: now,
				},
				$setOnInsert: {
					student_id: new mongoose.Types.ObjectId(studentId),
					curriculum_id: input.lesson.curriculum_id,
					total_study_time_minutes: 0,
					current_streak_days: 0,
					longest_streak_days: 0,
				},
			},
			{ upsert: true },
		).exec();
		effects.progress_updated =
			progressUpdate.modifiedCount > 0 || progressUpdate.upsertedCount > 0;

		if (input.updateMastery !== false) {
			effects.mastery_updated = await this.updateLessonTopicMastery(
				studentId,
				input.lesson,
				input.result,
				input.gradedExercises,
				now,
			);
		}

		const recommendationUpdate = await LessonRecommendationModel.updateMany(
			{ student_id: studentId, lesson_id: lessonId, is_completed: false },
			{ $set: { is_completed: true } },
		).exec();
		effects.recommendation_completed = recommendationUpdate.modifiedCount > 0;

		// Gamification integration: check and award badges on lesson completion (fail-soft)
		// Requirement 12.7, 12.11
		try {
			const { gamificationService } = await import("./gamification.service");
			await gamificationService.checkAndAwardBadges(studentId, {
				type: "lesson_completed",
				lesson_id: lessonId,
			});
		} catch (error) {
			// Fail-soft: log error but don't block lesson completion (Requirement 12.11)
			console.error(
				`[LessonService] Gamification checkAndAwardBadges failed for student=${studentId}, lesson=${lessonId}:`,
				error,
			);
		}

		return effects;
	}

	private async updateLessonTopicMastery(
		studentId: string,
		lesson: ILesson,
		result: ILessonQuizResult,
		gradedExercises: GradedExerciseForMastery[] | undefined,
		practicedAt: Date,
	): Promise<boolean> {
		const profile = await studentProfileRepository.findById(studentId).catch(() => null);
		const gradeLevel = Number(profile?.grade_level ?? 0);
		if (!Number.isFinite(gradeLevel) || gradeLevel <= 0) return false;

		const topicStats = new Map<string, { total: number; correct: number }>();
		if (gradedExercises && gradedExercises.length > 0) {
			for (const { exercise, graded } of gradedExercises) {
				const topic = normalizeTopic(exercise.topic) ?? getLessonFallbackTopic(lesson);
				const current = topicStats.get(topic) ?? { total: 0, correct: 0 };
				current.total += 1;
				current.correct += graded.is_correct === true ? 1 : 0;
				topicStats.set(topic, current);
			}
		} else {
			const topic = getLessonFallbackTopic(lesson);
			topicStats.set(topic, {
				total: Math.max(1, Number(result.total_questions ?? 1)),
				correct: Math.max(0, Number(result.correct_answers ?? result.score ?? 0)),
			});
		}

		let updated = false;
		for (const [topic, stats] of topicStats.entries()) {
			const existing = await TopicMasteryModel.findOne({
				student_id: studentId,
				topic,
				grade_level: gradeLevel,
			}).exec();
			const totalAttempts = Number(existing?.total_attempts ?? 0) + stats.total;
			const correctAttempts = Number(existing?.correct_attempts ?? 0) + stats.correct;
			const masteryLevel =
				totalAttempts > 0
					? Number(((correctAttempts / totalAttempts) * 100).toFixed(2))
					: 0;
			await TopicMasteryModel.updateOne(
				{ student_id: studentId, topic, grade_level: gradeLevel },
				{
					$set: {
						mastery_level: masteryLevel,
						total_attempts: totalAttempts,
						correct_attempts: correctAttempts,
						strength_label: resolveStrengthLabel(masteryLevel),
						last_practiced_at: practicedAt,
					},
					$setOnInsert: {
						student_id: new mongoose.Types.ObjectId(studentId),
						topic,
						grade_level: gradeLevel,
					},
				},
				{ upsert: true },
			).exec();
			updated = true;
		}
		return updated;
	}

	public async createQuizResult(
		userId: string,
		lessonId: string,
		input: CreateLessonQuizResultInput,
	): Promise<CreateLessonQuizResultResponse> {
		const studentId = await this.getStudentIdForUser(userId);
		const lesson = await this.getOwnedLesson(lessonId, studentId);
		const lessonObjectId = new mongoose.Types.ObjectId(lesson._id.toString());
		const studentObjectId = new mongoose.Types.ObjectId(studentId);
		const idempotencyKey = normalizeIdempotencyKey(
			input.idempotency_key ?? input.attempt_id,
		);
		const metadata = input.metadata;
		if (
			metadata !== undefined &&
			(metadata === null ||
				Array.isArray(metadata) ||
				typeof metadata !== "object")
		) {
			throw new ValidationError("metadata must be an object");
		}

		if (idempotencyKey) {
			const idempotencyMetadata = { idempotency_key: idempotencyKey };
			const existing = await findExistingLessonQuizResult(
				studentId,
				lesson._id.toString(),
				idempotencyKey,
			);
			if (existing) {
				const existingResponse = await recordExistingLessonQuizResultLedger(
					this.pointRecorder,
					studentId,
					lesson._id.toString(),
					existing,
					{
						...(input.metadata ?? {}),
						...idempotencyMetadata,
					},
				);
				return {
					...existingResponse,
					...(existing.passed
						? await this.finalizePassedLessonQuiz({
								studentId,
								lesson,
								result: existing,
								updateMastery: false,
							})
						: emptyCompletionSideEffects()),
				};
			}
		}

		const earnedPoints = validateEarnedPoints(input.score, input.max_score);
		const maxPoints = Number(input.max_score);
		const percentage = calculatePercentage(earnedPoints, maxPoints);
		const passed = percentage >= LESSON_QUIZ_PASS_PERCENTAGE;
		const durationSeconds = normalizeDurationSeconds(input.duration_seconds);
		const totalQuestions = input.total_questions ?? 0;
		const correctAnswers = input.correct_answers ?? 0;

		if (!Number.isInteger(totalQuestions) || totalQuestions < 0) {
			throw new ValidationError(
				"total_questions must be a non-negative integer",
			);
		}
		if (
			!Number.isInteger(correctAnswers) ||
			correctAnswers < 0 ||
			correctAnswers > totalQuestions
		) {
			throw new ValidationError(
				"correct_answers must be between 0 and total_questions",
			);
		}

		let result: ILessonQuizResult;
		try {
			result = await this.quizResultWriter.createQuizResult({
				lesson_id: lessonObjectId,
				student_id: studentObjectId,
				idempotency_key: idempotencyKey,
				total_questions: totalQuestions,
				correct_answers: correctAnswers,
				score: earnedPoints,
				max_score: maxPoints,
				percentage,
				duration_seconds: durationSeconds,
				ai_feedback: input.ai_feedback ?? null,
				passed,
				started_at: parseOptionalDate(input.started_at, "started_at"),
				submitted_at:
					parseOptionalDate(input.submitted_at, "submitted_at") ?? new Date(),
			});
		} catch (error) {
			if (idempotencyKey && isDuplicateKeyError(error)) {
				const idempotencyMetadata = { idempotency_key: idempotencyKey };
				const existing = await findExistingLessonQuizResult(
					studentId,
					lesson._id.toString(),
					idempotencyKey,
				);
				if (existing) {
					const existingResponse = await recordExistingLessonQuizResultLedger(
						this.pointRecorder,
						studentId,
						lesson._id.toString(),
						existing,
						{
							...(input.metadata ?? {}),
							...idempotencyMetadata,
						},
					);
					return {
						...existingResponse,
						...(existing.passed
							? await this.finalizePassedLessonQuiz({
									studentId,
									lesson,
									result: existing,
									updateMastery: false,
								})
							: emptyCompletionSideEffects()),
					};
				}
			}
			throw error;
		}

		const ledger = await this.pointRecorder.recordLessonResult({
			student_id: studentId,
			lesson_id: lesson._id.toString(),
			attempt_id: result._id.toString(),
			earned_points: earnedPoints,
			max_points: maxPoints,
			competency_score: percentage,
			reason: "Lesson quiz submitted",
			metadata: {
				...(input.metadata ?? {}),
				...(idempotencyKey ? { idempotency_key: idempotencyKey } : {}),
			},
		});

		// Gamification integration: check and award badges on quiz submission (fail-soft)
		// Requirement 12.7, 12.11
		try {
			const { gamificationService } = await import("./gamification.service");
			await gamificationService.checkAndAwardBadges(studentId, {
				type: "quiz_submitted",
				lesson_id: lesson._id.toString(),
				score: earnedPoints,
				max_score: maxPoints,
			});
		} catch (error) {
			// Fail-soft: log error but don't block quiz submission (Requirement 12.11)
			console.error(
				`[LessonService] Gamification checkAndAwardBadges failed for student=${studentId}, quiz on lesson=${lesson._id}:`,
				error,
			);
		}

		return {
			result: serializeQuizResult(result),
			ledger,
			idempotent: false,
			...(passed
				? await this.finalizePassedLessonQuiz({ studentId, lesson, result })
				: emptyCompletionSideEffects()),
		};
	}

	public async submitExerciseAttempt(
		userId: string,
		lessonId: string,
		input: SubmitLessonExerciseAttemptInput,
	): Promise<SubmitLessonExerciseAttemptResponse> {
		const studentId = await this.getStudentIdForUser(userId);
		const lesson = await this.getOwnedLesson(lessonId, studentId);
		const normalizedAnswers = normalizeSubmitAnswers(input);
		const idempotencyKey = normalizeIdempotencyKey(
			input.idempotency_key ?? input.attempt_id,
		);

		if (idempotencyKey) {
			const existing = await findExistingLessonQuizResult(
				studentId,
				lesson._id.toString(),
				idempotencyKey,
			);
			if (existing) {
				const answers = await lessonExerciseAnswerRepository.findByQuizResultIds([
					existing._id.toString(),
				]);
				const ledger = await this.pointRecorder.recordLessonResult({
					student_id: studentId,
					lesson_id: lesson._id.toString(),
					attempt_id: existing._id.toString(),
					earned_points: existing.score,
					max_points: existing.max_score,
					competency_score: existing.percentage,
					reason: "Lesson practical exercises submitted",
					metadata: { idempotency_key: idempotencyKey, type: "practical_exercise" },
				});
				return {
					result: serializeQuizResult(existing),
					answers: answers.map(serializeExerciseAnswer),
					ledger,
					idempotent: true,
					...(existing.passed
						? await this.finalizePassedLessonQuiz({
								studentId,
								lesson,
								result: existing,
								updateMastery: false,
							})
						: emptyCompletionSideEffects()),
				};
			}
		}

		const exerciseIds = normalizedAnswers.map((answer) => answer.exercise_id);
		const uniqueExerciseIds = new Set(exerciseIds);
		if (uniqueExerciseIds.size !== exerciseIds.length) {
			throw new ValidationError("answers must not contain duplicate exercise_id");
		}

		const exercises = await LessonExerciseModel.find({
			_id: { $in: exerciseIds },
			lesson_id: lesson._id,
		}).exec();
		if (exercises.length !== exerciseIds.length) {
			throw new ValidationError(
				"Một hoặc nhiều bài tập không thuộc bài học này hoặc không tồn tại",
			);
		}

		const exerciseById = new Map(
			exercises.map((exercise) => [exercise._id.toString(), exercise]),
		);
		const gradedAnswers = normalizedAnswers.map((answer) => {
			const exercise = exerciseById.get(answer.exercise_id)!;
			return { exercise, graded: gradeExerciseAnswer(exercise, answer) };
		});
		const correctAnswers = gradedAnswers.filter(
			({ graded }) => graded.is_correct === true,
		).length;
		const totalQuestions = gradedAnswers.length;
		const earnedPoints = gradedAnswers.reduce(
			(sum, { graded }) => sum + Number(graded.score ?? 0),
			0,
		);
		const maxPoints = totalQuestions;
		const percentage = calculatePercentage(earnedPoints, maxPoints);
		const passed = percentage >= LESSON_QUIZ_PASS_PERCENTAGE;
		const durationSeconds = normalizeDurationSeconds(input.duration_seconds);
		const submittedAt = parseOptionalDate(input.submitted_at, "submitted_at") ?? new Date();
		const startedAt = parseOptionalDate(input.started_at, "started_at");
		const lessonObjectId = new mongoose.Types.ObjectId(lesson._id.toString());
		const studentObjectId = new mongoose.Types.ObjectId(studentId);

		let result: ILessonQuizResult;
		try {
			result = await this.quizResultWriter.createQuizResult({
				lesson_id: lessonObjectId,
				student_id: studentObjectId,
				idempotency_key: idempotencyKey,
				total_questions: totalQuestions,
				correct_answers: correctAnswers,
				score: earnedPoints,
				max_score: maxPoints,
				percentage,
				duration_seconds: durationSeconds,
				ai_feedback: "Kết quả bài tập thực tế được chấm tự động ở mức cơ bản.",
				passed,
				started_at: startedAt,
				submitted_at: submittedAt,
			});
		} catch (error) {
			if (idempotencyKey && isDuplicateKeyError(error)) {
				const existing = await findExistingLessonQuizResult(
					studentId,
					lesson._id.toString(),
					idempotencyKey,
				);
				if (existing) {
					const answers = await lessonExerciseAnswerRepository.findByQuizResultIds([
						existing._id.toString(),
					]);
					const ledger = await this.pointRecorder.recordLessonResult({
						student_id: studentId,
						lesson_id: lesson._id.toString(),
						attempt_id: existing._id.toString(),
						earned_points: existing.score,
						max_points: existing.max_score,
						competency_score: existing.percentage,
						reason: "Lesson practical exercises submitted",
						metadata: { idempotency_key: idempotencyKey, type: "practical_exercise" },
					});
					return {
						result: serializeQuizResult(existing),
						answers: answers.map(serializeExerciseAnswer),
						ledger,
						idempotent: true,
						...(existing.passed
							? await this.finalizePassedLessonQuiz({
									studentId,
									lesson,
									result: existing,
									updateMastery: false,
								})
							: emptyCompletionSideEffects()),
					};
				}
			}
			throw error;
		}

		const createdAnswers = await LessonExerciseAnswerModel.insertMany(
			gradedAnswers.map(({ exercise, graded }) => ({
				exercise_id: new mongoose.Types.ObjectId(exercise._id.toString()),
				lesson_id: lessonObjectId,
				student_id: studentObjectId,
				quiz_result_id: new mongoose.Types.ObjectId(result._id.toString()),
				student_answer: graded.student_answer,
				selected_choice: graded.selected_choice,
				is_correct: graded.is_correct,
				score: graded.score,
				ai_comment: graded.ai_comment,
				exercise_snapshot: buildExerciseSnapshot(exercise),
				answered_at: submittedAt,
			})),
			{ ordered: true },
		);

		const ledger = await this.pointRecorder.recordLessonResult({
			student_id: studentId,
			lesson_id: lesson._id.toString(),
			attempt_id: result._id.toString(),
			earned_points: earnedPoints,
			max_points: maxPoints,
			competency_score: percentage,
			reason: "Lesson practical exercises submitted",
			metadata: {
				type: "practical_exercise",
				...(idempotencyKey ? { idempotency_key: idempotencyKey } : {}),
			},
		});

		return {
			result: serializeQuizResult(result),
			answers: createdAnswers.map(serializeExerciseAnswer),
			ledger,
			idempotent: false,
			...(passed
				? await this.finalizePassedLessonQuiz({
						studentId,
						lesson,
						result,
						gradedExercises: gradedAnswers,
					})
				: emptyCompletionSideEffects()),
		};
	}

	public async getExerciseAttemptHistory(
		userId: string,
		lessonId: string,
	): Promise<LessonExerciseAttemptHistoryItem[]> {
		const studentId = await this.getStudentIdForUser(userId);
		const lesson = await this.getOwnedLesson(lessonId, studentId);
		const results = await lessonQuizResultRepository.findByLessonAndStudent(
			lesson._id.toString(),
			studentId,
		);
		if (results.length === 0) return [];

		const answers = await lessonExerciseAnswerRepository.findByQuizResultIds(
			results.map((result) => result._id.toString()),
		);
		const answersByResultId = new Map<string, ILessonExerciseAnswer[]>();
		for (const answer of answers) {
			const resultId = answer.quiz_result_id?.toString?.();
			if (!resultId) continue;
			const current = answersByResultId.get(resultId) ?? [];
			current.push(answer);
			answersByResultId.set(resultId, current);
		}

		return results
			.filter((result) => (answersByResultId.get(result._id.toString()) ?? []).length > 0)
			.map((result) => ({
				result: serializeQuizResult(result),
				answers: (answersByResultId.get(result._id.toString()) ?? []).map(
					serializeExerciseAnswer,
				),
			}));
	}

	public async generateExercises(
		userId: string,
		lessonId: string,
		forceRegenerate = false,
	): Promise<GenerateLessonExercisesResult> {
		const studentId = await this.getStudentIdForUser(userId);
		const lesson = await this.getOwnedLesson(lessonId, studentId);
		const existingExercises = await lessonExerciseRepository.findByLessonId(
			lesson._id.toString(),
		);

		if (existingExercises.length > 0 && !forceRegenerate) {
			const lessonDTO = {
				...serializeLesson(lesson),
				exercises: existingExercises.map(serializeExercise),
			};
			return {
				lesson: lessonDTO,
				generated: lessonDTO.exercises,
				source: "existing",
			};
		}

		const { systemPrompt, userPrompt } = buildExercisePrompt(lesson);
		const startedAt = Date.now();

		try {
			const aiResult = await aiService.generateJSON<LessonExerciseAIResponse>(
				systemPrompt,
				userPrompt,
				{
					temperature: 0.35,
					maxTokens: 2600,
				},
			);
			const normalized = normalizeAIExercises(
				aiResult.data,
				lesson._id.toString(),
			);
			const lessonObjectId = new mongoose.Types.ObjectId(lesson._id.toString());

			if (forceRegenerate && existingExercises.length > 0) {
				await LessonExerciseModel.deleteMany({
					lesson_id: lessonObjectId,
				}).exec();
			}

			const created = await LessonExerciseModel.insertMany(
				normalized.map((exercise) => ({
					...exercise,
					lesson_id: lessonObjectId,
				})),
				{ ordered: true },
			);
			const serializedCreated = created.map(serializeExercise);

			await aiService.logGeneration(
				studentId,
				"lesson_exercises",
				`${systemPrompt}\n\n${userPrompt}`,
				JSON.stringify(aiResult.data),
				config.openai.model || "gpt-4o-mini",
				aiResult.tokensUsed.input,
				aiResult.tokensUsed.output,
				Date.now() - startedAt,
				"success",
			);

			return {
				lesson: {
					...serializeLesson(lesson),
					exercises: serializedCreated,
				},
				generated: serializedCreated,
				source: "generated",
			};
		} catch (error: unknown) {
			await aiService
				.logGeneration(
					studentId,
					"lesson_exercises",
					`${systemPrompt}\n\n${userPrompt}`,
					"",
					config.openai.model || "gpt-4o-mini",
					0,
					0,
					Date.now() - startedAt,
					"error",
					error instanceof Error ? error.message : "Unknown error",
				)
				.catch(() => undefined);

			if (error instanceof AppError) {
				throw error;
			}

			if (isAIConfigurationError(error)) {
				throw new AppError(
					"AI chưa được cấu hình hoặc hiện không sẵn sàng. Vui lòng thử lại sau.",
					503,
				);
			}

			throw new AppError(
				"Không thể tạo bài tập bằng AI lúc này. Vui lòng thử lại sau.",
				503,
			);
		}
	}
}

export const lessonService = new LessonService();
