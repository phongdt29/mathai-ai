import { resolve } from "node:path";
import dotenv from "dotenv";
import mongoose from "mongoose";

import { AssessmentAttemptModel } from "../src/models/assessment.model";
import { StudentProfileModel } from "../src/models/student.model";
import { classificationService } from "../src/services/classification.service";

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017";
const DB_NAME = process.env.DB_NAME || "mathai";

export interface ClassificationBackfillSummary {
	scanned: number;
	classified: number;
	skipped: number;
	failed: number;
}

interface ClassificationBackfillLogger {
	log: (...args: unknown[]) => void;
	warn: (...args: unknown[]) => void;
	error: (...args: unknown[]) => void;
}

export interface ClassificationBackfillOptions {
	studentIds?: Iterable<string>;
	getExistingClassification?: (
		studentId: string,
	) => Promise<string | null | undefined>;
	classifyStudent?: (studentId: string) => Promise<unknown>;
	dryRun?: boolean;
	logger?: ClassificationBackfillLogger;
}

export async function loadHistoricalAssessmentStudentIds(): Promise<string[]> {
	const studentIds = await AssessmentAttemptModel.distinct("student_id", {
		status: { $in: ["graded", "completed"] },
		submitted_at: { $ne: null },
	});

	return studentIds.map((studentId) => String(studentId));
}

export async function backfillAssessmentClassifications(
	options: ClassificationBackfillOptions = {},
): Promise<ClassificationBackfillSummary> {
	const logger = options.logger ?? console;
	const classifyStudent =
		options.classifyStudent ??
		classificationService.classifyStudent.bind(classificationService);
	const getExistingClassification =
		options.getExistingClassification ?? loadExistingClassification;
	const studentIds = options.studentIds
		? Array.from(options.studentIds)
		: await loadHistoricalAssessmentStudentIds();

	const summary: ClassificationBackfillSummary = {
		scanned: 0,
		classified: 0,
		skipped: 0,
		failed: 0,
	};

	for (const studentId of studentIds) {
		summary.scanned += 1;

		try {
			const existingClassification = await getExistingClassification(studentId);
			if (hasExistingClassification(existingClassification)) {
				summary.skipped += 1;
				logger.log(`Skipping already-classified student ${studentId}`);
				continue;
			}

			if (options.dryRun) {
				summary.skipped += 1;
				logger.log(`DRY_RUN would classify student ${studentId}`);
				continue;
			}

			await classifyStudent(studentId);
			summary.classified += 1;
		} catch (error) {
			summary.failed += 1;
			logger.warn(
				`Failed to classify student ${studentId}`,
				error instanceof Error ? error.message : error,
			);
		}
	}

	logger.log(
		`Assessment classification backfill complete: scanned=${summary.scanned} classified=${summary.classified} skipped=${summary.skipped} failed=${summary.failed}`,
	);

	return summary;
}

async function loadExistingClassification(
	studentId: string,
): Promise<string | null | undefined> {
	const profile = await StudentProfileModel.findById(studentId)
		.select("initial_classification")
		.lean()
		.exec();

	return profile?.initial_classification as string | null | undefined;
}

function hasExistingClassification(value: string | null | undefined): boolean {
	return typeof value === "string" && value.trim().length > 0;
}

export async function runAssessmentClassificationBackfill() {
	try {
		await mongoose.connect(MONGODB_URI, { dbName: DB_NAME });
		console.log(`Connected to MongoDB database=${DB_NAME}`);

		const dryRun =
			process.env.DRY_RUN === "1" || process.env.DRY_RUN === "true";
		return await backfillAssessmentClassifications({ dryRun });
	} finally {
		await mongoose.disconnect().catch(() => undefined);
	}
}

if (process.argv[1] && resolve(process.argv[1]) === __filename) {
	runAssessmentClassificationBackfill()
		.then((summary) => {
			if (summary.failed > 0) {
				process.exitCode = 1;
			}
		})
		.catch((error) => {
			console.error("Assessment classification backfill failed:", error);
			process.exit(1);
		});
}
