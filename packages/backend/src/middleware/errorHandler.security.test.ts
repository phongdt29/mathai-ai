import assert from "node:assert/strict";
import { test } from "node:test";
import type { NextFunction, Request, Response } from "express";
import { ValidationError } from "../utils/errors";
import { errorHandler } from "./errorHandler";

type MockResponse = Response & {
	statusCodeValue?: number;
	body?: unknown;
};

function createMockResponse(): MockResponse {
	const response = {
		status(code: number) {
			this.statusCodeValue = code;
			return this;
		},
		json(body: unknown) {
			this.body = body;
			return this;
		},
	} as MockResponse;

	return response;
}

async function withProductionEnv(run: () => void): Promise<void> {
	const previousNodeEnv = process.env.NODE_ENV;
	const previousConsoleError = console.error;
	process.env.NODE_ENV = "production";
	console.error = () => undefined;
	try {
		run();
	} finally {
		process.env.NODE_ENV = previousNodeEnv;
		console.error = previousConsoleError;
	}
}

test("production error handler hides unexpected error messages from clients", async () => {
	await withProductionEnv(() => {
		const response = createMockResponse();

		errorHandler(
			new Error("database credential leaked in stack trace"),
			{} as Request,
			response,
			(() => undefined) as NextFunction,
		);

		assert.equal(response.statusCodeValue, 500);
		assert.deepEqual(response.body, {
			success: false,
			message: "Internal Server Error",
			data: null,
		});
	});
});

test("production error handler preserves operational validation details", async () => {
	await withProductionEnv(() => {
		const response = createMockResponse();

		errorHandler(
			new ValidationError("Dữ liệu không hợp lệ", [{ field: "email" }]),
			{} as Request,
			response,
			(() => undefined) as NextFunction,
		);

		assert.equal(response.statusCodeValue, 400);
		assert.deepEqual(response.body, {
			success: false,
			message: "Dữ liệu không hợp lệ",
			data: null,
			meta: { errors: [{ field: "email" }] },
		});
	});
});
