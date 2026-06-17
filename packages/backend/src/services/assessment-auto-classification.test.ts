import assert from "node:assert/strict";
import test from "node:test";

import { AssessmentService } from "./assessment.service";
import { ClassificationService } from "./classification.service";
import { aiService } from "./ai.service";
import { pointService } from "./point.service";

const studentId = "student-1";
const assessmentId = "assessment-1";
const attemptId = "attempt-1";

const buildSubmitService = (classifier: {
	classifyStudent: (studentId: string) => Promise<unknown>;
}) => {
	const service = new AssessmentService() as any;
	const assessment = {
		id: assessmentId,
		student_id: studentId,
		type: "diagnostic",
		title: "Bài kiểm tra đầu vào lớp 6",
		grade_level: 6,
		target_difficulty: "mixed",
		generated_by_ai: false,
		total_questions: 1,
		total_score: null,
		duration_minutes: null,
		status: "published",
	};
	const attempt = {
		id: attemptId,
		assessment_id: assessmentId,
		student_id: studentId,
		started_at: new Date("2026-05-07T09:00:00.000Z"),
		submitted_at: null,
		total_score: null,
		max_score: null,
		percentage: null,
		ai_feedback: null,
		ai_analysis: null,
		status: "in_progress",
	};
	const questions = [
		{
			id: "question-1",
			assessment_id: assessmentId,
			question_type: "multiple_choice",
			topic: "Phân số",
			difficulty_level: "easy",
			question_text: "1/2 + 1/2 = ?",
			choices: ["1", "2", "3", "4"],
			correct_answer: "1",
			solution_steps: null,
			explanation: null,
			score: 1,
			order_index: 1,
		},
	];
	const answers = [
		{
			id: "answer-1",
			attempt_id: attemptId,
			question_id: "question-1",
			student_answer: "1",
			selected_choice: "1",
			is_correct: null,
			score: null,
			ai_comment: null,
			answered_at: new Date("2026-05-07T09:01:00.000Z"),
		},
	];

	service.assessmentRepo = {
		findById: async () => assessment,
		update: async (_id: string, data: Record<string, unknown>) => ({
			...assessment,
			...data,
		}),
	};
	service.attemptRepo = {
		findById: async () => attempt,
		update: async (_id: string, data: Record<string, unknown>) => ({
			...attempt,
			...data,
		}),
	};
	service.questionRepo = {
		findByAssessmentId: async () => questions,
	};
	service.answerRepo = {
		findByAttemptId: async () => answers,
		update: async (id: string, data: Record<string, unknown>) => {
			const answer = answers.find((candidate) => candidate.id === id);
			assert.ok(answer, `expected answer ${id} to exist`);
			Object.assign(answer, data);
			return answer;
		},
	};
	service.topicMasteryRepo = {
		findOne: async () => null,
		create: async () => ({}),
		update: async () => ({}),
	};
	service.classificationService = classifier;
	// Mặc định: học sinh ĐÃ có giáo trình active → submitAttempt không tự tạo lại,
	// giữ nguyên kỳ vọng của các test phân loại (không phát sinh cảnh báo phụ).
	service.curriculumRepo = {
		findActiveByStudent: async () => [{ id: "curriculum-existing" }],
	};
	service.curriculumGenerator = {
		generateCurriculum: async () => ({}) as any,
	};
	service.analyzePerformance = async () => ({
		overall_feedback: "Hoàn thành bài đánh giá.",
		strengths: ["Tính toán chính xác"],
		weaknesses: [],
		recommendations: "Tiếp tục luyện tập phân số.",
	});
	service.detectAssessmentAnomalies = async () => undefined;

	return service as AssessmentService;
};

test("assessment submit auto-classifies the student and returns the classification", async () => {
	const calls: string[] = [];
	const service = buildSubmitService({
		classifyStudent: async (id) => {
			calls.push(id);
			return {
				level: "kha",
				confidence: 0.82,
				reason: "Bài đầu vào đạt điểm cao",
			};
		},
	});
	const originalRecordAssessmentResult = pointService.recordAssessmentResult;
	pointService.recordAssessmentResult = async () => ({}) as any;

	try {
		const result = (await service.submitAttempt(
			assessmentId,
			attemptId,
			studentId,
		)) as any;

		assert.deepEqual(calls, [studentId]);
		assert.equal(result.classification.level, "kha");
		assert.equal(result.status, "graded");
		assert.equal(result.answers[0]?.is_correct, true);
	} finally {
		pointService.recordAssessmentResult = originalRecordAssessmentResult;
	}
});

test("assessment submit auto-classification persists the profile classification through ClassificationService", async () => {
	const classifier = new ClassificationService() as any;
	const persistedUpdates: Array<{
		profileId: string;
		data: Record<string, unknown>;
	}> = [];
	classifier.studentRepo = {
		findById: async (id: string) => ({
			id: `profile-${id}`,
			math_average_score: 7,
			grade_level: 6,
			school_name: "THCS Demo",
			self_assessed_level: null,
		}),
		update: async (profileId: string, data: Record<string, unknown>) => {
			persistedUpdates.push({ profileId, data });
			return { id: profileId, ...data };
		},
	};
	classifier.collectDiagnosticSignals = async () => null;

	const service = buildSubmitService(classifier);
	const originalRecordAssessmentResult = pointService.recordAssessmentResult;
	pointService.recordAssessmentResult = async () => ({}) as any;

	try {
		const result = (await service.submitAttempt(
			assessmentId,
			attemptId,
			studentId,
		)) as any;

		assert.deepEqual(persistedUpdates, [
			{
				profileId: `profile-${studentId}`,
				data: { initial_classification: "kha" },
			},
		]);
		assert.equal(result.classification.final_level, "kha");
	} finally {
		pointService.recordAssessmentResult = originalRecordAssessmentResult;
	}
});

test("assessment submit keeps the graded result when auto-classification fails", async () => {
	const calls: string[] = [];
	const service = buildSubmitService({
		classifyStudent: async (id) => {
			calls.push(id);
			throw new Error("classifier unavailable");
		},
	});
	const originalRecordAssessmentResult = pointService.recordAssessmentResult;
	const originalWarn = console.warn;
	const warnings: unknown[][] = [];
	pointService.recordAssessmentResult = async () => ({}) as any;
	console.warn = (...args: unknown[]) => {
		warnings.push(args);
	};

	try {
		const result = (await service.submitAttempt(
			assessmentId,
			attemptId,
			studentId,
		)) as any;

		assert.deepEqual(calls, [studentId]);
		assert.equal(warnings.length, 1);
		assert.match(String(warnings[0]?.[0] ?? ""), /auto-classification failed/i);
		assert.equal(result.classification, null);
		assert.equal(result.status, "graded");
		assert.equal(result.answers[0]?.score, 1);
	} finally {
		pointService.recordAssessmentResult = originalRecordAssessmentResult;
		console.warn = originalWarn;
	}
});

test("assessment submit auto-generates a curriculum when the student has none", async () => {
	const service = buildSubmitService({
		classifyStudent: async () => ({ level: "kha", final_level: "kha" }),
	}) as any;
	const genCalls: Array<[string, unknown]> = [];
	service.curriculumRepo = { findActiveByStudent: async () => [] };
	service.curriculumGenerator = {
		generateCurriculum: async (id: string, opts: unknown) => {
			genCalls.push([id, opts]);
			return {} as unknown;
		},
	};
	const originalRecordAssessmentResult = pointService.recordAssessmentResult;
	pointService.recordAssessmentResult = async () => ({}) as any;

	try {
		const result = (await service.submitAttempt(
			assessmentId,
			attemptId,
			studentId,
		)) as any;

		assert.equal(genCalls.length, 1);
		assert.equal(genCalls[0]?.[0], studentId);
		assert.equal(result.curriculum_generated, true);
		assert.equal(result.status, "graded");
	} finally {
		pointService.recordAssessmentResult = originalRecordAssessmentResult;
	}
});

test("assessment submit does not regenerate a curriculum when one is already active", async () => {
	const service = buildSubmitService({
		classifyStudent: async () => ({ level: "kha", final_level: "kha" }),
	}) as any;
	let genCount = 0;
	service.curriculumRepo = {
		findActiveByStudent: async () => [{ id: "curriculum-1" }],
	};
	service.curriculumGenerator = {
		generateCurriculum: async () => {
			genCount += 1;
			return {} as unknown;
		},
	};
	const originalRecordAssessmentResult = pointService.recordAssessmentResult;
	pointService.recordAssessmentResult = async () => ({}) as any;

	try {
		const result = (await service.submitAttempt(
			assessmentId,
			attemptId,
			studentId,
		)) as any;

		assert.equal(genCount, 0);
		assert.equal(result.curriculum_generated, false);
		assert.equal(result.status, "graded");
	} finally {
		pointService.recordAssessmentResult = originalRecordAssessmentResult;
	}
});

test("assessment submit keeps the graded result when curriculum generation fails", async () => {
	const service = buildSubmitService({
		classifyStudent: async () => ({ level: "kha", final_level: "kha" }),
	}) as any;
	service.curriculumRepo = { findActiveByStudent: async () => [] };
	service.curriculumGenerator = {
		generateCurriculum: async () => {
			throw new Error("curriculum provider unavailable");
		},
	};
	const originalRecordAssessmentResult = pointService.recordAssessmentResult;
	const originalWarn = console.warn;
	const warnings: unknown[][] = [];
	pointService.recordAssessmentResult = async () => ({}) as any;
	console.warn = (...args: unknown[]) => {
		warnings.push(args);
	};

	try {
		const result = (await service.submitAttempt(
			assessmentId,
			attemptId,
			studentId,
		)) as any;

		assert.equal(result.curriculum_generated, false);
		assert.equal(result.status, "graded");
		assert.ok(
			warnings.some((w) =>
				/auto-curriculum generation failed/i.test(String(w?.[0] ?? "")),
			),
		);
	} finally {
		pointService.recordAssessmentResult = originalRecordAssessmentResult;
		console.warn = originalWarn;
	}
});

test("assessment analysis returns Vietnamese strengths and weaknesses when AI analysis is unavailable", async () => {
	const service = new AssessmentService() as any;
	const originalGenerateJSON = aiService.generateJSON;
	aiService.generateJSON = async () => {
		throw new Error("provider unavailable");
	};

	try {
		const result = await service.analyzePerformance(
			8,
			[
				{
					id: "q-strong",
					topic: "Lũy thừa và phép tính cơ bản",
					score: 1,
				},
				{
					id: "q-weak",
					topic: "Phân thức đại số",
					score: 1,
				},
			],
			[
				{
					question_id: "q-strong",
					is_correct: true,
					score: 1,
				},
				{
					question_id: "q-weak",
					is_correct: false,
					score: 0,
				},
			],
		);

		assert.match(result.overall_feedback, /Học sinh|Kết quả|nền tảng/i);
		assert.match(result.strengths.join(" "), /Lũy thừa và phép tính cơ bản/);
		assert.match(result.weaknesses.join(" "), /Phân thức đại số/);
		assert.doesNotMatch(result.strengths.join(" "), /\bAPI\b|\beasy\b|\bmedium\b|\bhard\b/i);
		assert.doesNotMatch(result.weaknesses.join(" "), /\bAPI\b|\beasy\b|\bmedium\b|\bhard\b/i);
	} finally {
		aiService.generateJSON = originalGenerateJSON;
	}
});
