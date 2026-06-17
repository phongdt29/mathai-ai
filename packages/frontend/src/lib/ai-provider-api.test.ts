import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import {
	activateAIProvider,
	createAIProvider,
	deleteAIProvider,
	listAIProviders,
	updateAIProvider,
} from "./api";

const originalFetch = globalThis.fetch;
const calls: Array<{ url: string; init: RequestInit | undefined }> = [];

function installFetchMock(data: unknown = {}) {
	calls.length = 0;
	globalThis.fetch = async (input: string | URL | Request, init?: RequestInit) => {
		calls.push({ url: String(input), init });
		return new Response(JSON.stringify({ success: true, data }), {
			status: 200,
			headers: { "Content-Type": "application/json" },
		});
	};
}

function parseBody(init: RequestInit | undefined) {
	const body = init?.body;
	assert.equal(typeof body, "string");
	return JSON.parse(body as string) as Record<string, unknown>;
}

afterEach(() => {
	globalThis.fetch = originalFetch;
	calls.length = 0;
});

test("admin AI provider API helpers use registry CRUD endpoints and payloads", async () => {
	installFetchMock([]);

	await listAIProviders();
	await createAIProvider({
		name: "OpenRouter",
		provider: "openai-compatible",
		base_url: "https://openrouter.ai/api/v1",
		api_key: "sk-secret",
		model: "openai/gpt-4o-mini",
		is_enabled: true,
	});
	await updateAIProvider("provider 1/2", {
		name: "OpenRouter renamed",
		provider: "openai-compatible",
		base_url: "https://openrouter.ai/api/v1",
		model: "openai/gpt-4o",
		is_enabled: true,
	});
	await activateAIProvider("provider 1/2");
	await deleteAIProvider("provider 1/2");

	assert.deepEqual(
		calls.map((call) => ({
			url: call.url,
			method: call.init?.method ?? "GET",
		})),
		[
			{ url: "/api/admin/ai/providers", method: "GET" },
			{ url: "/api/admin/ai/providers", method: "POST" },
			{ url: "/api/admin/ai/providers/provider%201%2F2", method: "PUT" },
			{ url: "/api/admin/ai/providers/provider%201%2F2/activate", method: "POST" },
			{ url: "/api/admin/ai/providers/provider%201%2F2", method: "DELETE" },
		],
	);
	assert.deepEqual(parseBody(calls[1]?.init), {
		name: "OpenRouter",
		provider: "openai-compatible",
		base_url: "https://openrouter.ai/api/v1",
		api_key: "sk-secret",
		model: "openai/gpt-4o-mini",
		is_enabled: true,
	});
	assert.deepEqual(parseBody(calls[2]?.init), {
		name: "OpenRouter renamed",
		provider: "openai-compatible",
		base_url: "https://openrouter.ai/api/v1",
		model: "openai/gpt-4o",
		is_enabled: true,
	});
});
