import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { engagementSessionRepo } from "../models/engagement.model";
import { LessonRecommendationModel } from "../models/lesson.model";
import aiService from "./ai.service";
import { RecommendationService } from "./recommendation.service";

const originalGenerateJSON = aiService.generateJSON;
const originalFindRecentByStudent = engagementSessionRepo.findRecentByStudent;

function createServiceWithRepos(
	overrides: Record<string, unknown>,
): RecommendationService {
	const service = new RecommendationService();
	const defaults: Record<string, unknown> = {
		moduleRepo: {
			async findByCurriculumId() {
				return [{ _id: "module-1", order_index: 1 }];
			},
		},
	};
	Object.assign(
		service as unknown as Record<string, unknown>,
		defaults,
		overrides,
	);
	return service;
}

afterEach(() => {
	aiService.generateJSON = originalGenerateJSON;
	engagementSessionRepo.findRecentByStudent = originalFindRecentByStudent;
});

test("getAdaptiveRecommendation returns stable personalized reasons for new, review, and reinforce recommendations", async () => {
	aiService.generateJSON = async <T>() => ({
		data: [] as T,
		tokensUsed: { input: 0, output: 0 },
	});

	const service = createServiceWithRepos({
		studentRepo: {
			async findById() {
				return {
					id: "student-1",
					user_id: "user-1",
					grade_level: 6,
					initial_classification: "needs_practice",
				};
			},
		},
		curriculumRepo: {
			async findActiveByStudent() {
				return [{ id: "curriculum-1" }];
			},
		},
		lessonRepo: {
			async findByCurriculum() {
				return [
					{
						id: "lesson-completed-1",
						module_id: "module-1",
						lesson_title: "Ôn phân số",
						lesson_objective: "Phân số",
						order_index: 1,
						status: "completed",
					},
					{
						id: "lesson-next-1",
						module_id: "module-1",
						lesson_title: "Bài mới về số thập phân",
						lesson_objective: "Số thập phân",
						order_index: 2,
						status: "available",
					},
				];
			},
		},
		topicMasteryRepo: {
			async findByStudent() {
				return [
					{
						topic: "Phân số",
						mastery_level: 55,
						total_attempts: 10,
						correct_attempts: 4,
						last_practiced_at: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
					},
				];
			},
		},
		progressRepo: {
			async findByStudent() {
				return [{ current_streak_days: 4 }];
			},
		},
		recommendationRepo: {
			model: {
				findOneAndUpdate() {
					return { exec: async () => ({}) };
				},
			},
		},
	});
	(
		service as unknown as { getRecentQuizResults: () => Promise<unknown[]> }
	).getRecentQuizResults = async () => [
		{
			total_questions: 10,
			correct_answers: 4,
			score: 4,
			max_score: 10,
			percentage: 40,
			hint_count: 5,
		},
	];
	engagementSessionRepo.findRecentByStudent = async () =>
		[{ active_duration_seconds: 600, answer_count: 10 }] as Awaited<
			ReturnType<typeof engagementSessionRepo.findRecentByStudent>
		>;

	const recommendation = await service.getAdaptiveRecommendation("student-1");

	assert.ok(recommendation.new_lesson);
	assert.match(recommendation.new_lesson.reason, /needs_practice/);
	assert.match(recommendation.new_lesson.reason, /4 ngày/);
	assert.equal(recommendation.review_items.length, 1);
	assert.match(recommendation.review_items[0].reason, /Phân số/);
	assert.equal(recommendation.reinforce_items.length, 1);
	assert.match(recommendation.reinforce_items[0].reason, /Phân số/);
	assert.equal(recommendation.fallback_reason, null);
	assert.ok(
		recommendation.learning_tips.some(
			(tip) => tip.includes("needs_practice") || tip.includes("4 ngày"),
		),
	);
});

test("getAdaptiveRecommendation removes empty topic names from personalized context", async () => {
	aiService.generateJSON = async <T>() => ({
		data: [] as T,
		tokensUsed: { input: 0, output: 0 },
	});

	const oldPracticeDate = new Date(
		Date.now() - 30 * 24 * 60 * 60 * 1000,
	);
	const service = createServiceWithRepos({
		studentRepo: {
			async findById() {
				return {
					id: "student-1",
					user_id: "user-1",
					grade_level: 8,
					initial_classification: "trung_binh",
				};
			},
		},
		curriculumRepo: {
			async findActiveByStudent() {
				return [{ id: "curriculum-1" }];
			},
		},
		lessonRepo: {
			async findByCurriculum() {
				return [
					{
						id: "lesson-completed-1",
						module_id: "module-1",
						lesson_title: "Đại số - Căn bậc hai",
						lesson_objective: "Đại số - Căn bậc hai",
						order_index: 1,
						status: "completed",
					},
					{
						id: "lesson-next-1",
						module_id: "module-1",
						lesson_title: "Rút gọn phân thức đại số",
						lesson_objective: "Phân thức đại số",
						order_index: 2,
						status: "available",
					},
				];
			},
		},
		topicMasteryRepo: {
			async findByStudent() {
				return [
					{
						topic: "",
						mastery_level: 55,
						total_attempts: 10,
						correct_attempts: 3,
						last_practiced_at: oldPracticeDate,
					},
					{
						topic: ",",
						mastery_level: 55,
						total_attempts: 10,
						correct_attempts: 3,
						last_practiced_at: oldPracticeDate,
					},
					{
						topic: "Đại số - Căn bậc hai",
						mastery_level: 55,
						total_attempts: 10,
						correct_attempts: 3,
						last_practiced_at: oldPracticeDate,
					},
				];
			},
		},
		progressRepo: {
			async findByStudent() {
				return [];
			},
		},
		recommendationRepo: {
			model: {
				findOneAndUpdate() {
					return { exec: async () => ({}) };
				},
			},
		},
	});
	(
		service as unknown as { getRecentQuizResults: () => Promise<unknown[]> }
	).getRecentQuizResults = async () => [
		{
			total_questions: 3,
			correct_answers: 3,
			score: 3,
			max_score: 3,
			percentage: 100,
			hint_count: 0,
		},
	];
	engagementSessionRepo.findRecentByStudent = async () => [] as Awaited<
		ReturnType<typeof engagementSessionRepo.findRecentByStudent>
	>;

	const recommendation = await service.getAdaptiveRecommendation("student-1");

	assert.deepEqual(recommendation.signals.forgetting_risk_topics, [
		"Đại số - Căn bậc hai",
	]);
	assert.deepEqual(recommendation.signals.recurring_error_topics, [
		"Đại số - Căn bậc hai",
	]);
	assert.doesNotMatch(recommendation.new_lesson?.reason ?? "", /cần ôn: ,/);
	assert.doesNotMatch(recommendation.learning_tips[0] ?? "", /cần ôn: ,/);
});

test("getAdaptiveRecommendation does not create duplicate recommendations for the same student, date, type, and lesson", async () => {
	aiService.generateJSON = async <T>() => ({
		data: [] as T,
		tokensUsed: { input: 0, output: 0 },
	});

	type RecommendationCreateInput = {
		student_id: string;
		lesson_id: string;
		recommendation_type: string;
		recommended_date: string;
	};
	const persisted = new Map<string, RecommendationCreateInput>();
	let insertedCount = 0;

	const service = createServiceWithRepos({
		studentRepo: {
			async findById() {
				return {
					id: "student-1",
					user_id: "user-1",
					grade_level: 6,
					initial_classification: "needs_practice",
				};
			},
		},
		curriculumRepo: {
			async findActiveByStudent() {
				return [{ id: "curriculum-1" }];
			},
		},
		lessonRepo: {
			async findByCurriculum() {
				return [
					{
						id: "lesson-completed-1",
						lesson_title: "Ôn phân số",
						lesson_objective: "Phân số",
						order_index: 1,
						status: "completed",
					},
					{
						id: "lesson-next-1",
						lesson_title: "Bài mới về số thập phân",
						lesson_objective: "Số thập phân",
						order_index: 2,
						status: "available",
					},
				];
			},
		},
		topicMasteryRepo: {
			async findByStudent() {
				return [
					{
						topic: "Phân số",
						mastery_level: 45,
						total_attempts: 6,
						correct_attempts: 2,
						last_practiced_at: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
					},
				];
			},
		},
		progressRepo: {
			async findByStudent() {
				return [{ current_streak_days: 2 }];
			},
		},
		recommendationRepo: {
			model: {
				findOneAndUpdate(
					query: RecommendationCreateInput,
					update: { $setOnInsert: RecommendationCreateInput },
				) {
					return {
						exec: async () => {
							const key = `${query.student_id}:${query.recommended_date}:${query.recommendation_type}:${query.lesson_id}`;
							const existing = persisted.get(key);
							if (existing) return existing;

							insertedCount += 1;
							persisted.set(key, update.$setOnInsert);
							return update.$setOnInsert;
						},
					};
				},
			},
		},
	});
	(
		service as unknown as { getRecentQuizResults: () => Promise<unknown[]> }
	).getRecentQuizResults = async () => [
		{
			total_questions: 10,
			correct_answers: 4,
			score: 4,
			max_score: 10,
			percentage: 40,
			hint_count: 5,
		},
	];
	engagementSessionRepo.findRecentByStudent = async () =>
		[{ active_duration_seconds: 600, answer_count: 10 }] as Awaited<
			ReturnType<typeof engagementSessionRepo.findRecentByStudent>
		>;

	const first = await service.getAdaptiveRecommendation("student-1");
	const insertedCountAfterFirstRead = insertedCount;
	const second = await service.getAdaptiveRecommendation("student-1");

	assert.equal(insertedCount, insertedCountAfterFirstRead);
	assert.deepEqual(second.new_lesson, first.new_lesson);
	assert.equal(persisted.size, insertedCountAfterFirstRead);
});

test("LessonRecommendation has a unique idempotency index scoped by student, lesson, type, and date", () => {
	const hasUniqueIdempotencyIndex = LessonRecommendationModel.schema
		.indexes()
		.some(([fields, options]) => {
			assert.ok(fields);
			return (
				fields.student_id === 1 &&
				fields.lesson_id === 1 &&
				fields.recommendation_type === 1 &&
				fields.recommended_date === 1 &&
				options?.unique === true
			);
		});

	assert.equal(hasUniqueIdempotencyIndex, true);
});

test("createRecommendationIfMissing persists via atomic upsert keyed by student, lesson, type, and date", async () => {
	const calls: Array<{
		filter: Record<string, unknown>;
		update: Record<string, unknown>;
		options: Record<string, unknown>;
	}> = [];
	const recommendation = {
		student_id: "student-1",
		lesson_id: "lesson-1",
		recommendation_type: "review",
		reason: "Review fractions",
		priority: 8,
		is_completed: false,
		recommended_date: "2026-05-12",
	};
	const service = createServiceWithRepos({
		recommendationRepo: {
			model: {
				findOneAndUpdate(
					filter: Record<string, unknown>,
					update: Record<string, unknown>,
					options: Record<string, unknown>,
				) {
					calls.push({ filter, update, options });
					return { exec: async () => recommendation };
				},
			},
			async findOne() {
				throw new Error("non-atomic findOne must not be used");
			},
			async create() {
				throw new Error("non-atomic create must not be used");
			},
		},
	});

	await (
		service as unknown as {
			createRecommendationIfMissing: (
				data: typeof recommendation,
			) => Promise<void>;
		}
	).createRecommendationIfMissing(recommendation);

	assert.equal(calls.length, 1);
	assert.deepEqual(calls[0].filter, {
		student_id: "student-1",
		lesson_id: "lesson-1",
		recommendation_type: "review",
		recommended_date: "2026-05-12",
	});
	assert.deepEqual(calls[0].update, { $setOnInsert: recommendation });
	assert.deepEqual(calls[0].options, {
		upsert: true,
		new: true,
		setDefaultsOnInsert: true,
	});
});

test("getAdaptiveRecommendation returns a stable fallback reason when no active curriculum exists", async () => {
	const service = createServiceWithRepos({
		studentRepo: {
			async findById() {
				return {
					id: "student-1",
					user_id: "user-1",
					grade_level: 6,
					initial_classification: "advanced",
				};
			},
		},
		curriculumRepo: {
			async findActiveByStudent() {
				return [];
			},
		},
	});

	const recommendation = await service.getAdaptiveRecommendation("student-1");

	assert.equal(recommendation.new_lesson, null);
	assert.deepEqual(recommendation.review_items, []);
	assert.deepEqual(recommendation.reinforce_items, []);
	assert.equal(
		recommendation.fallback_reason,
		"Chưa có giáo trình. Hãy làm bài kiểm tra đầu vào và tạo giáo trình trước.",
	);
	assert.equal(recommendation.learning_tips[0], recommendation.fallback_reason);
});
