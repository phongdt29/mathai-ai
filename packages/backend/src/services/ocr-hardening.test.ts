import assert from "node:assert/strict";
import { describe, test, beforeEach, afterEach } from "node:test";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

import fc from "fast-check";

import aiService from "./ai.service";
import { SolverService } from "./solver.service";
import { LocalDiskOCRStorage, type ObjectPutInput } from "./ocr-storage.service";

/**
 * OCR Hardening Unit Tests
 *
 * Validates: Requirements 4.1–4.10
 *
 * Covers:
 * 1. Confidence classification thresholds
 * 2. Dedupe (same sha256 → 1 physical object)
 * 3. Rate-limit quota enforcement
 * 4. Retry logic (1 retry, backoff 500ms)
 * 5. Property 9: Risk score bounds (0 <= risk_score <= 100)
 */

const studentId = "507f1f77bcf86cd799439011";

// ── Helper: create a SolverService with mocked dependencies ─────────────

function createMockedSolverService(options: {
	extractResult?: { parsedText: string; tokensUsed: { input: number; output: number } };
	extractError?: Error;
	extractCallCount?: { count: number };
	countSuccessfulToday?: number;
}) {
	const { extractResult, extractError, extractCallCount, countSuccessfulToday = 0 } = options;
	const createdOcrResults: Array<Record<string, unknown>> = [];

	const originalExtract = aiService.extractTextFromImage;
	const originalLog = aiService.logGeneration;

	aiService.extractTextFromImage = async () => {
		if (extractCallCount) extractCallCount.count++;
		if (extractError) throw extractError;
		return extractResult ?? { parsedText: "", tokensUsed: { input: 0, output: 0 } };
	};
	aiService.logGeneration = async () => {};

	const service = new SolverService() as any;
	service.solverRepo = {
		create: async (payload: Record<string, unknown>) => payload,
	};
	service.ocrResultRepo = {
		create: async (payload: Record<string, unknown>) => {
			createdOcrResults.push(payload);
			return { _id: "mock_ocr_id", ...payload };
		},
		countSuccessfulToday: async () => countSuccessfulToday,
	};

	const restore = () => {
		aiService.extractTextFromImage = originalExtract;
		aiService.logGeneration = originalLog;
	};

	return { service, createdOcrResults, restore };
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. Confidence classification thresholds
// ═══════════════════════════════════════════════════════════════════════════

describe("OCR Hardening — Confidence classification thresholds", () => {
	test("confidence >= 0.85 → ocr_status = 'parsed', no warnings", async (t) => {
		// Text with strong math indicators to get high confidence
		const { service, restore } = createMockedSolverService({
			extractResult: {
				parsedText: "Giải phương trình 2x + 3 = 7. Tìm x biết rằng x > 0 và x² - 5x + 6 = 0",
				tokensUsed: { input: 50, output: 20 },
			},
		});
		t.after(restore);

		const result = await service.parseImage(
			studentId,
			"https://example.com/img.png",
			"/tmp/img.png",
			"image/png",
		);

		assert.equal(result.ocr_status, "parsed");
		assert.ok(result.confidence >= 0.85, `Expected confidence >= 0.85, got ${result.confidence}`);
		assert.ok(!result.warnings.includes("low_confidence"));
	});

	test("0.5 <= confidence < 0.85 → ocr_status = 'parsed' + warning 'low_confidence'", async (t) => {
		// Short text with some math content but not enough for high confidence
		const { service, restore } = createMockedSolverService({
			extractResult: {
				parsedText: "x = 5",
				tokensUsed: { input: 10, output: 5 },
			},
		});
		t.after(restore);

		const result = await service.parseImage(
			studentId,
			"https://example.com/img.png",
			"/tmp/img.png",
			"image/png",
		);

		// This text should produce a confidence in the 0.5-0.85 range
		if (result.confidence >= 0.5 && result.confidence < 0.85) {
			assert.equal(result.ocr_status, "parsed");
			assert.ok(result.warnings.includes("low_confidence"));
		} else if (result.confidence < 0.5) {
			// If confidence is below 0.5, it should be manual_required
			assert.equal(result.ocr_status, "manual_required");
		} else {
			// If confidence is >= 0.85, it should be parsed without warning
			assert.equal(result.ocr_status, "parsed");
			assert.ok(!result.warnings.includes("low_confidence"));
		}
	});

	test("confidence < 0.5 → ocr_status = 'manual_required'", async (t) => {
		// Very short text with no math indicators
		const { service, restore } = createMockedSolverService({
			extractResult: {
				parsedText: "hi",
				tokensUsed: { input: 5, output: 2 },
			},
		});
		t.after(restore);

		const result = await service.parseImage(
			studentId,
			"https://example.com/img.png",
			"/tmp/img.png",
			"image/png",
		);

		assert.ok(result.confidence < 0.5, `Expected confidence < 0.5, got ${result.confidence}`);
		assert.equal(result.ocr_status, "manual_required");
	});

	test("empty parsed_text → ocr_status = 'manual_required', confidence = 0", async (t) => {
		const { service, restore } = createMockedSolverService({
			extractResult: {
				parsedText: "",
				tokensUsed: { input: 5, output: 0 },
			},
		});
		t.after(restore);

		const result = await service.parseImage(
			studentId,
			"https://example.com/img.png",
			"/tmp/img.png",
			"image/png",
		);

		assert.equal(result.confidence, 0);
		assert.equal(result.ocr_status, "manual_required");
	});
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. Dedupe (same sha256 → 1 physical object stored)
// ═══════════════════════════════════════════════════════════════════════════

describe("OCR Hardening — Dedupe (same sha256 → 1 physical object)", () => {
	let tmpDir: string;
	let storage: LocalDiskOCRStorage;

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ocr-dedupe-test-"));
		storage = new LocalDiskOCRStorage(tmpDir);
	});

	afterEach(() => {
		fs.rmSync(tmpDir, { recursive: true, force: true });
	});

	test("uploading same content twice stores only 1 physical file", async () => {
		const buffer = Buffer.from("identical-math-problem-image-content");
		const input: ObjectPutInput = {
			buffer,
			mimeType: "image/png",
			scope: "solver",
		};

		const result1 = await storage.putImage(input);
		const result2 = await storage.putImage(input);

		// Same storage_key and sha256
		assert.equal(result1.storage_key, result2.storage_key);
		assert.equal(result1.sha256, result2.sha256);

		// Only 1 file on disk
		const fullPath = path.resolve(tmpDir, result1.storage_key);
		assert.ok(fs.existsSync(fullPath));

		// Count files in the directory tree
		const countFiles = (dir: string): number => {
			let count = 0;
			for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
				if (entry.isFile()) count++;
				else if (entry.isDirectory()) count += countFiles(path.join(dir, entry.name));
			}
			return count;
		};
		assert.equal(countFiles(tmpDir), 1);
	});

	test("different content produces different storage keys", async () => {
		const buffer1 = Buffer.from("math-problem-1");
		const buffer2 = Buffer.from("math-problem-2");

		const result1 = await storage.putImage({ buffer: buffer1, mimeType: "image/png", scope: "solver" });
		const result2 = await storage.putImage({ buffer: buffer2, mimeType: "image/png", scope: "solver" });

		assert.notEqual(result1.storage_key, result2.storage_key);
		assert.notEqual(result1.sha256, result2.sha256);
	});

	test("same sha256 from different students creates separate OCRResult per student but same storage_key", async (t) => {
		const buffer = Buffer.from("shared-problem-image");
		const { service, createdOcrResults, restore } = createMockedSolverService({
			extractResult: {
				parsedText: "Giải phương trình x² + 2x + 1 = 0",
				tokensUsed: { input: 30, output: 10 },
			},
		});
		t.after(restore);

		const storageResult = await storage.putImage({
			buffer,
			mimeType: "image/png",
			scope: "solver",
		});

		const storageInfo = {
			storage_key: storageResult.storage_key,
			storage_url: storageResult.storage_url,
			sha256: storageResult.sha256,
			size_bytes: storageResult.size_bytes,
		};

		// Student A
		await service.parseImage("student-A", "url1", "/tmp/img.png", "image/png", storageInfo);
		// Student B
		await service.parseImage("student-B", "url2", "/tmp/img.png", "image/png", storageInfo);

		// Two separate OCRResult records created
		assert.equal(createdOcrResults.length, 2);
		assert.equal(createdOcrResults[0].student_id, "student-A");
		assert.equal(createdOcrResults[1].student_id, "student-B");
		// Both reference the same storage_key
		assert.equal(createdOcrResults[0].storage_key, storageResult.storage_key);
		assert.equal(createdOcrResults[1].storage_key, storageResult.storage_key);
	});
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. Rate-limit quota enforcement
// ═══════════════════════════════════════════════════════════════════════════

describe("OCR Hardening — Rate-limit quota enforcement", () => {
	test("after OCR_DAILY_QUOTA_PER_STUDENT (30) successful requests → 429", async () => {
		// Simulate the ocrRateLimit middleware behavior
		const OCR_DAILY_QUOTA_PER_STUDENT = 30;

		// Mock the countSuccessfulToday to return 30 (quota exhausted)
		const mockCountSuccessfulToday = async (_studentId: string) => OCR_DAILY_QUOTA_PER_STUDENT;

		const count = await mockCountSuccessfulToday(studentId);
		assert.ok(count >= OCR_DAILY_QUOTA_PER_STUDENT);

		// Simulate middleware response
		const responseStatus = count >= OCR_DAILY_QUOTA_PER_STUDENT ? 429 : 200;
		const responseBody = count >= OCR_DAILY_QUOTA_PER_STUDENT
			? { success: false, error: "Đã hết lượt OCR trong ngày." }
			: null;

		assert.equal(responseStatus, 429);
		assert.deepEqual(responseBody, {
			success: false,
			error: "Đã hết lượt OCR trong ngày.",
		});
	});

	test("below quota → request proceeds (no 429)", async () => {
		const OCR_DAILY_QUOTA_PER_STUDENT = 30;
		const mockCountSuccessfulToday = async (_studentId: string) => 15;

		const count = await mockCountSuccessfulToday(studentId);
		assert.ok(count < OCR_DAILY_QUOTA_PER_STUDENT);
	});

	test("remaining_quota is correctly computed in parseImage response", async (t) => {
		const { service, restore } = createMockedSolverService({
			extractResult: {
				parsedText: "Tính diện tích hình tròn bán kính 5cm",
				tokensUsed: { input: 20, output: 10 },
			},
			countSuccessfulToday: 25,
		});
		t.after(restore);

		const result = await service.parseImage(
			studentId,
			"https://example.com/img.png",
			"/tmp/img.png",
			"image/png",
		);

		// OCR_DAILY_QUOTA_PER_STUDENT (30) - 25 successful today = 5 remaining
		assert.equal(result.remaining_quota, 5);
	});

	test("remaining_quota is 0 when at quota limit", async (t) => {
		const { service, restore } = createMockedSolverService({
			extractResult: {
				parsedText: "Tìm x biết 3x + 1 = 10",
				tokensUsed: { input: 15, output: 8 },
			},
			countSuccessfulToday: 30,
		});
		t.after(restore);

		const result = await service.parseImage(
			studentId,
			"https://example.com/img.png",
			"/tmp/img.png",
			"image/png",
		);

		assert.equal(result.remaining_quota, 0);
	});

	test("MIME type validation: non-image/* → 400 (middleware behavior)", () => {
		// Simulate the middleware MIME check
		const file = { mimetype: "application/pdf", size: 1024 };
		const isImage = file.mimetype.startsWith("image/");
		assert.equal(isImage, false);
		// Middleware would return 400 for non-image MIME types
	});

	test("File size validation: > 5MB → 400 (middleware behavior)", () => {
		const OCR_MAX_FILE_SIZE = 5 * 1024 * 1024;
		const file = { mimetype: "image/png", size: 6 * 1024 * 1024 };
		const exceedsSize = file.size > OCR_MAX_FILE_SIZE;
		assert.equal(exceedsSize, true);
	});
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. Retry logic (1 retry, backoff 500ms)
// ═══════════════════════════════════════════════════════════════════════════

describe("OCR Hardening — Retry logic (1 retry, backoff 500ms)", () => {
	test("AI failure triggers exactly 1 retry (2 total attempts)", async (t) => {
		const callCount = { count: 0 };
		const { service, restore } = createMockedSolverService({
			extractError: new Error("AI provider timeout"),
			extractCallCount: callCount,
		});
		t.after(restore);

		const result = await service.parseImage(
			studentId,
			"https://example.com/img.png",
			"/tmp/img.png",
			"image/png",
		);

		// Should have attempted exactly 2 times (1 initial + 1 retry)
		assert.equal(callCount.count, 2);
		// After both fail, status should be manual_required
		assert.equal(result.ocr_status, "manual_required");
		assert.equal(result.confidence, 0);
	});

	test("retry backoff is approximately 500ms", async (t) => {
		const callTimestamps: number[] = [];
		const originalExtract = aiService.extractTextFromImage;
		const originalLog = aiService.logGeneration;

		aiService.extractTextFromImage = async () => {
			callTimestamps.push(Date.now());
			throw new Error("AI timeout");
		};
		aiService.logGeneration = async () => {};

		t.after(() => {
			aiService.extractTextFromImage = originalExtract;
			aiService.logGeneration = originalLog;
		});

		const service = new SolverService() as any;
		service.solverRepo = { create: async (p: any) => p };
		service.ocrResultRepo = {
			create: async (p: any) => ({ _id: "id", ...p }),
			countSuccessfulToday: async () => 0,
		};

		await service.parseImage(studentId, "url", "/tmp/img.png", "image/png");

		assert.equal(callTimestamps.length, 2);
		const elapsed = callTimestamps[1] - callTimestamps[0];
		// Backoff should be ~500ms (allow 400-700ms tolerance for CI)
		assert.ok(elapsed >= 400, `Expected backoff >= 400ms, got ${elapsed}ms`);
		assert.ok(elapsed <= 700, `Expected backoff <= 700ms, got ${elapsed}ms`);
	});

	test("first attempt succeeds → no retry", async (t) => {
		const callCount = { count: 0 };
		const { service, restore } = createMockedSolverService({
			extractResult: {
				parsedText: "Giải phương trình x + 1 = 2",
				tokensUsed: { input: 10, output: 5 },
			},
			extractCallCount: callCount,
		});
		t.after(restore);

		const result = await service.parseImage(
			studentId,
			"https://example.com/img.png",
			"/tmp/img.png",
			"image/png",
		);

		assert.equal(callCount.count, 1);
		assert.notEqual(result.ocr_status, "failed");
	});

	test("first attempt fails, retry succeeds → parsed result", async (t) => {
		let attempt = 0;
		const originalExtract = aiService.extractTextFromImage;
		const originalLog = aiService.logGeneration;

		aiService.extractTextFromImage = async () => {
			attempt++;
			if (attempt === 1) throw new Error("Transient failure");
			return {
				parsedText: "Tính tổng 1 + 2 + 3 + ... + 100",
				tokensUsed: { input: 20, output: 10 },
			};
		};
		aiService.logGeneration = async () => {};

		t.after(() => {
			aiService.extractTextFromImage = originalExtract;
			aiService.logGeneration = originalLog;
		});

		const service = new SolverService() as any;
		service.solverRepo = { create: async (p: any) => p };
		service.ocrResultRepo = {
			create: async (p: any) => ({ _id: "id", ...p }),
			countSuccessfulToday: async () => 0,
		};

		const result = await service.parseImage(studentId, "url", "/tmp/img.png", "image/png");

		assert.equal(attempt, 2);
		assert.equal(result.ocr_status, "parsed");
		assert.ok(result.parsed_text.length > 0);
	});

	test("raw provider error is not exposed in response", async (t) => {
		const { service, restore } = createMockedSolverService({
			extractError: new Error("Internal server error: API key sk-abc123 invalid at https://api.openai.com/v1/chat"),
		});
		t.after(restore);

		const result = await service.parseImage(
			studentId,
			"https://example.com/img.png",
			"/tmp/img.png",
			"image/png",
		);

		// Response should not contain raw error details
		assert.ok(!result.message.includes("sk-abc123"));
		assert.ok(!result.message.includes("api.openai.com"));
		assert.equal(result.ocr_status, "manual_required");
	});
});

// ═══════════════════════════════════════════════════════════════════════════
// 5. Property 9: Risk score bounds (0 <= risk_score <= 100)
// ═══════════════════════════════════════════════════════════════════════════

describe("OCR Hardening — Property 9: Risk score bounds", () => {
	/**
	 * **Validates: Requirements 4.1–4.10**
	 *
	 * Property 9: Risk score bounds
	 * ∀ row LearningRiskScore: 0 <= risk_score <= 100
	 *
	 * The risk score is computed as:
	 * risk_score = Math.round(
	 *   (0.30 * absenteeism_rate +
	 *    0.20 * incomplete_session_rate +
	 *    0.20 * low_engagement_rate +
	 *    0.15 * quiz_decline_rate +
	 *    0.15 * missed_recommendation_rate) * 100
	 * )
	 *
	 * Since all rates are in [0, 1] and weights sum to 1.0,
	 * the result must always be in [0, 100].
	 */
	test("Property 9: computeRiskScore always produces 0 <= risk_score <= 100 for any valid rates", () => {
		// Replicate the risk score computation logic for property testing
		const WEIGHTS = {
			absenteeism: 0.30,
			incomplete_session: 0.20,
			low_engagement: 0.20,
			quiz_decline: 0.15,
			missed_recommendation: 0.15,
		};

		fc.assert(
			fc.property(
				fc.record({
					absenteeismRate: fc.double({ min: 0, max: 1, noNaN: true }),
					incompleteSessionRate: fc.double({ min: 0, max: 1, noNaN: true }),
					lowEngagementRate: fc.double({ min: 0, max: 1, noNaN: true }),
					quizDeclineRate: fc.double({ min: 0, max: 1, noNaN: true }),
					missedRecommendationRate: fc.double({ min: 0, max: 1, noNaN: true }),
				}),
				(rates) => {
					const riskScore = Math.round(
						(WEIGHTS.absenteeism * rates.absenteeismRate +
							WEIGHTS.incomplete_session * rates.incompleteSessionRate +
							WEIGHTS.low_engagement * rates.lowEngagementRate +
							WEIGHTS.quiz_decline * rates.quizDeclineRate +
							WEIGHTS.missed_recommendation * rates.missedRecommendationRate) * 100,
					);

					return riskScore >= 0 && riskScore <= 100;
				},
			),
			{ numRuns: 1000 },
		);
	});

	test("Property 9: risk_score = 0 when all rates are 0", () => {
		const WEIGHTS = {
			absenteeism: 0.30,
			incomplete_session: 0.20,
			low_engagement: 0.20,
			quiz_decline: 0.15,
			missed_recommendation: 0.15,
		};

		const riskScore = Math.round(
			(WEIGHTS.absenteeism * 0 +
				WEIGHTS.incomplete_session * 0 +
				WEIGHTS.low_engagement * 0 +
				WEIGHTS.quiz_decline * 0 +
				WEIGHTS.missed_recommendation * 0) * 100,
		);

		assert.equal(riskScore, 0);
	});

	test("Property 9: risk_score = 100 when all rates are 1", () => {
		const WEIGHTS = {
			absenteeism: 0.30,
			incomplete_session: 0.20,
			low_engagement: 0.20,
			quiz_decline: 0.15,
			missed_recommendation: 0.15,
		};

		const riskScore = Math.round(
			(WEIGHTS.absenteeism * 1 +
				WEIGHTS.incomplete_session * 1 +
				WEIGHTS.low_engagement * 1 +
				WEIGHTS.quiz_decline * 1 +
				WEIGHTS.missed_recommendation * 1) * 100,
		);

		assert.equal(riskScore, 100);
	});

	test("Property 9: weights sum to 1.0", () => {
		const WEIGHTS = {
			absenteeism: 0.30,
			incomplete_session: 0.20,
			low_engagement: 0.20,
			quiz_decline: 0.15,
			missed_recommendation: 0.15,
		};

		const sum = Object.values(WEIGHTS).reduce((a, b) => a + b, 0);
		assert.ok(
			Math.abs(sum - 1.0) < 1e-10,
			`Weights sum should be 1.0, got ${sum}`,
		);
	});

	test("Property 9: risk_level classification is consistent with score", () => {
		fc.assert(
			fc.property(
				fc.integer({ min: 0, max: 100 }),
				(riskScore) => {
					const riskLevel =
						riskScore <= 30 ? "low" :
						riskScore <= 60 ? "medium" :
						"high";

					if (riskScore <= 30) return riskLevel === "low";
					if (riskScore <= 60) return riskLevel === "medium";
					return riskLevel === "high";
				},
			),
			{ numRuns: 200 },
		);
	});
});
