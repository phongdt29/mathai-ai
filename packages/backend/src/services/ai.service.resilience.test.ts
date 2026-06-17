import assert from "node:assert/strict";
import { test } from "node:test";

import { AIService } from "./ai.service";
import { aiProviderRegistryService } from "./ai-provider-registry.service";

// Mock registry service to prevent Mongoose DB calls in unit tests
aiProviderRegistryService.getRuntimeConfig = async () => ({
	provider: "openai",
	baseUrl: "",
	apiKey: "",
	model: "gpt-4o-mini",
});
aiProviderRegistryService.getActiveProvider = async () => null;


type FakeCreateCall = {
	body: unknown;
	options: unknown;
};

function createCompletion(content: string) {
	return {
		choices: [{ message: { content } }],
		usage: { prompt_tokens: 11, completion_tokens: 3 },
	};
}

function createTransientError(message = "provider timeout") {
	return Object.assign(new Error(message), { status: 503 });
}

test("generateCompletion retries transient provider failures with bounded timeout options", async () => {
	const calls: FakeCreateCall[] = [];
	const client = {
		chat: {
			completions: {
				create: async (body: unknown, options: unknown) => {
					calls.push({ body, options });
					if (calls.length < 3) {
						throw createTransientError();
					}

					return createCompletion("Nội dung AI sau retry");
				},
			},
		},
	};
	const service = new AIService(client as never, { retryDelayMs: 0 });

	const result = await service.generateCompletion("system", "user", {
		maxRetries: 2,
		timeoutMs: 1234,
	});

	assert.equal(result.content, "Nội dung AI sau retry");
	assert.equal(calls.length, 3);
	assert.deepEqual(
		calls.map((call) => call.options),
		[
			{ timeout: 1234, maxRetries: 0 },
			{ timeout: 1234, maxRetries: 0 },
			{ timeout: 1234, maxRetries: 0 },
		],
	);
});

test("generateCompletion sends GPT-5 token limits with OpenAI-compatible parameters", async () => {
	const calls: FakeCreateCall[] = [];
	const originalGetRuntimeConfig = aiProviderRegistryService.getRuntimeConfig;
	aiProviderRegistryService.getRuntimeConfig = async () => ({
		provider: "openai",
		baseUrl: "",
		apiKey: "",
		model: "gpt-5.4",
	});
	const client = {
		chat: {
			completions: {
				create: async (body: unknown, options: unknown) => {
					calls.push({ body, options });
					return createCompletion("Nội dung GPT-5");
				},
			},
		},
	};
	const service = new AIService(client as never, { retryDelayMs: 0 });

	try {
		const result = await service.generateCompletion("system", "user", {
			maxTokens: 42,
		});

		assert.equal(result.content, "Nội dung GPT-5");
		assert.equal(calls.length, 1);
		assert.equal((calls[0]?.body as Record<string, unknown>).max_completion_tokens, 42);
		assert.equal("max_tokens" in ((calls[0]?.body as Record<string, unknown>) ?? {}), false);
		assert.equal("temperature" in ((calls[0]?.body as Record<string, unknown>) ?? {}), false);
	} finally {
		aiProviderRegistryService.getRuntimeConfig = originalGetRuntimeConfig;
	}
});

test("generateCompletion returns fallback content after retry exhaustion", async () => {
	const calls: FakeCreateCall[] = [];
	const client = {
		chat: {
			completions: {
				create: async (body: unknown, options: unknown) => {
					calls.push({ body, options });
					throw createTransientError("rate limit");
				},
			},
		},
	};
	const service = new AIService(client as never, { retryDelayMs: 0 });

	const result = await service.generateCompletion("system", "user", {
		maxRetries: 1,
		fallbackContent: "AI đang quá tải, vui lòng thử lại sau.",
	});

	assert.equal(result.content, "AI đang quá tải, vui lòng thử lại sau.");
	assert.deepEqual(result.tokensUsed, { input: 0, output: 0 });
	assert.equal(calls.length, 2);
});

test("generateJSON returns typed fallback data when provider retries are exhausted", async () => {
	const client = {
		chat: {
			completions: {
				create: async () => {
					throw createTransientError("temporary outage");
				},
			},
		},
	};
	const service = new AIService(client as never, { retryDelayMs: 0 });

	const result = await service.generateJSON<{ suggestions: string[] }>(
		"system",
		"user",
		{
			maxRetries: 1,
			fallbackData: { suggestions: [] },
		},
	);

	assert.deepEqual(result.data, { suggestions: [] });
	assert.deepEqual(result.tokensUsed, { input: 0, output: 0 });
});

test("generateCompletion falls back to default client when dynamic client fails", async () => {
	const dynamicClientCalls: FakeCreateCall[] = [];
	const defaultClientCalls: FakeCreateCall[] = [];

	const dynamicClient = {
		chat: {
			completions: {
				create: async (body: unknown, options: unknown) => {
					dynamicClientCalls.push({ body, options });
					throw createTransientError("dynamic client error");
				},
			},
		},
	};

	const defaultClient = {
		chat: {
			completions: {
				create: async (body: unknown, options: unknown) => {
					defaultClientCalls.push({ body, options });
					return createCompletion("Default response");
				},
			},
		},
	};

	const service = new AIService(defaultClient as never, { retryDelayMs: 0 });

	// Mock resolveClient to return dynamicClient and resolveModel to return a model
	(service as any).resolveClient = async () => dynamicClient;
	(service as any).resolveModel = async () => "dynamic-model";

	// Mock aiProviderRegistryService.getActiveProvider to return a dummy provider
	const { aiProviderRegistryService } = require("./ai-provider-registry.service");
	const originalGetActiveProvider = aiProviderRegistryService.getActiveProvider;
	aiProviderRegistryService.getActiveProvider = async () => ({
		id: "some-id",
		name: "DynamicProvider",
		provider: "openai-compatible",
		base_url: "http://dynamic-url",
		api_key: "dynamic-key",
		model: "dynamic-model",
		is_enabled: true,
	});

	try {
		const result = await service.generateCompletion("system", "user", { maxRetries: 0 });

		assert.equal(result.content, "Default response");
		assert.equal(dynamicClientCalls.length, 1);
		assert.equal(defaultClientCalls.length, 1);
	} finally {
		aiProviderRegistryService.getActiveProvider = originalGetActiveProvider;
	}
});
