import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import {
	backfillAssessmentClassifications,
	type ClassificationBackfillSummary,
} from "./backfill-assessment-classifications";

const scriptPath = join(__dirname, "backfill-assessment-classifications.ts");

test("assessment classification backfill classifies each historical graded student", async () => {
	const classified: string[] = [];
	const classificationByStudent = new Map<string, string | null | undefined>([
		["student-1", null],
		["student-2", undefined],
	]);
	const summary = await backfillAssessmentClassifications({
		studentIds: ["student-1", "student-2"],
		getExistingClassification: async (studentId) =>
			classificationByStudent.get(studentId),
		classifyStudent: async (studentId) => {
			classified.push(studentId);
		},
		logger: silentLogger(),
	});

	assert.deepEqual(classified, ["student-1", "student-2"]);
	assert.deepEqual(summary, {
		scanned: 2,
		classified: 2,
		skipped: 0,
		failed: 0,
	});
});

test("assessment classification backfill skips students with an existing non-blank classification", async () => {
	const classified: string[] = [];
	const classificationByStudent = new Map<string, string | null | undefined>([
		["student-1", "kha"],
		["student-2", "  "],
		["student-3", null],
		["student-4", "gioi"],
	]);

	const summary = await backfillAssessmentClassifications({
		studentIds: ["student-1", "student-2", "student-3", "student-4"],
		getExistingClassification: async (studentId) =>
			classificationByStudent.get(studentId),
		classifyStudent: async (studentId) => {
			classified.push(studentId);
			classificationByStudent.set(studentId, "trung_binh");
		},
		logger: silentLogger(),
	});

	assert.deepEqual(classified, ["student-2", "student-3"]);
	assert.deepEqual(summary, {
		scanned: 4,
		classified: 2,
		skipped: 2,
		failed: 0,
	} satisfies ClassificationBackfillSummary);
});

test("assessment classification backfill is rerun-safe after missing classifications are filled", async () => {
	const classified: string[] = [];
	const classificationByStudent = new Map<string, string | null | undefined>([
		["student-1", null],
		["student-2", ""],
	]);
	const options = {
		studentIds: ["student-1", "student-2"],
		getExistingClassification: async (studentId: string) =>
			classificationByStudent.get(studentId),
		classifyStudent: async (studentId: string) => {
			classified.push(studentId);
			classificationByStudent.set(studentId, "kha");
		},
		logger: silentLogger(),
	};

	const firstRun = await backfillAssessmentClassifications(options);
	const secondRun = await backfillAssessmentClassifications(options);

	assert.deepEqual(classified, ["student-1", "student-2"]);
	assert.deepEqual(firstRun, {
		scanned: 2,
		classified: 2,
		skipped: 0,
		failed: 0,
	} satisfies ClassificationBackfillSummary);
	assert.deepEqual(secondRun, {
		scanned: 2,
		classified: 0,
		skipped: 2,
		failed: 0,
	} satisfies ClassificationBackfillSummary);
});

test("assessment classification backfill continues after per-student classifier failures", async () => {
	const warnings: unknown[][] = [];
	const summary = await backfillAssessmentClassifications({
		studentIds: ["student-1", "student-2", "student-3"],
		getExistingClassification: async () => null,
		classifyStudent: async (studentId) => {
			if (studentId === "student-2") {
				throw new Error("AI provider unavailable");
			}
		},
		logger: {
			...silentLogger(),
			warn: (...args: unknown[]) => warnings.push(args),
		},
	});

	assert.deepEqual(summary, {
		scanned: 3,
		classified: 2,
		skipped: 0,
		failed: 1,
	});
	assert.equal(warnings.length, 1);
	assert.match(String(warnings[0]?.[0] ?? ""), /Failed to classify student/);
});

test("assessment classification backfill dry-run reports candidates without classifying", async () => {
	const classified: string[] = [];
	const summary = await backfillAssessmentClassifications({
		studentIds: ["student-1", "student-2"],
		getExistingClassification: async () => null,
		classifyStudent: async (studentId) => {
			classified.push(studentId);
		},
		dryRun: true,
		logger: silentLogger(),
	});

	assert.deepEqual(classified, []);
	assert.deepEqual(summary, {
		scanned: 2,
		classified: 0,
		skipped: 2,
		failed: 0,
	} satisfies ClassificationBackfillSummary);
});

test("assessment classification backfill script is wired as an executable backfill", async () => {
	const script = await readFile(scriptPath, "utf8");

	assert.match(script, /AssessmentAttemptModel\.distinct\("student_id"/);
	assert.match(script, /StudentProfileModel\.findById/);
	assert.match(script, /initial_classification/);
	assert.match(script, /status:\s*\{\s*\$in:\s*\["graded",\s*"completed"\]/);
	assert.match(script, /classificationService\.classifyStudent/);
	assert.match(script, /DRY_RUN/);
	assert.match(script, /mongoose\.disconnect\(\)\.catch/);
});

function silentLogger() {
	return {
		log: () => undefined,
		warn: () => undefined,
		error: () => undefined,
	};
}
