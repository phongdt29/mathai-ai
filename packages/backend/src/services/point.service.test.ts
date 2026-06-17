import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { type ClientSession, Types } from "mongoose";

import {
	type ILesson,
	type ILessonExercise,
	type ILessonQuizResult,
	LessonModel,
	LessonQuizResultModel,
	LessonRecommendationModel,
	lessonQuizResultRepository,
} from "../models/lesson.model";
import { StudentProgressModel, TopicMasteryModel } from "../models/progress.model";
import { studentProfileRepository } from "../models/student.model";
import {
	type IPointLedger,
	type PointLedgerAttemptFilter,
	type PointLedgerCreateInput,
	PointLedgerRepository,
} from "../models/point-ledger.model";
import { type LessonPointRecorder, LessonService } from "./lesson.service";
import { PointService } from "./point.service";

function readPackageJson(packagePath: string): {
	scripts?: Record<string, string>;
} {
	return JSON.parse(readFileSync(packagePath, "utf8")) as {
		scripts?: Record<string, string>;
	};
}

function makeLedger(
	filter: PointLedgerAttemptFilter,
	insert: PointLedgerCreateInput,
): IPointLedger {
	return {
		_id: "ledger-1",
		student_id: filter.student_id,
		source_type: filter.source_type,
		source_id: filter.source_id,
		attempt_id: filter.attempt_id,
		earned_points: insert.earned_points,
		max_points: insert.max_points,
		reward_points: insert.reward_points,
		competency_score: insert.competency_score,
		reason: insert.reason,
		metadata: insert.metadata,
		created_by: insert.created_by ?? null,
		createdAt: new Date(),
		updatedAt: new Date(),
	} as unknown as IPointLedger;
}

function makeLessonQuizResult(
	overrides: Partial<ILessonQuizResult> = {},
): ILessonQuizResult {
	return {
		_id: new Types.ObjectId("507f1f77bcf86cd799439099"),
		lesson_id: new Types.ObjectId("507f1f77bcf86cd799439012"),
		student_id: new Types.ObjectId("507f1f77bcf86cd799439011"),
		idempotency_key: "quiz-key-1",
		total_questions: 10,
		correct_answers: 8,
		score: 8,
		max_score: 10,
		percentage: 80,
		duration_seconds: 420,
		ai_feedback: null,
		passed: true,
		started_at: null,
		submitted_at: new Date(),
		createdAt: new Date(),
		updatedAt: new Date(),
		...overrides,
		toObject() {
			return { ...this };
		},
	} as unknown as ILessonQuizResult;
}

test("backend package exposes node:test scripts", () => {
	const { scripts } = readPackageJson(join(__dirname, "../../package.json"));
	assert.equal(
		scripts?.test,
		'node --import tsx --test "src/**/*.test.ts" "scripts/**/*.test.ts"',
	);
	assert.equal(
		scripts?.["test:ci"],
		'node --import tsx --test --test-reporter=tap "src/**/*.test.ts" "scripts/**/*.test.ts"',
	);
});

test("backend package exposes point ledger index migration script", () => {
	const { scripts } = readPackageJson(join(__dirname, "../../package.json"));

	assert.equal(
		scripts?.["migrate:point-ledger-indexes"],
		"tsx scripts/migrate-point-ledger-indexes.ts",
	);
});

test("root package exposes backend test workspace script", () => {
	const { scripts } = readPackageJson(
		join(__dirname, "../../../../package.json"),
	);
	assert.equal(
		scripts?.["test:backend"],
		"npm run test --workspace=packages/backend",
	);
});

test("createQuizResult derives passed server-side and validates duration_seconds", async () => {
	const created: Partial<ILessonQuizResult>[] = [];

	class TestLessonService extends LessonService {
		public override async getStudentIdForUser(
			_userId: string,
		): Promise<string> {
			return "507f1f77bcf86cd799439011";
		}

		public override async getOwnedLesson(
			_lessonId: string,
			_studentId: string,
		): Promise<ILesson> {
			return {
				_id: new Types.ObjectId("507f1f77bcf86cd799439012"),
				student_id: new Types.ObjectId("507f1f77bcf86cd799439011"),
			} as unknown as ILesson;
		}
	}

	const service = new TestLessonService(
		{
			async createQuizResult(data: Partial<ILessonQuizResult>) {
				created.push(data);
				return makeLessonQuizResult(data);
			},
		},
		{
			async recordLessonResult(input) {
				const studentObjectId = new Types.ObjectId(input.student_id);
				return makeLedger(
					{
						student_id: input.student_id,
						source_type: "lesson",
						source_id: input.lesson_id,
						attempt_id: input.attempt_id,
					},
					{
						student_id: studentObjectId,
						source_type: "lesson",
						source_id: input.lesson_id,
						attempt_id: input.attempt_id,
						earned_points: input.earned_points,
						max_points: input.max_points,
						reward_points: input.earned_points,
						competency_score: input.competency_score ?? 0,
						reason: input.reason ?? null,
						metadata: input.metadata ?? null,
						created_by: null,
					},
				);
			},
		},
	);

	const result = await service.createQuizResult(
		"user-1",
		"507f1f77bcf86cd799439012",
		{
			score: 6.9,
			max_score: 10,
			duration_seconds: 12,
			passed: true,
		},
	);

	assert.equal(created.length, 1);
	assert.equal(created[0]?.duration_seconds, 12);
	assert.equal(created[0]?.percentage, 69);
	assert.equal(created[0]?.passed, false);
	assert.equal(result.result.passed, false);

	await assert.rejects(
		() =>
			service.createQuizResult("user-1", "507f1f77bcf86cd799439012", {
				score: 8,
				max_score: 10,
				duration_seconds: 1.5,
			}),
		/duration_seconds must be a non-negative integer/,
	);
	await assert.rejects(
		() =>
			service.createQuizResult("user-1", "507f1f77bcf86cd799439012", {
				score: 8,
				max_score: 10,
				duration_seconds: Number.POSITIVE_INFINITY,
			}),
		/duration_seconds must be a non-negative integer/,
	);
});

test("createQuizResult idempotent retry records ledger through injected recorder", async () => {
	const originalFinalize = (LessonService.prototype as any).finalizePassedLessonQuiz;
	(LessonService.prototype as any).finalizePassedLessonQuiz = async () => ({
		lesson_completed: false,
		progress_updated: false,
		mastery_updated: false,
		recommendation_completed: false,
	});
	const existingResult = makeLessonQuizResult({
		_id: new Types.ObjectId("507f1f77bcf86cd799439098"),
		score: 9,
		max_score: 10,
		percentage: 90,
		idempotency_key: "retry-key-1",
	});
	const recordedInputs: Parameters<
		LessonPointRecorder["recordLessonResult"]
	>[0][] = [];
	const originalFindByIdempotencyKey =
		lessonQuizResultRepository.findByIdempotencyKey;

	class TestLessonService extends LessonService {
		public override async getStudentIdForUser(
			_userId: string,
		): Promise<string> {
			return "507f1f77bcf86cd799439011";
		}

		public override async getOwnedLesson(
			_lessonId: string,
			_studentId: string,
		): Promise<ILesson> {
			return {
				_id: new Types.ObjectId("507f1f77bcf86cd799439012"),
				student_id: new Types.ObjectId("507f1f77bcf86cd799439011"),
			} as unknown as ILesson;
		}
	}

	const injectedRecorder: LessonPointRecorder = {
		async recordLessonResult(input) {
			recordedInputs.push(input);
			const studentObjectId = new Types.ObjectId(input.student_id);
			return makeLedger(
				{
					student_id: input.student_id,
					source_type: "lesson",
					source_id: input.lesson_id,
					attempt_id: input.attempt_id,
				},
				{
					student_id: studentObjectId,
					source_type: "lesson",
					source_id: input.lesson_id,
					attempt_id: input.attempt_id,
					earned_points: input.earned_points,
					max_points: input.max_points,
					reward_points: input.earned_points,
					competency_score: input.competency_score ?? 0,
					reason: input.reason ?? null,
					metadata: input.metadata ?? null,
					created_by: null,
				},
			);
		},
	};

	lessonQuizResultRepository.findByIdempotencyKey = async () => existingResult;

	try {
		const service = new TestLessonService(
			{
				async createQuizResult() {
					throw new Error("createQuizResult should not run for existing retry");
				},
			},
			injectedRecorder,
		);

		const response = await service.createQuizResult(
			"user-1",
			"507f1f77bcf86cd799439012",
			{
				score: 9,
				max_score: 10,
				idempotency_key: " retry-key-1 ",
				metadata: { source: "retry" },
			},
		);

		assert.equal(response.idempotent, true);
		assert.equal(recordedInputs.length, 1);
		assert.deepEqual(recordedInputs[0], {
			student_id: "507f1f77bcf86cd799439011",
			lesson_id: "507f1f77bcf86cd799439012",
			attempt_id: "507f1f77bcf86cd799439098",
			earned_points: 9,
			max_points: 10,
			competency_score: 90,
			reason: "Lesson quiz submitted",
			metadata: { source: "retry", idempotency_key: "retry-key-1" },
		});
	} finally {
		lessonQuizResultRepository.findByIdempotencyKey =
			originalFindByIdempotencyKey;
		(LessonService.prototype as any).finalizePassedLessonQuiz = originalFinalize;
	}
});

test("passed lesson quiz finalization closes lesson/progress/mastery/recommendation loop", async () => {
	const calls: string[] = [];
	const originalLessonUpdateOne = LessonModel.updateOne;
	const originalLessonCountDocuments = LessonModel.countDocuments;
	const originalQuizAggregate = LessonQuizResultModel.aggregate;
	const originalProgressUpdateOne = StudentProgressModel.updateOne;
	const originalMasteryFindOne = TopicMasteryModel.findOne;
	const originalMasteryUpdateOne = TopicMasteryModel.updateOne;
	const originalRecommendationUpdateMany = LessonRecommendationModel.updateMany;
	const originalFindProfile = studentProfileRepository.findById;

	class TestLessonService extends LessonService {
		public async finalize(input: any) {
			return this.finalizePassedLessonQuiz(input);
		}
	}

	try {
		(LessonModel.updateOne as any) = (filter: unknown, update: unknown) => ({
			exec: async () => {
				calls.push("lesson");
				assert.deepEqual((update as any).$set, { status: "completed" });
				return { modifiedCount: 1 };
			},
		});
		(LessonModel.countDocuments as any) = (filter: Record<string, unknown>) => ({
			exec: async () => (filter.status === "completed" ? 3 : 5),
		});
		(LessonQuizResultModel.aggregate as any) = () => ({
			exec: async () => [{ average: 82.345 }],
		});
		(StudentProgressModel.updateOne as any) = (_filter: unknown, update: unknown) => ({
			exec: async () => {
				calls.push("progress");
				assert.equal((update as any).$set.total_lessons, 5);
				assert.equal((update as any).$set.completed_lessons, 3);
				assert.equal((update as any).$set.completion_percentage, 60);
				assert.equal((update as any).$set.average_quiz_score, 82.34);
				return { modifiedCount: 1, upsertedCount: 0 };
			},
		});
		(TopicMasteryModel.findOne as any) = () => ({
			exec: async () => ({ total_attempts: 2, correct_attempts: 1 }),
		});
		const masteryUpdates: unknown[] = [];
		(TopicMasteryModel.updateOne as any) = (_filter: unknown, update: unknown) => ({
			exec: async () => {
				calls.push("mastery");
				masteryUpdates.push(update);
				return { modifiedCount: 1, upsertedCount: 0 };
			},
		});
		(LessonRecommendationModel.updateMany as any) = () => ({
			exec: async () => {
				calls.push("recommendation");
				return { modifiedCount: 1 };
			},
		});
		studentProfileRepository.findById = async () => ({ grade_level: 7 }) as any;

		const lessonId = "507f1f77bcf86cd799439012";
		const studentId = "507f1f77bcf86cd799439011";
		const curriculumId = new Types.ObjectId("507f1f77bcf86cd799439013");
		const result = await new TestLessonService().finalize({
			studentId,
			lesson: {
				_id: new Types.ObjectId(lessonId),
				student_id: new Types.ObjectId(studentId),
				curriculum_id: curriculumId,
				lesson_title: "Phân số",
				lesson_objective: "Cộng phân số",
				status: "available",
			} as unknown as ILesson,
			result: makeLessonQuizResult({ passed: true, percentage: 100 }),
			gradedExercises: [
				{
					exercise: { topic: "Cộng phân số" } as unknown as ILessonExercise,
					graded: { is_correct: true, score: 1 },
				},
				{
					exercise: { topic: null } as unknown as ILessonExercise,
					graded: { is_correct: false, score: 0 },
				},
			],
		});

		assert.deepEqual(result, {
			lesson_completed: true,
			progress_updated: true,
			mastery_updated: true,
			recommendation_completed: true,
		});
		assert.deepEqual(calls, ["lesson", "progress", "mastery", "recommendation"]);
		assert.equal(masteryUpdates.length, 1);
		assert.equal((masteryUpdates[0] as any).$set.total_attempts, 4);
		assert.equal((masteryUpdates[0] as any).$set.correct_attempts, 2);
		assert.equal((masteryUpdates[0] as any).$set.mastery_level, 50);
	} finally {
		(LessonModel.updateOne as any) = originalLessonUpdateOne;
		(LessonModel.countDocuments as any) = originalLessonCountDocuments;
		(LessonQuizResultModel.aggregate as any) = originalQuizAggregate;
		(StudentProgressModel.updateOne as any) = originalProgressUpdateOne;
		(TopicMasteryModel.findOne as any) = originalMasteryFindOne;
		(TopicMasteryModel.updateOne as any) = originalMasteryUpdateOne;
		(LessonRecommendationModel.updateMany as any) = originalRecommendationUpdateMany;
		studentProfileRepository.findById = originalFindProfile;
	}
});

test("recordAssessmentResult uses an atomic upsert for idempotent assessment awards", async () => {
	const calls: Array<{
		filter: PointLedgerAttemptFilter;
		insert: PointLedgerCreateInput;
	}> = [];

	class FakePointLedgerRepository extends PointLedgerRepository {
		public async upsertAssessmentLedger(
			filter: PointLedgerAttemptFilter,
			insert: PointLedgerCreateInput,
			_session?: ClientSession,
		): Promise<IPointLedger> {
			calls.push({ filter, insert });
			return makeLedger(filter, insert);
		}
	}

	const service = new PointService(new FakePointLedgerRepository());

	const ledger = await service.recordAssessmentResult({
		student_id: "507f1f77bcf86cd799439011",
		assessment_id: "507f1f77bcf86cd799439012",
		attempt_id: "attempt-1",
		earned_points: 8,
		max_points: 10,
		difficulty: "hard",
	});

	assert.equal(calls.length, 1);
	assert.deepEqual(calls[0]?.filter, {
		student_id: "507f1f77bcf86cd799439011",
		source_type: "assessment",
		source_id: "507f1f77bcf86cd799439012",
		attempt_id: "attempt-1",
	});
	assert.equal(calls[0]?.insert.source_id, "507f1f77bcf86cd799439012");
	assert.equal(calls[0]?.insert.attempt_id, "attempt-1");
	assert.equal(calls[0]?.insert.created_by, null);
	assert.equal(calls[0]?.insert.metadata, null);
	assert.equal(ledger.source_id, "507f1f77bcf86cd799439012");
	assert.equal(ledger.attempt_id, "attempt-1");
});

test("recordLessonResult records idempotent lesson awards with normalized ids", async () => {
	const calls: Array<{
		filter: PointLedgerAttemptFilter;
		insert: PointLedgerCreateInput;
	}> = [];

	class FakePointLedgerRepository extends PointLedgerRepository {
		public async upsertLessonLedger(
			filter: PointLedgerAttemptFilter,
			insert: PointLedgerCreateInput,
			_session?: ClientSession,
		): Promise<IPointLedger> {
			calls.push({ filter, insert });
			return makeLedger(filter, insert);
		}
	}

	const service = new PointService(new FakePointLedgerRepository());
	await service.recordLessonResult({
		student_id: "507f1f77bcf86cd799439011",
		lesson_id: "507f1f77bcf86cd799439012",
		attempt_id: "lesson-result-1",
		earned_points: 7.5,
		max_points: 10,
		reason: "Lesson quiz submitted",
		metadata: { idempotency_key: "client-key-1" },
	});

	assert.equal(calls.length, 1);
	assert.deepEqual(calls[0]?.filter, {
		student_id: "507f1f77bcf86cd799439011",
		source_type: "lesson",
		source_id: "507f1f77bcf86cd799439012",
		attempt_id: "lesson-result-1",
	});
	assert.equal(calls[0]?.insert.source_type, "lesson");
	assert.equal(calls[0]?.insert.source_id, "507f1f77bcf86cd799439012");
	assert.equal(calls[0]?.insert.reward_points, 7.5);
	assert.equal(calls[0]?.insert.competency_score, 75);
});

test("recordLessonResult validates earned points within max points", async () => {
	const service = new PointService({} as PointLedgerRepository);

	await assert.rejects(
		() =>
			service.recordLessonResult({
				student_id: "507f1f77bcf86cd799439011",
				lesson_id: "507f1f77bcf86cd799439012",
				attempt_id: "lesson-result-1",
				earned_points: 11,
				max_points: 10,
			}),
		/Earned points must be between 0 and max points/,
	);
});

test("recordLessonResult rejects missing attempt ids before touching the repository", async () => {
	const service = new PointService({} as PointLedgerRepository);

	await assert.rejects(
		() =>
			service.recordLessonResult({
				student_id: "507f1f77bcf86cd799439011",
				lesson_id: "507f1f77bcf86cd799439012",
				attempt_id: "   ",
				earned_points: 5,
				max_points: 10,
			}),
		/Attempt id is required/,
	);
});

test("recordLessonResult rejects missing source ids before touching the repository", async () => {
	const service = new PointService({} as PointLedgerRepository);

	await assert.rejects(
		() =>
			service.recordLessonResult({
				student_id: "507f1f77bcf86cd799439011",
				lesson_id: "   ",
				attempt_id: "lesson-result-1",
				earned_points: 5,
				max_points: 10,
			}),
		/Source id is required/,
	);
});

test("recordTeacherAssignmentResult updates the assignment ledger row on regrade", async () => {
	const calls: Array<{
		filter: PointLedgerAttemptFilter;
		insert: PointLedgerCreateInput;
	}> = [];

	class FakePointLedgerRepository extends PointLedgerRepository {
		public async updateTeacherAssignmentLedger(
			filter: PointLedgerAttemptFilter,
			insert: PointLedgerCreateInput,
			_session?: ClientSession,
		): Promise<IPointLedger> {
			calls.push({ filter, insert });
			return makeLedger(filter, insert);
		}
	}

	const service = new PointService(new FakePointLedgerRepository());
	await service.recordTeacherAssignmentResult({
		student_id: "507f1f77bcf86cd799439011",
		assignment_id: "507f1f77bcf86cd799439012",
		submission_id: "507f1f77bcf86cd799439013",
		earned_points: 9,
		max_points: 12,
		created_by: "teacher-1",
	});

	assert.equal(calls.length, 1);
	assert.deepEqual(calls[0]?.filter, {
		student_id: "507f1f77bcf86cd799439011",
		source_type: "teacher_assignment",
		source_id: "507f1f77bcf86cd799439012",
		attempt_id: "507f1f77bcf86cd799439013",
	});
	assert.equal(calls[0]?.insert.source_id, "507f1f77bcf86cd799439012");
	assert.equal(calls[0]?.insert.reward_points, 9);
	assert.equal(calls[0]?.insert.competency_score, 75);
	assert.equal(calls[0]?.insert.created_by, "teacher-1");
});

test("recordTeacherAssignmentResult validates earned points within assignment total", async () => {
	const service = new PointService({} as PointLedgerRepository);

	await assert.rejects(
		() =>
			service.recordTeacherAssignmentResult({
				student_id: "507f1f77bcf86cd799439011",
				assignment_id: "507f1f77bcf86cd799439012",
				submission_id: "507f1f77bcf86cd799439013",
				earned_points: 13,
				max_points: 12,
				created_by: "teacher-1",
			}),
		/Earned points must be between 0 and max points/,
	);
});

test("recordTeacherAssignmentResult rejects missing submission ids before touching the repository", async () => {
	const service = new PointService({} as PointLedgerRepository);

	await assert.rejects(
		() =>
			service.recordTeacherAssignmentResult({
				student_id: "507f1f77bcf86cd799439011",
				assignment_id: "507f1f77bcf86cd799439012",
				submission_id: "",
				earned_points: 5,
				max_points: 10,
				created_by: "teacher-1",
			}),
		/Attempt id is required/,
	);
});

test("recordAssessmentResult normalizes source and attempt ids in the upsert filter", async () => {
	const calls: Array<{
		filter: PointLedgerAttemptFilter;
		insert: PointLedgerCreateInput;
	}> = [];

	class FakePointLedgerRepository extends PointLedgerRepository {
		public async upsertAssessmentLedger(
			filter: PointLedgerAttemptFilter,
			insert: PointLedgerCreateInput,
			_session?: ClientSession,
		): Promise<IPointLedger> {
			calls.push({ filter, insert });
			return makeLedger(filter, insert);
		}
	}

	const service = new PointService(new FakePointLedgerRepository());
	await service.recordAssessmentResult({
		student_id: "507f1f77bcf86cd799439011",
		assessment_id: " 507f1f77bcf86cd799439012 ",
		attempt_id: " attempt-1 ",
		earned_points: 8,
		max_points: 10,
	});

	assert.equal(calls.length, 1);
	assert.deepEqual(calls[0]?.filter, {
		student_id: "507f1f77bcf86cd799439011",
		source_type: "assessment",
		source_id: "507f1f77bcf86cd799439012",
		attempt_id: "attempt-1",
	});
	assert.equal(calls[0]?.insert.source_id, "507f1f77bcf86cd799439012");
	assert.equal(calls[0]?.insert.attempt_id, "attempt-1");
});

test("getStudentPointSummary uses stored weighted competency scores and ignores zero-max adjustments", async () => {
	const studentId = "507f1f77bcf86cd799439011";
	const studentObjectId = new Types.ObjectId(studentId);
	const entries: IPointLedger[] = [
		{
			_id: "ledger-assessment-1",
			student_id: studentObjectId,
			source_type: "assessment",
			source_id: "assessment-1",
			attempt_id: "attempt-1",
			earned_points: 9,
			max_points: 10,
			reward_points: 9,
			competency_score: 40,
			reason: "Assessment graded",
			metadata: null,
			created_by: null,
			createdAt: new Date(),
			updatedAt: new Date(),
		} as unknown as IPointLedger,
		{
			_id: "ledger-assessment-2",
			student_id: studentObjectId,
			source_type: "assessment",
			source_id: "assessment-2",
			attempt_id: "attempt-2",
			earned_points: 4,
			max_points: 20,
			reward_points: 4,
			competency_score: 70,
			reason: "Assessment graded",
			metadata: null,
			created_by: null,
			createdAt: new Date(),
			updatedAt: new Date(),
		} as unknown as IPointLedger,
		{
			_id: "ledger-manual-1",
			student_id: studentObjectId,
			source_type: "manual_adjustment",
			source_id: "manual_adjustment",
			attempt_id: null,
			earned_points: 0,
			max_points: 0,
			reward_points: 5,
			competency_score: 100,
			reason: "Bonus points",
			metadata: null,
			created_by: "admin-1",
			createdAt: new Date(),
			updatedAt: new Date(),
		} as unknown as IPointLedger,
	];

	class FakePointLedgerRepository extends PointLedgerRepository {
		public async findByStudentId(_studentId: string): Promise<IPointLedger[]> {
			return entries;
		}
	}

	const service = new PointService(new FakePointLedgerRepository());
	const summary = await service.getStudentPointSummary(studentId);

	assert.equal(summary.total_earned_points, 13);
	assert.equal(summary.total_available_points, 30);
	assert.equal(summary.reward_points, 18);
	assert.equal(summary.academic_percentage, 43.33);
	assert.equal(summary.competency_score, 60);
	assert.equal(summary.by_source_type.assessment?.competency_score, 60);
	assert.equal(summary.by_source_type.manual_adjustment?.competency_score, 0);
	assert.equal(summary.gamification.level, 1);
	assert.equal(summary.gamification.level_title, "Khởi động");
	assert.equal(summary.gamification.next_level_reward_points, 50);
	assert.equal(summary.gamification.points_to_next_level, 32);
	assert.equal(summary.gamification.badges.find((badge) => badge.key === "first_points")?.unlocked, true);
	assert.equal(summary.gamification.badges.find((badge) => badge.key === "lesson_momentum")?.progress.current, 0);

	const historyResult = await service.getStudentPointHistory(studentId);
	assert.equal(historyResult.summary.competency_score, 60);
	assert.equal(historyResult.summary.gamification.badges.length, 5);
});

test("recordManualAdjustment appends positive or negative rows with reason and creator", async () => {
	const calls: PointLedgerCreateInput[] = [];

	class FakePointLedgerRepository extends PointLedgerRepository {
		public async create(
			insert: Partial<IPointLedger>,
			_session?: ClientSession,
		): Promise<IPointLedger> {
			calls.push(insert as PointLedgerCreateInput);
			return {
				_id: "ledger-manual-1",
				...insert,
				createdAt: new Date(),
				updatedAt: new Date(),
			} as unknown as IPointLedger;
		}
	}

	const service = new PointService(new FakePointLedgerRepository());
	const ledger = await service.recordManualAdjustment({
		student_id: "507f1f77bcf86cd799439011",
		reward_points: -3,
		reason: "Correct duplicate award",
		created_by: "admin-1",
		metadata: { note: "audit note" },
	});

	assert.equal(calls.length, 1);
	assert.equal(calls[0]?.source_type, "manual_adjustment");
	assert.ok(calls[0]?.student_id instanceof Types.ObjectId);
	assert.equal(calls[0]?.source_id, "manual_adjustment");
	assert.equal(calls[0]?.attempt_id, null);
	assert.equal(calls[0]?.earned_points, 0);
	assert.equal(calls[0]?.max_points, 0);
	assert.equal(calls[0]?.reward_points, -3);
	assert.equal(calls[0]?.competency_score, 0);
	assert.equal(calls[0]?.reason, "Correct duplicate award");
	assert.equal(calls[0]?.created_by, "admin-1");
	assert.equal(ledger.reward_points, -3);
});

test("recordManualAdjustment rejects zero adjustments and missing audit fields", async () => {
	const service = new PointService({} as PointLedgerRepository);

	await assert.rejects(
		() =>
			service.recordManualAdjustment({
				student_id: "507f1f77bcf86cd799439011",
				reward_points: 0,
				reason: "No-op",
				created_by: "admin-1",
			}),
		/Manual adjustment reward points must be non-zero/,
	);

	await assert.rejects(
		() =>
			service.recordManualAdjustment({
				student_id: "507f1f77bcf86cd799439011",
				reward_points: 1,
				reason: "   ",
				created_by: "admin-1",
			}),
		/Manual adjustment reason is required/,
	);

	await assert.rejects(
		() =>
			service.recordManualAdjustment({
				student_id: "507f1f77bcf86cd799439011",
				reward_points: 1,
				reason: "Bonus",
				created_by: "",
			}),
		/Manual adjustment creator is required/,
	);
});


test("getStudentPointSummary clamps negative gamification progress and reward points", async () => {
	const studentId = "507f1f77bcf86cd799439011";
	const entries: IPointLedger[] = [
		{
			_id: "ledger-manual-negative",
			student_id: new Types.ObjectId(studentId),
			source_type: "manual_adjustment",
			source_id: "manual_adjustment",
			attempt_id: null,
			earned_points: 0,
			max_points: 0,
			reward_points: -25,
			competency_score: 0,
			reason: "Penalty correction",
			metadata: null,
			created_by: "admin-1",
			createdAt: new Date(),
			updatedAt: new Date(),
		} as unknown as IPointLedger,
	];

	class FakePointLedgerRepository extends PointLedgerRepository {
		public async findByStudentId(_studentId: string): Promise<IPointLedger[]> {
			return entries;
		}
	}

	const summary = await new PointService(
		new FakePointLedgerRepository(),
	).getStudentPointSummary(studentId);
	const firstPointsBadge = summary.gamification.badges.find(
		(badge) => badge.key === "first_points",
	);

	assert.equal(summary.reward_points, -25);
	assert.equal(summary.gamification.reward_points, 0);
	assert.equal(summary.gamification.level, 1);
	assert.equal(summary.gamification.points_to_next_level, 50);
	assert.equal(summary.gamification.progress_percentage, 0);
	assert.equal(firstPointsBadge?.unlocked, false);
	assert.equal(firstPointsBadge?.progress.current, 0);
	assert.equal(firstPointsBadge?.progress.percentage, 0);
});

test("getStudentPointSummary handles exact level thresholds and unlocks capped badges", async () => {
	const studentId = "507f1f77bcf86cd799439011";
	const studentObjectId = new Types.ObjectId(studentId);
	const entries: IPointLedger[] = [
		{
			_id: "ledger-assessment-1",
			student_id: studentObjectId,
			source_type: "assessment",
			source_id: "assessment-1",
			attempt_id: "attempt-1",
			earned_points: 10,
			max_points: 10,
			reward_points: 150,
			competency_score: 85,
			reason: "Assessment graded",
			metadata: null,
			created_by: null,
			createdAt: new Date(),
			updatedAt: new Date(),
		} as unknown as IPointLedger,
		...Array.from({ length: 7 }, (_, index) =>
			({
				_id: `ledger-lesson-${index}`,
				student_id: studentObjectId,
				source_type: "lesson",
				source_id: `lesson-${index}`,
				attempt_id: `lesson-attempt-${index}`,
				earned_points: 0,
				max_points: 0,
				reward_points: 0,
				competency_score: 0,
				reason: "Lesson completed",
				metadata: null,
				created_by: null,
				createdAt: new Date(),
				updatedAt: new Date(),
			}) as unknown as IPointLedger,
		),
	];

	class FakePointLedgerRepository extends PointLedgerRepository {
		public async findByStudentId(_studentId: string): Promise<IPointLedger[]> {
			return entries;
		}
	}

	const summary = await new PointService(
		new FakePointLedgerRepository(),
	).getStudentPointSummary(studentId);
	const lessonBadge = summary.gamification.badges.find(
		(badge) => badge.key === "lesson_momentum",
	);
	const assessmentBadge = summary.gamification.badges.find(
		(badge) => badge.key === "assessment_starter",
	);
	const competencyBadge = summary.gamification.badges.find(
		(badge) => badge.key === "high_competency",
	);

	assert.equal(summary.gamification.level, 3);
	assert.equal(summary.gamification.level_title, "Tăng tốc");
	assert.equal(summary.gamification.next_level_reward_points, 300);
	assert.equal(summary.gamification.points_to_next_level, 150);
	assert.equal(summary.gamification.progress_percentage, 0);
	assert.equal(lessonBadge?.unlocked, true);
	assert.equal(lessonBadge?.progress.current, 5);
	assert.equal(lessonBadge?.progress.percentage, 100);
	assert.equal(assessmentBadge?.unlocked, true);
	assert.equal(competencyBadge?.unlocked, true);
});

test("getStudentPointSummary caps max-level gamification progress", async () => {
	const studentId = "507f1f77bcf86cd799439011";
	const entries: IPointLedger[] = [
		{
			_id: "ledger-assessment-over-max",
			student_id: new Types.ObjectId(studentId),
			source_type: "assessment",
			source_id: "assessment-1",
			attempt_id: "attempt-1",
			earned_points: 10,
			max_points: 10,
			reward_points: 750,
			competency_score: 100,
			reason: "Assessment graded",
			metadata: null,
			created_by: null,
			createdAt: new Date(),
			updatedAt: new Date(),
		} as unknown as IPointLedger,
	];

	class FakePointLedgerRepository extends PointLedgerRepository {
		public async findByStudentId(_studentId: string): Promise<IPointLedger[]> {
			return entries;
		}
	}

	const summary = await new PointService(
		new FakePointLedgerRepository(),
	).getStudentPointSummary(studentId);

	assert.equal(summary.gamification.level, 5);
	assert.equal(summary.gamification.level_title, "Bậc thầy");
	assert.equal(summary.gamification.next_level_reward_points, null);
	assert.equal(summary.gamification.points_to_next_level, 0);
	assert.equal(summary.gamification.progress_percentage, 100);
});
