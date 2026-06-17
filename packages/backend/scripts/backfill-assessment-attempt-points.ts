import { resolve } from "node:path";
import dotenv from "dotenv";
import mongoose from "mongoose";

import {
	AssessmentAttemptModel,
	AssessmentModel,
} from "../src/models/assessment.model";
import { PointLedgerModel } from "../src/models/point-ledger.model";
import { pointService } from "../src/services/point.service";

// Preserve existing CLI behavior: load .env when the script is run directly or imported.
dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017";
const DB_NAME = process.env.DB_NAME || "mathai";

export interface AssessmentAttemptPointsBackfillSummary {
	scanned: number;
	recorded: number;
	existing: number;
	skipped: number;
	failed: number;
}

export interface BackfillAssessmentAttempt {
	_id: unknown;
	student_id: unknown;
	assessment_id: unknown;
	status?: string | null;
	total_score: number | null;
	max_score: number | null;
	percentage?: number | null;
	submitted_at?: Date | string | null;
}

export interface BackfillAssessment {
	_id?: unknown;
	title?: string | null;
	type?: string | null;
	target_difficulty?: string | null;
}

export interface AssessmentAttemptPointsBackfillLogger {
	log: (...args: unknown[]) => void;
	warn: (...args: unknown[]) => void;
	error: (...args: unknown[]) => void;
}

export interface AssessmentAttemptPointsBackfillOptions {
	attempts?:
		| AsyncIterable<BackfillAssessmentAttempt>
		| Iterable<BackfillAssessmentAttempt>;
	findAssessmentById?: (
		assessmentId: string,
	) => Promise<BackfillAssessment | null>;
	findExistingLedger?: (
		attempt: BackfillAssessmentAttempt,
		assessment: BackfillAssessment,
	) => Promise<unknown | null | undefined>;
	recordAssessmentResult?: (input: {
		student_id: string;
		assessment_id: string;
		attempt_id: string;
		earned_points: number;
		max_points: number;
		competency_score?: number;
		difficulty?: string | null;
		reason: string;
		metadata: Record<string, unknown>;
	}) => Promise<unknown>;
	logger?: AssessmentAttemptPointsBackfillLogger;
}

export async function loadAssessmentAttemptsForPointBackfill(): Promise<
	AsyncIterable<BackfillAssessmentAttempt>
> {
	return AssessmentAttemptModel.find({
		status: { $in: ["graded", "completed"] },
		total_score: { $ne: null },
		max_score: { $ne: null },
	}).cursor() as AsyncIterable<BackfillAssessmentAttempt>;
}

export async function backfillAssessmentAttemptPoints(
	options: AssessmentAttemptPointsBackfillOptions = {},
): Promise<AssessmentAttemptPointsBackfillSummary> {
	const logger = options.logger ?? console;
	const attempts =
		options.attempts ?? (await loadAssessmentAttemptsForPointBackfill());
	const findAssessmentById = options.findAssessmentById ?? loadAssessmentById;
	const findExistingLedger =
		options.findExistingLedger ??
		(options.attempts
			? async () => null
			: loadExistingAssessmentLedger);
	const recordAssessmentResult =
		options.recordAssessmentResult ??
		pointService.recordAssessmentResult.bind(pointService);
	const summary: AssessmentAttemptPointsBackfillSummary = {
		scanned: 0,
		recorded: 0,
		existing: 0,
		skipped: 0,
		failed: 0,
	};

	for await (const attempt of attempts) {
		summary.scanned += 1;
		const attemptId = stringifyId(attempt._id);
		const assessmentId = stringifyId(attempt.assessment_id);

		try {
			if (attempt.total_score === null || attempt.max_score === null) {
				summary.skipped += 1;
				logger.warn(
					`Skipped attempt ${attemptId}: total_score or max_score is missing`,
				);
				continue;
			}

			const assessment = await findAssessmentById(assessmentId);
			if (!assessment) {
				summary.skipped += 1;
				logger.warn(
					`Skipped attempt ${attemptId}: assessment ${assessmentId} not found`,
				);
				continue;
			}

			const existingLedger = await findExistingLedger(attempt, assessment);
			if (existingLedger) {
				summary.existing += 1;
				continue;
			}

			await recordAssessmentResult({
				student_id: stringifyId(attempt.student_id),
				assessment_id: assessmentId,
				attempt_id: attemptId,
				earned_points: attempt.total_score,
				max_points: attempt.max_score,
				competency_score: attempt.percentage ?? undefined,
				difficulty: assessment.target_difficulty ?? null,
				reason: `Backfill assessment attempt: ${assessment.title ?? assessmentId}`,
				metadata: {
					backfill: true,
					assessment_type: assessment.type ?? null,
					submitted_at: normalizeSubmittedAt(attempt.submitted_at),
				},
			});

			summary.recorded += 1;
		} catch (error) {
			summary.failed += 1;
			logger.error(
				`Failed attempt ${attemptId}:`,
				error instanceof Error ? error.message : error,
			);
		}
	}

	logger.log(
		`Backfill complete: scanned=${summary.scanned} recorded=${summary.recorded} existing=${summary.existing} skipped=${summary.skipped} failed=${summary.failed}`,
	);

	return summary;
}

async function loadAssessmentById(
	assessmentId: string,
): Promise<BackfillAssessment | null> {
	return AssessmentModel.findById(assessmentId).lean().exec();
}

async function loadExistingAssessmentLedger(
	attempt: BackfillAssessmentAttempt,
	_assessment: BackfillAssessment,
): Promise<unknown | null> {
	return PointLedgerModel.findOne({
		student_id: attempt.student_id,
		source_type: "assessment",
		source_id: stringifyId(attempt.assessment_id),
		attempt_id: stringifyId(attempt._id),
	})
		.select("_id attempt_id")
		.lean()
		.exec();
}

function stringifyId(value: unknown): string {
	return String(value ?? "").trim();
}

function normalizeSubmittedAt(
	value: Date | string | null | undefined,
): string | null {
	if (!value) {
		return null;
	}
	if (value instanceof Date) {
		return value.toISOString();
	}
	return String(value);
}

export async function runAssessmentAttemptPointsBackfill() {
	try {
		await mongoose.connect(MONGODB_URI, { dbName: DB_NAME });
		console.log("Connected to MongoDB");

		return await backfillAssessmentAttemptPoints();
	} finally {
		await mongoose.disconnect().catch(() => undefined);
	}
}

if (process.argv[1] && resolve(process.argv[1]) === __filename) {
	runAssessmentAttemptPointsBackfill()
		.then((summary) => {
			if (summary.failed > 0) {
				process.exitCode = 1;
			}
		})
		.catch((error) => {
			console.error("Backfill failed:", error);
			mongoose
				.disconnect()
				.catch(() => undefined)
				.finally(() => process.exit(1));
		});
}
