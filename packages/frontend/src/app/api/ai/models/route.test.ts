import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { POST } from "./route";

const originalFetch = globalThis.fetch;
const calls: Array<{ url: string; init: RequestInit | undefined }> = [];

function createRequest(body: unknown) {
	return {
		json: async () => body,
	} as Parameters<typeof POST>[0];
}

function installFetchMock(data: unknown = { data: [{ id: "gpt-test" }] }) {
	calls.length = 0;
	globalThis.fetch = async (
		input: string | URL | Request,
		init?: RequestInit,
	) => {
		calls.push({ url: String(input), init });
		return new Response(JSON.stringify(data), {
			status: 200,
			headers: { "Content-Type": "application/json" },
		});
	};
}

afterEach(() => {
	globalThis.fetch = originalFetch;
	calls.length = 0;
});

test("AI model route rejects unsafe local provider endpoints before fetch", async () => {
	installFetchMock();

	for (const endpoint of [
		"http://127.0.0.1:11434",
		"https://localhost:11434",
		"https://192.168.1.10/v1",
		"https://[::1]/v1",
	]) {
		const response = await POST(createRequest({ endpoint, apiKey: "sk-test" }));
		const payload = await response.json();

		assert.equal(response.status, 400);
		assert.match(payload.error, /public HTTPS endpoint/i);
	}
	assert.equal(calls.length, 0);
});

test("AI model route fetches models from a normalized HTTPS provider endpoint", async () => {
	installFetchMock({ data: [{ id: "model-1" }] });

	const response = await POST(
		createRequest({
			endpoint: "https://provider.example.com/v1///",
			apiKey: "sk-test",
		}),
	);
	const payload = await response.json();

	assert.equal(response.status, 200);
	assert.deepEqual(payload, { data: [{ id: "model-1" }] });
	assert.equal(calls.length, 1);
	assert.equal(calls[0]?.url, "https://provider.example.com/v1/models");
	assert.equal(
		(calls[0]?.init?.headers as Record<string, string>).Authorization,
		"Bearer sk-test",
	);
});
