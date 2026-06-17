import assert from "node:assert/strict";
import test from "node:test";
import { ValidationError } from "../utils/errors";
import {
	AIProviderRegistryService,
	type AIProviderRegistrySnapshot,
} from "./ai-provider-registry.service";

const registryKey = "ai_provider_registry";
const activeKey = "ai_active_provider_id";

function createStore(initial: Record<string, string | null> = {}) {
	const values = new Map<string, string>();
	for (const [key, value] of Object.entries(initial)) {
		if (value !== null) values.set(key, value);
	}
	const writes: Array<{ key: string; value: string }> = [];
	const repo = {
		async get(key: string): Promise<string | null> {
			return values.get(key) ?? null;
		},
		async set(key: string, value: string): Promise<void> {
			values.set(key, value);
			writes.push({ key, value });
		},
	};
	return { repo, values, writes };
}

function decodeRegistry(value: string | null): AIProviderRegistrySnapshot[] {
	return value ? (JSON.parse(value) as AIProviderRegistrySnapshot[]) : [];
}

test("AI provider registry creates providers with redacted read models and active fallback", async () => {
	const store = createStore();
	const service = new AIProviderRegistryService(store.repo);

	const provider = await service.upsertProvider({
		name: "OpenRouter production",
		provider: "openai-compatible",
		base_url: "https://openrouter.ai/api/v1",
		api_key: "sk-live-secret",
		model: "openai/gpt-4o-mini",
		is_enabled: true,
	});

	assert.equal(provider.name, "OpenRouter production");
	assert.equal(provider.api_key_masked, "sk-liv…cret");
	assert.equal("api_key" in provider, false);

	const providers = await service.listProviders();
	assert.equal(providers.length, 1);
	assert.equal(providers[0]?.api_key_masked, "sk-liv…cret");
	assert.equal(providers[0]?.is_active, true);
	assert.equal(store.values.get(activeKey), provider.id);

	const raw = decodeRegistry(store.values.get(registryKey) ?? null);
	assert.equal(raw[0]?.api_key, "sk-live-secret");
});

test("AI provider registry updates without erasing existing secret when api key is omitted", async () => {
	const initial: AIProviderRegistrySnapshot[] = [
		{
			id: "provider-1",
			name: "Primary",
			provider: "openai",
			base_url: "https://api.openai.com/v1",
			api_key: "sk-existing-secret",
			model: "gpt-4o-mini",
			is_enabled: true,
			created_at: "2026-05-01T00:00:00.000Z",
			updated_at: "2026-05-01T00:00:00.000Z",
		},
	];
	const store = createStore({
		[registryKey]: JSON.stringify(initial),
		[activeKey]: "provider-1",
	});
	const service = new AIProviderRegistryService(store.repo);

	await service.upsertProvider({
		id: "provider-1",
		name: "Primary renamed",
		provider: "openai",
		base_url: "https://api.openai.com/v1",
		model: "gpt-4o",
		is_enabled: true,
	});

	const raw = decodeRegistry(store.values.get(registryKey) ?? null);
	assert.equal(raw[0]?.name, "Primary renamed");
	assert.equal(raw[0]?.api_key, "sk-existing-secret");
	assert.equal(raw[0]?.model, "gpt-4o");
});

test("AI provider registry activates, deletes, and validates provider state", async () => {
	const initial: AIProviderRegistrySnapshot[] = [
		{
			id: "enabled",
			name: "Enabled",
			provider: "openai",
			base_url: "https://api.openai.com/v1",
			api_key: "sk-enabled",
			model: "gpt-4o-mini",
			is_enabled: true,
			created_at: "2026-05-01T00:00:00.000Z",
			updated_at: "2026-05-01T00:00:00.000Z",
		},
		{
			id: "disabled",
			name: "Disabled",
			provider: "openai-compatible",
			base_url: "https://llm.example.com/v1",
			api_key: "sk-disabled",
			model: "model-x",
			is_enabled: false,
			created_at: "2026-05-01T00:00:00.000Z",
			updated_at: "2026-05-01T00:00:00.000Z",
		},
	];
	const store = createStore({ [registryKey]: JSON.stringify(initial) });
	const service = new AIProviderRegistryService(store.repo);

	await assert.rejects(
		() => service.activateProvider("disabled"),
		(error: unknown) =>
			error instanceof ValidationError && /đang bị tắt/.test(error.message),
	);

	const active = await service.activateProvider("enabled");
	assert.equal(active.id, "enabled");
	assert.equal(store.values.get(activeKey), "enabled");

	await service.deleteProvider("enabled");
	assert.equal(store.values.get(activeKey), "");
	assert.deepEqual(
		decodeRegistry(store.values.get(registryKey) ?? null).map((p) => p.id),
		["disabled"],
	);
});

test("AI provider registry rejects unsafe endpoints and invalid model settings", async () => {
	const store = createStore();
	const service = new AIProviderRegistryService(store.repo);

	await assert.rejects(
		() =>
			service.upsertProvider({
				name: "Local",
				provider: "openai-compatible",
				base_url: "http://localhost:11434/v1",
				api_key: "secret",
				model: "llama",
			}),
		(error: unknown) =>
			error instanceof ValidationError && /localhost/.test(error.message),
	);

	await assert.rejects(
		() =>
			service.upsertProvider({
				name: "Missing model",
				provider: "openai",
				base_url: "https://api.openai.com/v1",
				api_key: "secret",
				model: "",
			}),
		(error: unknown) =>
			error instanceof ValidationError && /model/.test(error.message),
	);
});

test("AI provider connection test uses max_completion_tokens for OpenAI GPT-5 models", async () => {
	const initial: AIProviderRegistrySnapshot[] = [
		{
			id: "openai-gpt5",
			name: "OpenAI GPT-5",
			provider: "openai",
			base_url: "https://api.openai.com/v1",
			api_key: "sk-live-secret",
			model: "gpt-5.4-mini",
			is_enabled: true,
			created_at: "2026-05-01T00:00:00.000Z",
			updated_at: "2026-05-01T00:00:00.000Z",
		},
	];
	const store = createStore({ [registryKey]: JSON.stringify(initial) });
	const service = new AIProviderRegistryService(store.repo);
	const originalFetch = globalThis.fetch;
	let requestBody: Record<string, unknown> = {};

	const fetchStub: typeof fetch = async (_input, init) => {
		requestBody = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
		return new Response("{}", { status: 200 });
	};
	globalThis.fetch = fetchStub;

	try {
		const result = await service.testConnection("openai-gpt5");

		assert.equal(result.ok, true);
		assert.equal(requestBody.max_completion_tokens, 5);
		assert.equal("max_tokens" in requestBody, false);
	} finally {
		globalThis.fetch = originalFetch;
	}
});
