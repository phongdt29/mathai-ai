import assert from "node:assert/strict";
import test from "node:test";

import aiService from "./ai.service";
import { SolverService } from "./solver.service";

const studentId = "507f1f77bcf86cd799439011";

test("parseImage logs successful OCR with safe governance metadata and stores parsed request", async (t) => {
	const originalExtractTextFromImage = aiService.extractTextFromImage;
	const originalLogGeneration = aiService.logGeneration;
	const capturedLogs: unknown[] = [];
	const capturedSolverRequests: Array<Record<string, unknown>> = [];

	aiService.extractTextFromImage = async () => ({
		parsedText: "Giải phương trình 2x + 3 = 7",
		tokensUsed: { input: 42, output: 8 },
	});
	aiService.logGeneration = async (input: unknown) => {
		capturedLogs.push(input);
	};

	t.after(() => {
		aiService.extractTextFromImage = originalExtractTextFromImage;
		aiService.logGeneration = originalLogGeneration;
	});

	const service = new SolverService() as any;
	service.solverRepo = {
		create: async (payload: Record<string, unknown>) => {
			capturedSolverRequests.push(payload);
			return payload;
		},
	};
	service.ocrResultRepo = {
		create: async (payload: Record<string, unknown>) => ({ _id: "mock_ocr_id", ...payload }),
		countSuccessfulToday: async () => 5,
	};

	const result = await service.parseImage(
		studentId,
		"https://cdn.mathai.example/uploads/problem.png",
		"/tmp/problem.png",
		"image/png",
	);

	assert.equal(result.ocr_status, "parsed");
	assert.equal(result.parsed_text, "Giải phương trình 2x + 3 = 7");
	assert.ok(result.confidence >= 0.85, `confidence ${result.confidence} should be >= 0.85`);
	assert.equal(result.ocr_result_id, "mock_ocr_id");
	assert.equal(result.remaining_quota, 25);
	assert.equal(capturedSolverRequests.length, 1);
	assert.equal(
		capturedSolverRequests[0]?.parsed_text,
		"Giải phương trình 2x + 3 = 7",
	);
	assert.equal(capturedLogs.length, 1);

	const logInput = capturedLogs[0] as {
		studentId?: string;
		type?: string;
		prompt?: Record<string, unknown>;
		response?: Record<string, unknown>;
		status?: string;
		model?: string | null;
		tokensInput?: number | null;
		tokensOutput?: number | null;
		metadata?: Record<string, unknown>;
	};
	assert.equal(logInput.studentId, studentId);
	assert.equal(logInput.type, "solver_image_ocr");
	assert.deepEqual(logInput.prompt, {
		imageUrl: "[redacted]",
		mimeType: "image/png",
	});
	assert.deepEqual(logInput.response, {
		parsedText: "[redacted]",
		ocrStatus: "parsed",
	});
	assert.equal(logInput.status, "success");
	assert.equal(logInput.model, "gpt-4o-mini");
	assert.equal(logInput.tokensInput, 42);
	assert.equal(logInput.tokensOutput, 8);
	assert.equal(logInput.metadata?.purpose, "ocr_math_problem");
	assert.equal(logInput.metadata?.promptTemplate, "solver_image_ocr");
	assert.equal(logInput.metadata?.promptVersion, "v1");
	assert.equal(logInput.metadata?.safetyStatus, "not_checked");
	assert.equal(logInput.metadata?.inputRedacted, true);
	assert.equal(logInput.metadata?.outputRedacted, true);
	assert.equal(logInput.metadata?.requiresApproval, false);
	assert.deepEqual(logInput.metadata?.actor, {
		id: studentId,
		role: "student",
	});
	assert.deepEqual(logInput.metadata?.studentContext, {
		student_id: studentId,
	});
	assert.match(String(logInput.metadata?.explanation ?? ""), /OCR/);
	assert.equal(JSON.stringify(logInput).includes("Giải phương trình"), false);
});

test("parseImage logs OCR extraction failures for investigation while keeping manual entry fallback", async (t) => {
	const originalExtractTextFromImage = aiService.extractTextFromImage;
	const originalLogGeneration = aiService.logGeneration;
	const capturedLogs: unknown[] = [];
	const capturedSolverRequests: Array<Record<string, unknown>> = [];

	aiService.extractTextFromImage = async () => {
		throw new Error(
			"vision provider unavailable for https://cdn.mathai.example/uploads/problem.png",
		);
	};
	aiService.logGeneration = async (input: unknown) => {
		capturedLogs.push(input);
	};

	t.after(() => {
		aiService.extractTextFromImage = originalExtractTextFromImage;
		aiService.logGeneration = originalLogGeneration;
	});

	const service = new SolverService() as any;
	service.solverRepo = {
		create: async (payload: Record<string, unknown>) => {
			capturedSolverRequests.push(payload);
			return payload;
		},
	};
	service.ocrResultRepo = {
		create: async (payload: Record<string, unknown>) => ({ _id: "mock_ocr_id_fail", ...payload }),
		countSuccessfulToday: async () => 2,
	};

	const result = await service.parseImage(
		studentId,
		"https://cdn.mathai.example/uploads/problem.png",
		"/tmp/problem.png",
		"image/png",
	);

	assert.equal(result.ocr_status, "manual_required");
	assert.equal(result.parsed_text, "");
	assert.equal(result.confidence, 0);
	assert.equal(result.remaining_quota, 28);
	assert.equal(capturedSolverRequests.length, 1);
	assert.equal(capturedSolverRequests[0]?.parsed_text, null);
	assert.equal(capturedLogs.length, 1);

	const logInput = capturedLogs[0] as {
		studentId?: string;
		type?: string;
		status?: string;
		errorMessage?: string;
		metadata?: Record<string, unknown>;
	};
	assert.equal(logInput.studentId, studentId);
	assert.equal(logInput.type, "solver_image_ocr");
	assert.equal(logInput.status, "error");
	assert.match(logInput.errorMessage ?? "", /AI extraction failed after retry/);
	assert.equal(logInput.metadata?.purpose, "ocr_math_problem");
	assert.equal(logInput.metadata?.safetyStatus, "not_checked");
});
