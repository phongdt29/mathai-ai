import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { SmsService, SmsProviderError } from "./sms.service";
import type { SmsServiceOptions } from "./sms.service";

function createMockFetch(
	status: number,
	body: unknown,
): typeof fetch {
	return (async () => ({
		ok: status >= 200 && status < 300,
		status,
		json: async () => body,
	})) as unknown as typeof fetch;
}

function createFailingFetch(error: Error): typeof fetch {
	return (async () => {
		throw error;
	}) as unknown as typeof fetch;
}

describe("SmsService", () => {
	describe("console provider", () => {
		let service: SmsService;

		beforeEach(() => {
			service = new SmsService({
				provider: "console",
				apiUrl: "",
				apiKey: "",
				fromNumber: "MathAI",
			});
		});

		it("should return a provider_message_id with console prefix", async () => {
			const result = await service.sendSMS("+84901234567", "Hello");
			assert.ok(result.provider_message_id.startsWith("console_sms_"));
		});

		it("should return a string provider_message_id", async () => {
			const result = await service.sendSMS("+84901234567", "Test message");
			assert.equal(typeof result.provider_message_id, "string");
			assert.ok(result.provider_message_id.length > 0);
		});
	});

	describe("twilio provider", () => {
		const baseOptions: SmsServiceOptions = {
			provider: "twilio",
			apiUrl: "https://api.twilio.com/2010-04-01/Accounts/AC123/Messages.json",
			apiKey: "AC123:auth_token_123",
			fromNumber: "+15551234567",
			timeoutMs: 5000,
		};

		it("should send SMS and return Twilio sid as provider_message_id", async () => {
			const mockFetch = createMockFetch(201, {
				sid: "SM1234567890abcdef",
			});

			const service = new SmsService({ ...baseOptions, fetchFn: mockFetch });
			const result = await service.sendSMS("+84901234567", "Hello from MathAI");

			assert.equal(result.provider_message_id, "SM1234567890abcdef");
		});

		it("should fallback to generated id when response has no sid", async () => {
			const mockFetch = createMockFetch(200, {});

			const service = new SmsService({ ...baseOptions, fetchFn: mockFetch });
			const result = await service.sendSMS("+84901234567", "Hello");

			assert.ok(result.provider_message_id.startsWith("twilio_"));
		});

		it("should throw SmsProviderError on non-ok response", async () => {
			const mockFetch = createMockFetch(401, { message: "Unauthorized" });

			const service = new SmsService({ ...baseOptions, fetchFn: mockFetch });

			await assert.rejects(
				() => service.sendSMS("+84901234567", "Hello"),
				(error: Error) => {
					assert.ok(error instanceof SmsProviderError);
					assert.equal((error as SmsProviderError).status, 401);
					return true;
				},
			);
		});

		it("should throw SmsProviderError on timeout", async () => {
			const abortError = new Error("The operation was aborted");
			abortError.name = "AbortError";
			const mockFetch = createFailingFetch(abortError);

			const service = new SmsService({ ...baseOptions, fetchFn: mockFetch });

			await assert.rejects(
				() => service.sendSMS("+84901234567", "Hello"),
				(error: Error) => {
					assert.ok(error instanceof SmsProviderError);
					assert.equal((error as SmsProviderError).status, 408);
					assert.ok(error.message.includes("timed out"));
					return true;
				},
			);
		});

		it("should throw SmsProviderError on network error", async () => {
			const networkError = new Error("Connection reset");
			(networkError as Error & { code?: string }).code = "ECONNRESET";
			const mockFetch = createFailingFetch(networkError);

			const service = new SmsService({ ...baseOptions, fetchFn: mockFetch });

			await assert.rejects(
				() => service.sendSMS("+84901234567", "Hello"),
				(error: Error) => {
					assert.ok(error instanceof SmsProviderError);
					assert.equal((error as SmsProviderError).status, 503);
					return true;
				},
			);
		});
	});

	describe("esms provider", () => {
		const baseOptions: SmsServiceOptions = {
			provider: "esms",
			apiUrl: "https://rest.esms.vn/MainService.svc/json/SendMultipleMessage_V4_post_json",
			apiKey: "esms_api_key_123",
			fromNumber: "MathAI",
			timeoutMs: 5000,
		};

		it("should send SMS and return eSMS SMSID as provider_message_id", async () => {
			const mockFetch = createMockFetch(200, {
				CodeResult: "100",
				SMSID: "esms_msg_abc123",
			});

			const service = new SmsService({ ...baseOptions, fetchFn: mockFetch });
			const result = await service.sendSMS("0901234567", "Xin chào từ MathAI");

			assert.equal(result.provider_message_id, "esms_msg_abc123");
		});

		it("should fallback to generated id when response has no SMSID", async () => {
			const mockFetch = createMockFetch(200, { CodeResult: "100" });

			const service = new SmsService({ ...baseOptions, fetchFn: mockFetch });
			const result = await service.sendSMS("0901234567", "Hello");

			assert.ok(result.provider_message_id.startsWith("esms_"));
		});

		it("should throw SmsProviderError on non-ok response", async () => {
			const mockFetch = createMockFetch(500, { error: "Internal error" });

			const service = new SmsService({ ...baseOptions, fetchFn: mockFetch });

			await assert.rejects(
				() => service.sendSMS("0901234567", "Hello"),
				(error: Error) => {
					assert.ok(error instanceof SmsProviderError);
					assert.equal((error as SmsProviderError).status, 500);
					return true;
				},
			);
		});

		it("should throw SmsProviderError on timeout", async () => {
			const abortError = new Error("The operation was aborted");
			abortError.name = "AbortError";
			const mockFetch = createFailingFetch(abortError);

			const service = new SmsService({ ...baseOptions, fetchFn: mockFetch });

			await assert.rejects(
				() => service.sendSMS("0901234567", "Hello"),
				(error: Error) => {
					assert.ok(error instanceof SmsProviderError);
					assert.equal((error as SmsProviderError).status, 408);
					return true;
				},
			);
		});
	});

	describe("unknown provider", () => {
		it("should throw SmsProviderError for unknown provider", async () => {
			const service = new SmsService({
				provider: "unknown" as "console",
				apiUrl: "",
				apiKey: "",
				fromNumber: "",
			});

			await assert.rejects(
				() => service.sendSMS("+84901234567", "Hello"),
				(error: Error) => {
					assert.ok(error instanceof SmsProviderError);
					assert.ok(error.message.includes("Unknown SMS provider"));
					return true;
				},
			);
		});
	});
});
