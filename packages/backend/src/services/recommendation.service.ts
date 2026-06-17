import {
	CurriculumModuleRepository,
	CurriculumRepository,
} from "../models/curriculum.model";
import { engagementSessionRepo } from "../models/engagement.model";
import {
	LessonQuizResultModel,
	LessonQuizResultRepository,
	LessonRepository,
} from "../models/lesson.model";
import {
	LessonRecommendationRepository,
	StudentProgressRepository,
	TopicMasteryRepository,
} from "../models/progress.model";
import { StudentProfileRepository } from "../models/student.model";
import {
	type AdaptiveRecommendation,
	Curriculum,
	type EngagementSession,
	type Lesson,
	type LessonQuizResult,
	type LessonRecommendation,
	type NumericValue,
	RecommendationType,
	type StudentProfile,
	type TopicMastery,
} from "../types";
import { NotFoundError } from "../utils/errors";
import aiService from "./ai.service";

// ── Pure adaptive session-ratio engine ─────────────────────────────────

/** Cấu trúc buổi học mặc định theo đặc tả: 20% ôn / 60% mới / 20% củng cố. */
export const DEFAULT_SESSION_RATIOS = {
	review: 0.2,
	new: 0.6,
	reinforce: 0.2,
} as const;

/** Ngưỡng tỉ lệ xin gợi ý cao (phụ thuộc đáp án). */
export const DEFAULT_HIGH_HINT_RATE = 0.4;

export interface SessionRatioOptions {
	/** Tỉ lệ nền tảng (mặc định 20/60/20). */
	baseRatios?: { review: number; new: number; reinforce: number };
	/** Ngưỡng coi là "xin gợi ý nhiều". */
	highHintRate?: number;
}

/**
 * Tính tỉ lệ cấu trúc buổi học từ nhiều tín hiệu — HÀM THUẦN, không chạm DB.
 *
 * Bám đặc tả (Logic §4 + "Cách sửa đúng" cho adaptive learning):
 * - Không chỉ nhìn điểm quiz mà chấm theo nhiều tín hiệu.
 * - Quiz < 50% → ưu tiên ôn/củng cố; 50–<80% → tăng củng cố; ≥80% → giữ bài mới.
 * - Lỗi sai lặp lại gần đây → tăng phần củng cố ("củng cố lỗi sai gần đây").
 * - Kiến thức đang quên (forgetting) và xin gợi ý nhiều → tăng phần ôn.
 * - Điểm thiếu ổn định → tăng phần củng cố.
 *
 * Trả về 3 tỉ lệ đã chuẩn hóa tổng = 1.0 (giữ phần "bài mới" tối thiểu 20%).
 */
export function computeAdaptiveSessionRatios(
	signals: AdaptiveRecommendation["signals"],
	options: SessionRatioOptions = {},
): AdaptiveRecommendation["session_structure"] {
	const base = options.baseRatios ?? DEFAULT_SESSION_RATIOS;
	const highHintRate = options.highHintRate ?? DEFAULT_HIGH_HINT_RATE;

	let review = base.review;
	let newRatio = base.new;
	let reinforce = base.reinforce;

	// 1. Điểm quiz gần nhất — bám band đặc tả (<50% / 50–<80% / ≥80%).
	if (signals.last_quiz_score !== null) {
		if (signals.last_quiz_score < 50) {
			reinforce += 0.2;
			newRatio -= 0.2;
		} else if (signals.last_quiz_score < 80) {
			reinforce += 0.1;
			newRatio -= 0.1;
		}
	}

	// 2. Kiến thức đang quên (forgetting curve) → tăng ôn lại.
	if (signals.forgetting_risk_topics.length >= 3) {
		review += 0.15;
		newRatio -= 0.15;
	} else if (signals.forgetting_risk_topics.length >= 1) {
		review += 0.05;
		newRatio -= 0.05;
	}

	// 3. Lỗi sai lặp lại gần đây → tăng củng cố (tín hiệu đặc tả yêu cầu bổ sung).
	if (signals.recurring_error_topics.length >= 2) {
		reinforce += 0.1;
		newRatio -= 0.1;
	} else if (signals.recurring_error_topics.length >= 1) {
		reinforce += 0.05;
		newRatio -= 0.05;
	}

	// 4. Xin gợi ý nhiều → tăng ôn (đang phụ thuộc/hổng kiến thức).
	if (signals.hint_usage_rate > highHintRate) {
		review += 0.05;
		newRatio -= 0.05;
	}

	// 5. Điểm thiếu ổn định → tăng củng cố.
	if (signals.stability_last_5 < 0.4) {
		reinforce += 0.05;
		newRatio -= 0.05;
	}

	// Giữ phần "bài mới" tối thiểu 20%, bù từ phần đang cao hơn.
	if (newRatio < 0.2) {
		const deficit = 0.2 - newRatio;
		newRatio = 0.2;
		if (review > reinforce) {
			review -= deficit;
		} else {
			reinforce -= deficit;
		}
	}

	// Chuẩn hóa tổng = 1.0.
	const total = review + newRatio + reinforce;
	return {
		review_ratio: Math.round((review / total) * 100) / 100,
		new_ratio: Math.round((newRatio / total) * 100) / 100,
		reinforce_ratio: Math.round((reinforce / total) * 100) / 100,
	};
}

// ── Service ────────────────────────────────────────────────────────────

/**
 * Adaptive Recommendation Service
 *
 * Multi-signal algorithm that answers 3 questions simultaneously:
 * 1. What new content to study? (60% default)
 * 2. What to review from forgotten/decaying topics? (20% default)
 * 3. What recent errors to reinforce? (20% default)
 *
 * Signals used (beyond quiz score):
 * - hint_count: how often student asked for hints
 * - retry_count: times student re-answered incorrectly
 * - time_per_question: speed vs expected pace
 * - recurring errors: same topic errors across sessions
 * - forgetting curve: mastery decay since last practice
 * - stability: consistency across last 3-5 sessions
 * - engagement metrics: focus_ratio, active_duration
 */
export class RecommendationService {
	private readonly studentRepo: StudentProfileRepository;
	private readonly curriculumRepo: CurriculumRepository;
	private readonly moduleRepo: CurriculumModuleRepository;
	private readonly lessonRepo: LessonRepository;
	private readonly quizResultRepo: LessonQuizResultRepository;
	private readonly topicMasteryRepo: TopicMasteryRepository;
	private readonly recommendationRepo: LessonRecommendationRepository;
	private readonly progressRepo: StudentProgressRepository;

	/** Default session structure ratios */
	private static readonly DEFAULT_RATIOS = {
		review: 0.2,
		new: 0.6,
		reinforce: 0.2,
	};
	/** Forgetting curve half-life default (days) */
	private static readonly DEFAULT_HALF_LIFE = 14;
	/** Sessions to look back for stability */
	private static readonly STABILITY_WINDOW = 5;
	/** Mastery threshold below which topic needs review */
	private static readonly EFFECTIVE_MASTERY_THRESHOLD = 50;
	/** High hint usage rate threshold */
	private static readonly HIGH_HINT_RATE = 0.4;

	constructor() {
		this.studentRepo = new StudentProfileRepository();
		this.curriculumRepo = new CurriculumRepository();
		this.moduleRepo = new CurriculumModuleRepository();
		this.lessonRepo = new LessonRepository();
		this.quizResultRepo = new LessonQuizResultRepository();
		this.topicMasteryRepo = new TopicMasteryRepository();
		this.recommendationRepo = new LessonRecommendationRepository();
		this.progressRepo = new StudentProgressRepository();
	}

	/**
	 * Main entry point: generate today's adaptive recommendation.
	 */
	public async getAdaptiveRecommendation(
		studentId: string,
	): Promise<AdaptiveRecommendation> {
		const profile = await this.getProfileOrThrow(studentId);

		// Get active curriculum
		const activeCurricula =
			await this.curriculumRepo.findActiveByStudent(studentId);
		const curriculum = activeCurricula[0] ?? null;

		if (!curriculum) {
			return this.emptyRecommendation(
				"Chưa có giáo trình. Hãy làm bài kiểm tra đầu vào và tạo giáo trình trước.",
			);
		}

		// Gather all signals in parallel
		const [
			allLessons,
			curriculumModules,
			recentQuizzes,
			topicMasteries,
			recentSessions,
			progress,
		] = await Promise.all([
			this.lessonRepo.findByCurriculum(curriculum.id) as any,
			// Fail-soft: thiếu thứ tự module thì vẫn gợi ý được (sort theo bài học)
			(this.moduleRepo.findByCurriculumId(String(curriculum.id)) as any).catch(
				() => [],
			),
			this.getRecentQuizResults(studentId, 5),
			this.topicMasteryRepo.findByStudent(studentId) as any,
			engagementSessionRepo.findRecentByStudent(
				studentId,
				RecommendationService.STABILITY_WINDOW,
			) as any,
			this.progressRepo.findByStudent(studentId),
		]);

		// Thứ tự module theo order_index — dùng để chọn bài kế tiếp đúng lộ trình
		const moduleOrder = new Map<string, number>(
			(curriculumModules as Array<{ _id?: unknown; id?: unknown; order_index: number }>).map(
				(module) => [String(module._id ?? module.id), module.order_index],
			),
		);

		const completedLessons = allLessons.filter(
			(l: Lesson) => l.status === "completed",
		);
		const remainingLessons = allLessons.filter(
			(l: Lesson) => l.status !== "completed" && l.status !== "skipped",
		);

		if (
			remainingLessons.length === 0 &&
			this.getDecayingTopics(topicMasteries as any).length === 0
		) {
			return this.emptyRecommendation("Đã hoàn thành toàn bộ giáo trình!");
		}

		// ── Compute Signals ──────────────────────────────────────────────

		const lastQuiz = recentQuizzes[0] ?? null;
		const lastQuizScore = lastQuiz ? this.normalizeQuizScore(lastQuiz) : null;

		// Hint usage rate (from recent quizzes with hint_count field)
		const hintUsageRate = this.computeHintUsageRate(recentQuizzes);

		// Average time per question from recent sessions
		const avgTimePerQuestion = this.computeAvgTimePerQuestion(
			recentSessions as any,
		);

		// Recurring error topics (errors in 2+ of last 5 sessions)
		const recurringErrorTopics = this.findRecurringErrorTopics(
			topicMasteries as any,
			recentQuizzes,
		);

		// Stability: variance of quiz scores over last N sessions
		const stabilityLast5 = this.computeStability(recentQuizzes);

		// Topics with decaying mastery (forgetting curve)
		const forgettingRiskTopics = this.getDecayingTopics(topicMasteries as any);

		const signals = {
			last_quiz_score: lastQuizScore,
			hint_usage_rate: hintUsageRate,
			avg_time_per_question: avgTimePerQuestion,
			recurring_error_topics: recurringErrorTopics,
			stability_last_5: stabilityLast5,
			forgetting_risk_topics: this.cleanTopicList(
				forgettingRiskTopics.map((t) => t.topic),
			),
		};

		// ── Determine Session Structure ──────────────────────────────────

		const ratios = this.computeSessionRatios(signals);

		// ── Stats ────────────────────────────────────────────────────────

		const currentProgress = progress[0];
		const stats = {
			total_lessons: allLessons.length,
			completed_lessons: completedLessons.length,
			remaining_lessons: remainingLessons.length,
			current_streak: currentProgress?.current_streak_days ?? 0,
		};
		const personalizedContext = this.buildPersonalizedContext(
			profile,
			signals,
			stats.current_streak,
		);

		// ── Pick Content ─────────────────────────────────────────────────

		const nextLesson = this.findNextLesson(allLessons as any, moduleOrder);

		const newLesson = nextLesson
			? {
					lesson_id: nextLesson.id!,
					title: nextLesson.lesson_title,
					topic: nextLesson.lesson_objective ?? "N/A",
					reason: this.buildNewLessonReason(nextLesson, personalizedContext),
				}
			: null;

		const reviewItems = this.pickReviewItems(
			forgettingRiskTopics,
			completedLessons as any,
			allLessons as any,
			2,
		);

		const reinforceItems = this.pickReinforceItems(
			recurringErrorTopics,
			topicMasteries as any,
			completedLessons as any,
			allLessons as any,
			2,
		);

		// ── AI Tips ──────────────────────────────────────────────────────

		const aiTips = this.ensurePersonalizedTips(
			await this.getAITips(profile, signals, ratios),
			personalizedContext,
		);

		// ── Save Recommendations ─────────────────────────────────────────

		await this.saveRecommendations(
			studentId,
			newLesson as any,
			reviewItems,
			reinforceItems,
		);

		return {
			new_lesson: newLesson,
			review_items: reviewItems,
			reinforce_items: reinforceItems,
			session_structure: ratios,
			signals,
			learning_tips: aiTips,
			fallback_reason: null,
			stats,
		};
	}

	// ── Signal Computation ────────────────────────────────────────────

	/**
	 * Compute dynamic session ratios based on signals.
	 * Delegates to the pure {@link computeAdaptiveSessionRatios} engine so the
	 * logic is unit-testable in isolation (no DB).
	 */
	private computeSessionRatios(
		signals: AdaptiveRecommendation["signals"],
	): AdaptiveRecommendation["session_structure"] {
		return computeAdaptiveSessionRatios(signals, {
			baseRatios: RecommendationService.DEFAULT_RATIOS,
			highHintRate: RecommendationService.HIGH_HINT_RATE,
		});
	}

	/**
	 * Compute hint usage rate from recent quizzes.
	 */
	private computeHintUsageRate(quizzes: LessonQuizResult[]): number {
		if (quizzes.length === 0) return 0;

		let totalQuestions = 0;
		let totalHints = 0;

		for (const quiz of quizzes) {
			totalQuestions += quiz.total_questions;
			totalHints +=
				(quiz as LessonQuizResult & { hint_count?: number }).hint_count ?? 0;
		}

		return totalQuestions > 0
			? Math.round((totalHints / totalQuestions) * 100) / 100
			: 0;
	}

	/**
	 * Compute average time per question from engagement sessions.
	 */
	private computeAvgTimePerQuestion(
		sessions: EngagementSession[],
	): number | null {
		const validSessions = sessions.filter(
			(s) => s.answer_count > 0 && s.active_duration_seconds > 0,
		);
		if (validSessions.length === 0) return null;

		let totalTime = 0;
		let totalAnswers = 0;
		for (const session of validSessions) {
			totalTime += session.active_duration_seconds;
			totalAnswers += session.answer_count;
		}

		return totalAnswers > 0 ? Math.round(totalTime / totalAnswers) : null;
	}

	/**
	 * Find topics with recurring errors (errors in multiple recent quizzes).
	 */
	private findRecurringErrorTopics(
		topicMasteries: TopicMastery[],
		recentQuizzes: LessonQuizResult[],
	): string[] {
		// Topics where error rate is high AND mastery is low
		const errorTopics = topicMasteries
			.filter((tm) => {
				const errorRate =
					tm.total_attempts > 0
						? (tm.total_attempts - tm.correct_attempts) / tm.total_attempts
						: 0;
				return errorRate > 0.4 && Number(tm.mastery_level) < 60;
			})
			.map((tm) => tm.topic);

		return this.cleanTopicList(errorTopics);
	}

	/**
	 * Compute score stability (0-1) from recent quiz scores.
	 * High = consistent performance, Low = erratic.
	 */
	private computeStability(quizzes: LessonQuizResult[]): number {
		if (quizzes.length < 2) return 0.5; // insufficient data

		const scores = quizzes.map((q) => this.normalizeQuizScore(q));
		const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
		const variance =
			scores.reduce((sum, s) => sum + (s - mean) ** 2, 0) / scores.length;
		const stdDev = Math.sqrt(variance);

		// Normalize: stdDev of 0 = perfect (1.0), stdDev of 30 = unstable (0.0)
		return Math.max(0, Math.min(1, 1 - stdDev / 30));
	}

	/**
	 * Get topics with decaying mastery using exponential forgetting curve.
	 * effective_mastery = mastery * e^(-days_since_practice / half_life)
	 */
	private getDecayingTopics(topicMasteries: TopicMastery[]): TopicMastery[] {
		const now = Date.now();
		const decaying: Array<
			TopicMastery & { effective_mastery_computed: number; days_since: number }
		> = [];

		for (const tm of topicMasteries) {
			const topicName = this.normalizeTopicName(tm.topic);
			if (!this.hasTopicContent(topicName)) continue;
			if (!tm.last_practiced_at) continue;

			const lastPracticed = new Date(tm.last_practiced_at).getTime();
			const daysSince = (now - lastPracticed) / (1000 * 60 * 60 * 24);
			const halfLife = Number(
				(tm as TopicMastery & { decay_half_life_days?: NumericValue })
					.decay_half_life_days ?? RecommendationService.DEFAULT_HALF_LIFE,
			);

			const mastery = Number(tm.mastery_level);
			const effectiveMastery = mastery * Math.exp(-daysSince / halfLife);

			if (
				effectiveMastery < RecommendationService.EFFECTIVE_MASTERY_THRESHOLD &&
				mastery >= 50
			) {
				// Topic was known but has decayed
				decaying.push({
					...tm,
					topic: topicName,
					effective_mastery_computed: Math.round(effectiveMastery * 100) / 100,
					days_since: Math.round(daysSince),
				});
			}
		}

		// Sort by most decayed first
		decaying.sort(
			(a, b) => a.effective_mastery_computed - b.effective_mastery_computed,
		);
		return decaying;
	}

	// ── Content Picking ───────────────────────────────────────────────

	private findNextLesson(
		allLessons: Lesson[],
		moduleOrder?: Map<string, number>,
	): Lesson | null {
		const available = allLessons.find((l) => l.status === "available");
		if (available) return available;

		// module_id là ObjectId — Number(ObjectId) = NaN nên không thể so trực tiếp.
		// Sắp theo order_index của module (lấy từ moduleOrder), rồi đến order_index bài học.
		const orderOf = (lesson: Lesson): number =>
			moduleOrder?.get(String(lesson.module_id ?? "")) ?? Number.MAX_SAFE_INTEGER;

		const scheduled = allLessons
			.filter((l) => l.status === "scheduled")
			.sort((a, b) => {
				const moduleDelta = orderOf(a) - orderOf(b);
				if (moduleDelta !== 0) return moduleDelta;
				return a.order_index - b.order_index;
			});

		return scheduled[0] ?? null;
	}

	private buildPersonalizedContext(
		profile: StudentProfile,
		signals: AdaptiveRecommendation["signals"],
		currentStreak: number,
	): string[] {
		const context: string[] = [];
		const forgettingTopics = this.cleanTopicList(signals.forgetting_risk_topics);
		const recurringTopics = this.cleanTopicList(signals.recurring_error_topics);
		if (profile.initial_classification) {
			context.push(`phân loại đầu vào: ${profile.initial_classification}`);
		}
		if (signals.last_quiz_score !== null) {
			context.push(`điểm quiz gần nhất: ${signals.last_quiz_score}%`);
		}
		if (signals.hint_usage_rate > 0) {
			context.push(
				`tần suất xin gợi ý: ${Math.round(signals.hint_usage_rate * 100)}%`,
			);
		}
		if (forgettingTopics.length > 0) {
			context.push(`cần ôn: ${forgettingTopics.join(", ")}`);
		}
		if (recurringTopics.length > 0) {
			context.push(`cần củng cố: ${recurringTopics.join(", ")}`);
		}
		if (currentStreak > 0) {
			context.push(`streak hiện tại: ${currentStreak} ngày`);
		}
		return context;
	}

	private buildNewLessonReason(
		lesson: Lesson,
		personalizedContext: string[],
	): string {
		const base = `Bài mới phù hợp tiếp theo: ${lesson.lesson_title}`;
		if (personalizedContext.length === 0) return base;
		return `${base} dựa trên ${personalizedContext.join("; ")}.`;
	}

	private ensurePersonalizedTips(
		tips: string[],
		personalizedContext: string[],
	): string[] {
		const cleanTips = tips.filter((tip) => tip.trim().length > 0).slice(0, 3);
		if (personalizedContext.length === 0) {
			return cleanTips.length > 0
				? cleanTips
				: ["Hãy tập trung và làm bài cẩn thận nhé!"];
		}

		const contextTip = `Gợi ý được cá nhân hóa theo ${personalizedContext.join("; ")}.`;
		return [contextTip, ...cleanTips.filter((tip) => tip !== contextTip)].slice(
			0,
			3,
		);
	}

	private pickReviewItems(
		decayingTopics: TopicMastery[],
		completedLessons: Lesson[],
		allLessons: Lesson[],
		maxCount: number,
	): AdaptiveRecommendation["review_items"] {
		const items: AdaptiveRecommendation["review_items"] = [];
		const usedLessonIds = new Set<string>();

		for (const topic of decayingTopics.slice(0, maxCount)) {
			// Find a completed lesson that covers this topic
			const lesson = completedLessons.find(
				(l) =>
					!usedLessonIds.has(l.id!) &&
					(l.lesson_objective
						?.toLowerCase()
						.includes(topic.topic.toLowerCase()) ||
						l.lesson_title.toLowerCase().includes(topic.topic.toLowerCase())),
			);

			if (lesson) {
				usedLessonIds.add(lesson.id!);
				const decayInfo = topic as TopicMastery & {
					effective_mastery_computed?: number;
					days_since?: number;
				};
				items.push({
					lesson_id: lesson.id!,
					title: lesson.lesson_title,
					topic: topic.topic,
					effective_mastery:
						decayInfo.effective_mastery_computed ?? Number(topic.mastery_level),
					days_since_practice: decayInfo.days_since ?? 0,
					reason: `Kiến thức "${topic.topic}" đang suy giảm (mastery hiệu quả: ${decayInfo.effective_mastery_computed ?? "?"}%)`,
				});
			}
		}

		return items;
	}

	private pickReinforceItems(
		recurringErrorTopics: string[],
		topicMasteries: TopicMastery[],
		completedLessons: Lesson[],
		allLessons: Lesson[],
		maxCount: number,
	): AdaptiveRecommendation["reinforce_items"] {
		const items: AdaptiveRecommendation["reinforce_items"] = [];
		const usedLessonIds = new Set<string>();

		for (const topicName of recurringErrorTopics.slice(0, maxCount)) {
			const cleanTopicName = this.normalizeTopicName(topicName);
			if (!this.hasTopicContent(cleanTopicName)) continue;
			const tm = topicMasteries.find(
				(t) => this.normalizeTopicName(t.topic) === cleanTopicName,
			);
			if (!tm) continue;

			const lesson = completedLessons.find(
				(l) =>
					!usedLessonIds.has(l.id!) &&
					(l.lesson_objective
						?.toLowerCase()
						.includes(cleanTopicName.toLowerCase()) ||
						l.lesson_title.toLowerCase().includes(cleanTopicName.toLowerCase())),
			);

			if (lesson) {
				usedLessonIds.add(lesson.id!);
				const errorCount = tm.total_attempts - tm.correct_attempts;
				items.push({
					lesson_id: lesson.id!,
					title: lesson.lesson_title,
					topic: cleanTopicName,
					recent_error_count: errorCount,
					error_types: [], // could be enriched from quiz error_types JSON
					reason: `Lỗi lặp lại ở "${cleanTopicName}" (${errorCount} lần sai, mastery: ${Number(tm.mastery_level).toFixed(0)}%)`,
				});
			}
		}

		return items;
	}

	private normalizeTopicName(topic: unknown): string {
		return typeof topic === "string" ? topic.replace(/\s+/g, " ").trim() : "";
	}

	private hasTopicContent(topic: string): boolean {
		return topic.replace(/[,\s.;:|/\\()[\]{}_-]+/g, "").length > 0;
	}

	private cleanTopicList(topics: unknown[]): string[] {
		const seen = new Set<string>();
		const cleanTopics: string[] = [];

		for (const topic of topics) {
			const name = this.normalizeTopicName(topic);
			const key = name.toLowerCase();
			if (!this.hasTopicContent(name) || seen.has(key)) continue;

			seen.add(key);
			cleanTopics.push(name);
		}

		return cleanTopics;
	}

	// ── AI Tips ───────────────────────────────────────────────────────

	private async getAITips(
		profile: StudentProfile,
		signals: AdaptiveRecommendation["signals"],
		ratios: AdaptiveRecommendation["session_structure"],
	): Promise<string[]> {
		try {
			const prompt = [
				`Học sinh lớp ${profile.grade_level ?? "?"}, học lực: ${profile.initial_classification ?? "chưa rõ"}.`,
				`Điểm quiz gần nhất: ${signals.last_quiz_score !== null ? `${signals.last_quiz_score}%` : "Chưa có"}`,
				`Tần suất xin gợi ý: ${Math.round(signals.hint_usage_rate * 100)}%`,
				`Thời gian trung bình/câu: ${signals.avg_time_per_question ?? "N/A"} giây`,
				`Lỗi lặp lại ở: ${signals.recurring_error_topics.length > 0 ? signals.recurring_error_topics.join(", ") : "Không có"}`,
				`Độ ổn định: ${(signals.stability_last_5 * 100).toFixed(0)}%`,
				`Chủ đề đang quên: ${signals.forgetting_risk_topics.length > 0 ? signals.forgetting_risk_topics.join(", ") : "Không có"}`,
				`Cấu trúc buổi học: ${Math.round(ratios.review_ratio * 100)}% ôn / ${Math.round(ratios.new_ratio * 100)}% mới / ${Math.round(ratios.reinforce_ratio * 100)}% củng cố`,
				"",
				"Hãy đưa 2-3 lời khuyên ngắn gọn, cụ thể cho buổi học hôm nay.",
				'Trả về JSON array: ["tip1", "tip2", "tip3"]',
			].join("\n");

			const result = await aiService.generateJSON<string[]>(
				"Bạn là gia sư toán thân thiện. Đưa lời khuyên hữu ích dựa trên dữ liệu học tập.",
				prompt,
				{ temperature: 0.5 },
			);

			return Array.isArray(result.data) ? result.data.slice(0, 3) : [];
		} catch {
			return ["Hãy tập trung và làm bài cẩn thận nhé!"];
		}
	}

	// ── Persistence ───────────────────────────────────────────────────

	private async saveRecommendations(
		studentId: string,
		newLesson: AdaptiveRecommendation["new_lesson"],
		reviewItems: AdaptiveRecommendation["review_items"],
		reinforceItems: AdaptiveRecommendation["reinforce_items"],
	): Promise<void> {
		const today = new Date().toISOString().slice(0, 10);

		if (newLesson) {
			await this.createRecommendationIfMissing({
				student_id: studentId,
				lesson_id: newLesson.lesson_id,
				recommendation_type: "next_lesson",
				reason: newLesson.reason,
				priority: 10,
				is_completed: false,
				recommended_date: today,
			} as any);
		}

		for (const item of reviewItems) {
			await this.createRecommendationIfMissing({
				student_id: studentId,
				lesson_id: item.lesson_id,
				recommendation_type: "review",
				reason: item.reason,
				priority: 8,
				is_completed: false,
				recommended_date: today,
			} as any);
		}

		for (const item of reinforceItems) {
			await this.createRecommendationIfMissing({
				student_id: studentId,
				lesson_id: item.lesson_id,
				recommendation_type: "practice",
				reason: item.reason,
				priority: 7,
				is_completed: false,
				recommended_date: today,
			} as any);
		}
	}

	private async createRecommendationIfMissing(
		recommendation: Partial<LessonRecommendation>,
	): Promise<void> {
		await this.recommendationRepo.model
			.findOneAndUpdate(
				{
					student_id: recommendation.student_id,
					lesson_id: recommendation.lesson_id,
					recommendation_type: recommendation.recommendation_type,
					recommended_date: recommendation.recommended_date,
				},
				{ $setOnInsert: recommendation },
				{ upsert: true, new: true, setDefaultsOnInsert: true },
			)
			.exec();
	}

	// ── Helpers ───────────────────────────────────────────────────────

	private async getRecentQuizResults(
		studentId: string,
		limit: number,
	): Promise<LessonQuizResult[]> {
		return (await LessonQuizResultModel.find({ student_id: studentId })
			.sort({ submitted_at: -1 })
			.limit(limit)
			.exec()) as unknown as LessonQuizResult[];
	}

	private normalizeQuizScore(quiz: LessonQuizResult): number {
		if (quiz.percentage !== null) return Number(quiz.percentage);
		if (
			quiz.max_score !== null &&
			Number(quiz.max_score) > 0 &&
			quiz.score !== null
		) {
			return Number(
				((Number(quiz.score) / Number(quiz.max_score)) * 100).toFixed(2),
			);
		}
		if (quiz.total_questions > 0) {
			return Number(
				((quiz.correct_answers / quiz.total_questions) * 100).toFixed(2),
			);
		}
		return 0;
	}

	private async getProfileOrThrow(studentId: string): Promise<StudentProfile> {
		const profile = await this.studentRepo.findById(studentId);
		if (!profile) throw new NotFoundError("Không tìm thấy hồ sơ học sinh");
		return profile as any;
	}

	private emptyRecommendation(reason: string): AdaptiveRecommendation {
		return {
			new_lesson: null,
			review_items: [],
			reinforce_items: [],
			session_structure: { review_ratio: 0, new_ratio: 1, reinforce_ratio: 0 },
			signals: {
				last_quiz_score: null,
				hint_usage_rate: 0,
				avg_time_per_question: null,
				recurring_error_topics: [],
				stability_last_5: 0.5,
				forgetting_risk_topics: [],
			},
			learning_tips: [reason],
			fallback_reason: reason,
			stats: {
				total_lessons: 0,
				completed_lessons: 0,
				remaining_lessons: 0,
				current_streak: 0,
			},
		};
	}

	// ── Legacy compatibility ──────────────────────────────────────────

	/**
	 * Legacy method: returns old TodayRecommendation format.
	 * Use getAdaptiveRecommendation() for the new multi-signal output.
	 */
	public async getTodayRecommendation(
		studentId: string,
	): Promise<AdaptiveRecommendation> {
		return this.getAdaptiveRecommendation(studentId);
	}
}

export const recommendationService = new RecommendationService();
export default recommendationService;
