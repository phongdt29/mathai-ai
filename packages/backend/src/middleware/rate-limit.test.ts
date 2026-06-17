import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import type { Request, Response, NextFunction } from "express";
import { globalApiRateLimit } from "./rate-limit";

/**
 * Unit tests for global API rate limit enforcement.
 * Validates: Requirements 13.12
 *
 * The globalApiRateLimit middleware enforces 600 req/min/IP for /api/*.
 * After exceeding the limit, subsequent requests receive HTTP 429.
 */

function createMockReq(ip = "127.0.0.1"): Request {
	return {
		ip,
		method: "GET",
		path: "/api/test",
		url: "/api/test",
		headers: {},
		socket: { remoteAddress: ip },
		app: {
			get: () => false,
		},
	} as unknown as Request;
}

function createMockRes(): Response & {
	_statusCode: number;
	_body: unknown;
	_headers: Record<string, string>;
} {
	const res = {
		_statusCode: 200,
		_body: null as unknown,
		_headers: {} as Record<string, string>,
		statusCode: 200,
		status(code: number) {
			res._statusCode = code;
			res.statusCode = code;
			return res;
		},
		json(body: unknown) {
			res._body = body;
			return res;
		},
		send(body: unknown) {
			res._body = body;
			return res;
		},
		set(key: string, value: string) {
			res._headers[key] = value;
			return res;
		},
		setHeader(key: string, value: string) {
			res._headers[key] = value;
			return res;
		},
		getHeader(key: string) {
			return res._headers[key];
		},
		end() {
			return res;
		},
	};
	return res as unknown as Response & {
		_statusCode: number;
		_body: unknown;
		_headers: Record<string, string>;
	};
}

describe("globalApiRateLimit", () => {
	// express-rate-limit uses an internal MemoryStore by default.
	// We need to reset it between tests. The store is internal to the middleware,
	// so we use a unique IP per test to avoid cross-test contamination.

	it("should allow requests under the 600 req/min limit", (_, done) => {
		const ip = `10.0.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;
		const req = createMockReq(ip);
		const res = createMockRes();

		globalApiRateLimit(req, res as unknown as Response, (() => {
			// next() was called — request was allowed
			assert.ok(true, "Request should be allowed under the limit");
			done();
		}) as NextFunction);
	});

	it("should return 429 after exceeding 600 requests from same IP", async () => {
		// Use a unique IP for this test to avoid interference
		const ip = `192.168.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;
		let blocked = false;
		let blockedStatusCode = 0;

		// Send 601 requests from the same IP
		for (let i = 0; i <= 600; i++) {
			const req = createMockReq(ip);
			const res = createMockRes();

			await new Promise<void>((resolve) => {
				globalApiRateLimit(req, res as unknown as Response, (() => {
					resolve();
				}) as NextFunction);

				// If next() is not called, the middleware responded directly
				// Check after a tick if the response was set
				setTimeout(() => {
					if (res._statusCode === 429) {
						blocked = true;
						blockedStatusCode = res._statusCode;
					}
					resolve();
				}, 0);
			});

			if (blocked) break;
		}

		assert.equal(blocked, true, "Should be blocked after exceeding 600 req/min");
		assert.equal(blockedStatusCode, 429, "Should return HTTP 429 Too Many Requests");
	});

	it("should track rate limits per IP independently", (_, done) => {
		// A different IP should not be affected by another IP's rate limit
		const freshIp = `172.16.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;
		const req = createMockReq(freshIp);
		const res = createMockRes();

		globalApiRateLimit(req, res as unknown as Response, (() => {
			// next() was called — this fresh IP is not rate-limited
			assert.ok(true, "Fresh IP should not be rate-limited");
			done();
		}) as NextFunction);
	});
});
