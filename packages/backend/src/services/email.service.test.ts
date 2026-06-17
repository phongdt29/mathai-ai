import assert from "node:assert/strict";
import { test } from "node:test";

import {
	buildEmailProviderSmokeEvidence,
	EmailService,
	type SendTemplatedResult,
} from "./email.service";

type FetchCall = {
	input: string | URL | Request;
	init?: RequestInit;
};

const baseOptions = {
	provider: "http" as const,
	from: "noreply@mathai.vn",
	apiUrl: "https://email.example.com/send",
	apiKey: "test-api-key",
	retryDelayMs: 0,
};

function createMessage() {
	return {
		to: "student@example.com",
		subject: "Khôi phục tài khoản",
		text: "Mở liên kết khôi phục trong 15 phút.",
	};
}

test("HTTP email provider sends expected payload with timeout signal", async () => {
	const calls: FetchCall[] = [];
	const fetchFn = async (input: string | URL | Request, init?: RequestInit) => {
		calls.push({ input, init });
		return new Response(null, { status: 202 });
	};
	const service = new EmailService({
		...baseOptions,
		fetchFn,
		timeoutMs: 1234,
	});

	await service.sendPasswordResetEmail(createMessage());

	assert.equal(calls.length, 1);
	assert.equal(String(calls[0]?.input), "https://email.example.com/send");
	assert.equal(calls[0]?.init?.method, "POST");
	assert.deepEqual(calls[0]?.init?.headers, {
		"Content-Type": "application/json",
		Authorization: "Bearer test-api-key",
	});
	assert.ok(calls[0]?.init?.signal instanceof AbortSignal);
	assert.deepEqual(JSON.parse(String(calls[0]?.init?.body)), {
		from: "noreply@mathai.vn",
		to: "student@example.com",
		subject: "Khôi phục tài khoản",
		text: "Mở liên kết khôi phục trong 15 phút.",
	});
});

test("HTTP email provider retries transient failures then succeeds", async () => {
	let attempts = 0;
	const fetchFn = async () => {
		attempts += 1;
		return new Response(null, { status: attempts === 1 ? 500 : 202 });
	};
	const service = new EmailService({
		...baseOptions,
		fetchFn,
		maxRetries: 1,
	});

	await service.sendPasswordResetEmail(createMessage());

	assert.equal(attempts, 2);
});

test("HTTP email provider does not retry permanent provider failures", async () => {
	let attempts = 0;
	const fetchFn = async () => {
		attempts += 1;
		return new Response("invalid", { status: 400 });
	};
	const service = new EmailService({
		...baseOptions,
		fetchFn,
		maxRetries: 3,
	});

	await assert.rejects(
		() => service.sendPasswordResetEmail(createMessage()),
		/status 400/,
	);
	assert.equal(attempts, 1);
});

test("HTTP email provider aborts timed out requests without leaking message content", async () => {
	const fetchFn = async (
		_input: string | URL | Request,
		init?: RequestInit,
	) => {
		return new Promise<Response>((_resolve, reject) => {
			init?.signal?.addEventListener("abort", () => {
				reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
			});
		});
	};
	const service = new EmailService({
		...baseOptions,
		fetchFn,
		maxRetries: 0,
		timeoutMs: 1,
	});

	await assert.rejects(
		() => service.sendPasswordResetEmail(createMessage()),
		(error: unknown) => {
			assert.ok(error instanceof Error);
			assert.match(error.message, /timed out|failed/i);
			assert.doesNotMatch(error.message, /Mở liên kết/);
			assert.doesNotMatch(error.message, /test-api-key/);
			return true;
		},
	);
});

test("email provider smoke evidence is redacted and does not send mail", () => {
	let called = false;
	const service = new EmailService({
		...baseOptions,
		fetchFn: async () => {
			called = true;
			return new Response(null, { status: 202 });
		},
	});

	const evidence = buildEmailProviderSmokeEvidence({
		provider: "http",
		environment: "production-like-staging",
		status: "passed",
		source: "manual-smoke",
	});

	assert.equal(called, false);
	assert.equal(evidence.provider, "http");
	assert.equal(evidence.environment, "production-like-staging");
	assert.equal(evidence.status, "passed");
	assert.equal(evidence.source, "manual-smoke");
	assert.ok(evidence.generatedAt);
	assert.deepEqual(Object.keys(evidence).sort(), [
		"environment",
		"generatedAt",
		"provider",
		"source",
		"status",
	]);
	assert.doesNotMatch(
		JSON.stringify(evidence),
		/student@example\.com|test-api-key|email\.example\.com/i,
	);
	void service;
});


// --- sendTemplated tests ---

const templatedBaseOptions = {
	provider: "http" as const,
	from: "MathAI <no-reply@mathai.vn>",
	replyTo: "support@mathai.vn",
	apiUrl: "https://email.example.com/send",
	apiKey: "test-api-key",
};

function createTemplatedInput() {
	return {
		template_id: "password_reset.v1",
		to: "user@example.com",
		vars: { reset_link: "https://app.mathai.vn/reset?token=abc" },
	};
}

test("sendTemplated sends correct payload with From and Reply-To headers", async () => {
	const calls: Array<{ input: string | URL | Request; init?: RequestInit }> = [];
	const fetchFn = async (input: string | URL | Request, init?: RequestInit) => {
		calls.push({ input, init });
		return new Response(JSON.stringify({ id: "msg_123" }), { status: 200 });
	};
	const service = new EmailService({
		...templatedBaseOptions,
		fetchFn,
		timeoutMs: 5000,
	});

	const result = await service.sendTemplated(createTemplatedInput());

	assert.equal(result.success, true);
	assert.equal(result.provider_message_id, "msg_123");
	assert.equal(result.error_code, null);
	assert.equal(calls.length, 1);

	const body = JSON.parse(String(calls[0]?.init?.body));
	assert.equal(body.from, "MathAI <no-reply@mathai.vn>");
	assert.equal(body.reply_to, "support@mathai.vn");
	assert.equal(body.to, "user@example.com");
	assert.equal(body.template_id, "password_reset.v1");
	assert.deepEqual(body.template_vars, { reset_link: "https://app.mathai.vn/reset?token=abc" });

	const headers = calls[0]?.init?.headers as Record<string, string>;
	assert.equal(headers["Authorization"], "Bearer test-api-key");
	assert.equal(headers["X-Reply-To"], "support@mathai.vn");
});

test("sendTemplated retries 3 times with exponential backoff on 5xx", async () => {
	let attempts = 0;
	const timestamps: number[] = [];
	const fetchFn = async () => {
		attempts += 1;
		timestamps.push(Date.now());
		if (attempts <= 3) {
			return new Response(null, { status: 503 });
		}
		return new Response(JSON.stringify({ id: "msg_retry_ok" }), { status: 200 });
	};
	const service = new EmailService({
		...templatedBaseOptions,
		fetchFn,
		timeoutMs: 5000,
	});

	const result = await service.sendTemplated(createTemplatedInput());

	assert.equal(result.success, true);
	assert.equal(result.provider_message_id, "msg_retry_ok");
	assert.equal(attempts, 4); // 1 initial + 3 retries
});

test("sendTemplated fails after exhausting all retries on 5xx", async () => {
	let attempts = 0;
	const fetchFn = async () => {
		attempts += 1;
		return new Response(null, { status: 500 });
	};
	const service = new EmailService({
		...templatedBaseOptions,
		fetchFn,
		timeoutMs: 5000,
	});

	const result = await service.sendTemplated(createTemplatedInput());

	assert.equal(result.success, false);
	assert.equal(result.provider_message_id, null);
	assert.equal(result.error_code, "provider_unavailable");
	assert.equal(attempts, 4); // 1 initial + 3 retries
});

test("sendTemplated does not retry on 4xx (non-retryable)", async () => {
	let attempts = 0;
	const fetchFn = async () => {
		attempts += 1;
		return new Response(null, { status: 400 });
	};
	const service = new EmailService({
		...templatedBaseOptions,
		fetchFn,
		timeoutMs: 5000,
	});

	const result = await service.sendTemplated(createTemplatedInput());

	assert.equal(result.success, false);
	assert.equal(result.error_code, "request_rejected");
	assert.equal(attempts, 1);
});

test("sendTemplated retries on timeout (AbortError)", async () => {
	let attempts = 0;
	const fetchFn = async (_input: string | URL | Request, init?: RequestInit) => {
		attempts += 1;
		return new Promise<Response>((_resolve, reject) => {
			init?.signal?.addEventListener("abort", () => {
				reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
			});
		});
	};
	const service = new EmailService({
		...templatedBaseOptions,
		fetchFn,
		timeoutMs: 1,
	});

	const result = await service.sendTemplated(createTemplatedInput());

	assert.equal(result.success, false);
	assert.equal(result.error_code, "timeout");
	assert.equal(attempts, 4); // 1 initial + 3 retries
});

test("sendTemplated does not expose raw provider error details", async () => {
	const fetchFn = async () => {
		throw new Error("Internal: secret database connection string leaked xyz123");
	};
	const service = new EmailService({
		...templatedBaseOptions,
		fetchFn,
		timeoutMs: 5000,
	});

	const result = await service.sendTemplated(createTemplatedInput());

	assert.equal(result.success, false);
	assert.equal(result.error_code, "delivery_failed");
	assert.equal(result.provider_message_id, null);
	// Ensure no raw error details in the result
	const serialized = JSON.stringify(result);
	assert.doesNotMatch(serialized, /secret|database|connection|xyz123/i);
});

test("sendTemplated console provider returns success without HTTP call", async () => {
	let httpCalled = false;
	const fetchFn = async () => {
		httpCalled = true;
		return new Response(null, { status: 200 });
	};
	const service = new EmailService({
		...templatedBaseOptions,
		provider: "console",
		fetchFn,
	});

	const result = await service.sendTemplated(createTemplatedInput());

	assert.equal(result.success, true);
	assert.ok(result.provider_message_id?.startsWith("console_"));
	assert.equal(result.error_code, null);
	assert.equal(httpCalled, false);
});

test("sendTemplated extracts messageId from various provider response formats", async () => {
	const formats = [
		{ id: "resend_123" },
		{ messageId: "sendgrid_456" },
		{ message_id: "generic_789" },
	];

	for (const responseBody of formats) {
		const fetchFn = async () => {
			return new Response(JSON.stringify(responseBody), { status: 200 });
		};
		const service = new EmailService({
			...templatedBaseOptions,
			fetchFn,
			timeoutMs: 5000,
		});

		const result = await service.sendTemplated(createTemplatedInput());
		assert.equal(result.success, true);
		assert.ok(result.provider_message_id, `Should extract id from ${JSON.stringify(responseBody)}`);
	}
});

test("sendTemplated returns null provider_message_id when response has no id field", async () => {
	const fetchFn = async () => {
		return new Response(JSON.stringify({ status: "queued" }), { status: 200 });
	};
	const service = new EmailService({
		...templatedBaseOptions,
		fetchFn,
		timeoutMs: 5000,
	});

	const result = await service.sendTemplated(createTemplatedInput());

	assert.equal(result.success, true);
	assert.equal(result.provider_message_id, null);
	assert.equal(result.error_code, null);
});

test("sendTemplated returns rate_limited error_code on 429", async () => {
	const fetchFn = async () => {
		return new Response(null, { status: 429 });
	};
	const service = new EmailService({
		...templatedBaseOptions,
		fetchFn,
		timeoutMs: 5000,
	});

	const result = await service.sendTemplated(createTemplatedInput());

	// 429 is retryable, so it retries 3 times then fails
	assert.equal(result.success, false);
	assert.equal(result.error_code, "rate_limited");
});
