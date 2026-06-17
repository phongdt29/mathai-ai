import assert from "node:assert/strict";
import { test } from "node:test";

import {
	type AssessmentAttemptPointsBackfillSummary,
	type BackfillAssessmentAttempt,
	backfillAssessmentAttemptPoints,
} from "./backfill-assessment-attempt-points";

function makeAttempt(
	overrides: Partial<BackfillAssessmentAttempt> = {},
): BackfillAssessmentAttempt {
	return {
		_id: "attempt-1",
		student_id: "507f1f77bcf86cd799439011",
		assessment_id: "assessment-1",
		status: "graded",
		total_score: 8,
		max_score: 10,
		percentage: 80,
		submitted_at: new Date("2026-01-01T00:00:00.000Z"),
		...overrides,
	};
}

function silentLogger() {
	return {
		log: () => undefined,
		warn: () => undefined,
		error: () => undefined,
	};
}

test("assessment attempt points backfill records injectable attempts without MongoDB", async () => {
	const recorded: unknown[] = [];

	const summary = await backfillAssessmentAttemptPoints({
		attempts: [makeAttempt()],
		findAssessmentById: async () => ({
			_id: "assessment-1",
			title: "Algebra Check",
			type: "quiz",
			target_difficulty: "hard",
		}),
		recordAssessmentResult: async (input) => {
			recorded.push(input);
		},
		logger: silentLogger(),
	});

	assert.deepEqual(summary, {
		scanned: 1,
		recorded: 1,
		existing: 0,
		skipped: 0,
		failed: 0,
	} satisfies AssessmentAttemptPointsBackfillSummary);
	assert.deepEqual(recorded, [
		{
			student_id: "507f1f77bcf86cd799439011",
			assessment_id: "assessment-1",
			attempt_id: "attempt-1",
			earned_points: 8,
			max_points: 10,
			competency_score: 80,
			difficulty: "hard",
			reason: "Backfill assessment attempt: Algebra Check",
			metadata: {
				backfill: true,
				assessment_type: "quiz",
				submitted_at: "2026-01-01T00:00:00.000Z",
			},
		},
	]);
});

test("assessment attempt points backfill is rerun-safe when ledger entries already exist", async () => {
	const recorded: string[] = [];
	const existingAttemptIds = new Set<string>();
	const options = {
		attempts: [
			makeAttempt({ _id: "attempt-1" }),
			makeAttempt({ _id: "attempt-2" }),
		],
		findAssessmentById: async () => ({
			_id: "assessment-1",
			title: "Algebra Check",
			type: "quiz",
			target_difficulty: "medium",
		}),
		findExistingLedger: async (attempt: BackfillAssessmentAttempt) =>
			existingAttemptIds.has(String(attempt._id)) ? { attempt_id: attempt._id } : null,
		recordAssessmentResult: async (input: { attempt_id: string }) => {
			recorded.push(input.attempt_id);
			existingAttemptIds.add(input.attempt_id);
		},
		logger: silentLogger(),
	};

	const firstRun = await backfillAssessmentAttemptPoints(options);
	const secondRun = await backfillAssessmentAttemptPoints(options);

	assert.deepEqual(recorded, ["attempt-1", "attempt-2"]);
	assert.deepEqual(firstRun, {
		scanned: 2,
		recorded: 2,
		existing: 0,
		skipped: 0,
		failed: 0,
	} satisfies AssessmentAttemptPointsBackfillSummary);
	assert.deepEqual(secondRun, {
		scanned: 2,
		recorded: 0,
		existing: 2,
		skipped: 0,
		failed: 0,
	} satisfies AssessmentAttemptPointsBackfillSummary);
});

test("assessment attempt points backfill skips unreconciliable attempts and continues after failures", async () => {
	const warnings: unknown[][] = [];
	const recorded: string[] = [];

	const summary = await backfillAssessmentAttemptPoints({
		attempts: [
			makeAttempt({ _id: "missing-score", total_score: null }),
			makeAttempt({ _id: "missing-assessment", assessment_id: "missing" }),
			makeAttempt({ _id: "record-fails" }),
			makeAttempt({ _id: "records" }),
		],
		findAssessmentById: async (assessmentId) =>
			assessmentId === "missing"
				? null
				: {
						_id: assessmentId,
						title: "Algebra Check",
						type: "quiz",
						target_difficulty: "medium",
					},
		recordAssessmentResult: async (input) => {
			if (input.attempt_id === "record-fails") {
				throw new Error("duplicate key conflict");
			}
			recorded.push(input.attempt_id);
		},
		logger: {
			...silentLogger(),
			warn: (...args: unknown[]) => warnings.push(args),
		},
	});

	assert.deepEqual(recorded, ["records"]);
	assert.deepEqual(summary, {
		scanned: 4,
		recorded: 1,
		existing: 0,
		skipped: 2,
		failed: 1,
	} satisfies AssessmentAttemptPointsBackfillSummary);
	assert.equal(warnings.length, 2);
});
