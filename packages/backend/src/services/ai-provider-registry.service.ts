import crypto from "crypto";

import { config } from "../config";
import { systemSettingRepository } from "../models/setting.model";
import { createTokenLimitParam } from "../utils/openai-chat-compat";
import { NotFoundError, ValidationError } from "../utils/errors";

export type AIProviderKind = "openai" | "openai-compatible";

export interface AIProviderRegistrySnapshot {
	id: string;
	name: string;
	provider: AIProviderKind;
	base_url: string;
	api_key: string;
	model: string;
	is_enabled: boolean;
	created_at: string;
	updated_at: string;
}

export interface AIProviderRegistryView {
	id: string;
	name: string;
	provider: AIProviderKind;
	base_url: string;
	model: string;
	is_enabled: boolean;
	is_active: boolean;
	api_key_masked: string | null;
	created_at: string;
	updated_at: string;
}

export interface UpsertAIProviderInput {
	id?: string;
	name: string;
	provider: AIProviderKind;
	base_url: string;
	api_key?: string;
	model: string;
	is_enabled?: boolean;
}

export interface AIProviderRegistryStore {
	get(key: string): Promise<string | null>;
	set(key: string, value: string): Promise<void>;
}

const REGISTRY_KEY = "ai_provider_registry";
const ACTIVE_PROVIDER_KEY = "ai_active_provider_id";
const MAX_PROVIDERS = 20;

export class AIProviderRegistryService {
	constructor(
		private readonly store: AIProviderRegistryStore = systemSettingRepository,
	) {}

	public async listProviders(): Promise<AIProviderRegistryView[]> {
		const [providers, activeProviderId] = await Promise.all([
			this.readRegistry(),
			this.getActiveProviderId(),
		]);
		return providers.map((provider) => this.toView(provider, activeProviderId));
	}

	public async getActiveProvider(): Promise<AIProviderRegistrySnapshot | null> {
		const [providers, activeProviderId] = await Promise.all([
			this.readRegistry(),
			this.getActiveProviderId(),
		]);
		if (activeProviderId) {
			const active = providers.find(
				(provider) => provider.id === activeProviderId && provider.is_enabled,
			);
			if (active) return active;
		}
		return providers.find((provider) => provider.is_enabled) ?? null;
	}

	public async upsertProvider(
		input: UpsertAIProviderInput,
	): Promise<AIProviderRegistryView> {
		const providers = await this.readRegistry();
		const existingIndex = input.id
			? providers.findIndex((provider) => provider.id === input.id)
			: -1;
		const now = new Date().toISOString();
		const existing = existingIndex >= 0 ? providers[existingIndex] : null;

		if (!existing && providers.length >= MAX_PROVIDERS) {
			throw new ValidationError(`Chỉ được cấu hình tối đa ${MAX_PROVIDERS} AI provider`);
		}

		const sanitized = this.sanitizeInput(input, existing);
		const provider: AIProviderRegistrySnapshot = {
			id: existing?.id ?? crypto.randomUUID(),
			name: sanitized.name,
			provider: sanitized.provider,
			base_url: sanitized.base_url,
			api_key: sanitized.api_key,
			model: sanitized.model,
			is_enabled: sanitized.is_enabled,
			created_at: existing?.created_at ?? now,
			updated_at: now,
		};

		if (existingIndex >= 0) {
			providers[existingIndex] = provider;
		} else {
			providers.push(provider);
		}

		await this.writeRegistry(providers);
		const activeProviderId = await this.ensureActiveProvider(providers, provider);
		return this.toView(provider, activeProviderId);
	}

	public async activateProvider(id: string): Promise<AIProviderRegistryView> {
		const providers = await this.readRegistry();
		const provider = providers.find((candidate) => candidate.id === id);
		if (!provider) {
			throw new NotFoundError("Không tìm thấy AI provider");
		}
		if (!provider.is_enabled) {
			throw new ValidationError("AI provider đang bị tắt, không thể kích hoạt");
		}
		await this.store.set(ACTIVE_PROVIDER_KEY, provider.id);
		return this.toView(provider, provider.id);
	}

	public async deleteProvider(id: string): Promise<void> {
		const providers = await this.readRegistry();
		const remaining = providers.filter((provider) => provider.id !== id);
		if (remaining.length === providers.length) {
			throw new NotFoundError("Không tìm thấy AI provider");
		}
		await this.writeRegistry(remaining);
		const activeProviderId = await this.getActiveProviderId();
		if (activeProviderId === id) {
			const nextActive = remaining.find((provider) => provider.is_enabled);
			await this.store.set(ACTIVE_PROVIDER_KEY, nextActive?.id ?? "");
		}
	}

	public async testConnection(
		id: string,
	): Promise<{ ok: boolean; latency_ms: number; error?: string }> {
		const providers = await this.readRegistry();
		const provider = providers.find((p) => p.id === id);
		if (!provider) {
			throw new NotFoundError("Không tìm thấy AI provider");
		}

		const start = Date.now();
		try {
			const controller = new AbortController();
			const timeout = setTimeout(() => controller.abort(), 15000);

			const response = await fetch(`${provider.base_url}/chat/completions`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${provider.api_key}`,
				},
				body: JSON.stringify({
					model: provider.model,
					messages: [{ role: "user", content: "Hello" }],
					...createTokenLimitParam(provider.provider, provider.model, 5),
				}),
				signal: controller.signal,
			});

			clearTimeout(timeout);
			const latency_ms = Date.now() - start;

			if (!response.ok) {
				const errorBody = await response.text().catch(() => "");
				return {
					ok: false,
					latency_ms,
					error: `HTTP ${response.status}: ${errorBody.slice(0, 200)}`,
				};
			}

			return { ok: true, latency_ms };
		} catch (err: unknown) {
			const latency_ms = Date.now() - start;
			const message =
				err instanceof Error ? err.message : "Lỗi không xác định";
			return { ok: false, latency_ms, error: message };
		}
	}

	public async getRuntimeConfig(): Promise<{
		provider: AIProviderKind;
		baseUrl: string;
		apiKey: string;
		model: string;
	}> {
		const active = await this.getActiveProvider();
		if (active) {
			return {
				provider: active.provider,
				baseUrl: active.base_url,
				apiKey: active.api_key,
				model: active.model,
			};
		}
		return {
			provider: "openai",
			baseUrl: config.openai.baseUrl,
			apiKey: config.openai.apiKey,
			model: config.openai.model,
		};
	}

	private async ensureActiveProvider(
		providers: AIProviderRegistrySnapshot[],
		changedProvider: AIProviderRegistrySnapshot,
	): Promise<string | null> {
		const activeProviderId = await this.getActiveProviderId();
		const activeStillValid = providers.some(
			(provider) => provider.id === activeProviderId && provider.is_enabled,
		);
		if (activeStillValid) {
			return activeProviderId;
		}
		if (changedProvider.is_enabled) {
			await this.store.set(ACTIVE_PROVIDER_KEY, changedProvider.id);
			return changedProvider.id;
		}
		const nextActive = providers.find((provider) => provider.is_enabled) ?? null;
		await this.store.set(ACTIVE_PROVIDER_KEY, nextActive?.id ?? "");
		return nextActive?.id ?? null;
	}

	private sanitizeInput(
		input: UpsertAIProviderInput,
		existing: AIProviderRegistrySnapshot | null,
	): Omit<AIProviderRegistrySnapshot, "id" | "created_at" | "updated_at"> {
		const name = input.name.trim();
		const provider = input.provider;
		const baseUrl = input.base_url.trim().replace(/\/+$/, "");
		const apiKey = input.api_key !== undefined ? input.api_key.trim() : existing?.api_key ?? "";
		const model = input.model.trim();

		if (!name) throw new ValidationError("Tên AI provider là bắt buộc");
		if (provider !== "openai" && provider !== "openai-compatible") {
			throw new ValidationError("AI provider không được hỗ trợ");
		}
		if (!this.isValidHttpUrl(baseUrl)) {
			throw new ValidationError("AI provider endpoint phải là URL HTTP(S) hợp lệ");
		}
		if (this.usesLocalhost(baseUrl)) {
			throw new ValidationError("AI provider endpoint không được dùng localhost trong cấu hình sản xuất");
		}
		if (!apiKey) throw new ValidationError("AI provider API key là bắt buộc");
		if (!model) throw new ValidationError("AI provider model là bắt buộc");

		return {
			name,
			provider,
			base_url: baseUrl,
			api_key: apiKey,
			model,
			is_enabled: input.is_enabled ?? existing?.is_enabled ?? true,
		};
	}

	private async readRegistry(): Promise<AIProviderRegistrySnapshot[]> {
		const raw = await this.store.get(REGISTRY_KEY);
		if (!raw) return [];
		try {
			const parsed = JSON.parse(raw) as AIProviderRegistrySnapshot[];
			if (!Array.isArray(parsed)) return [];
			return parsed.filter((provider) => Boolean(provider.id));
		} catch {
			return [];
		}
	}

	private async writeRegistry(providers: AIProviderRegistrySnapshot[]): Promise<void> {
		await this.store.set(REGISTRY_KEY, JSON.stringify(providers));
	}

	private async getActiveProviderId(): Promise<string | null> {
		const value = await this.store.get(ACTIVE_PROVIDER_KEY);
		return value && value.trim().length > 0 ? value : null;
	}

	private toView(
		provider: AIProviderRegistrySnapshot,
		activeProviderId: string | null,
	): AIProviderRegistryView {
		return {
			id: provider.id,
			name: provider.name,
			provider: provider.provider,
			base_url: provider.base_url,
			model: provider.model,
			is_enabled: provider.is_enabled,
			is_active: provider.id === activeProviderId,
			api_key_masked: maskSecret(provider.api_key),
			created_at: provider.created_at,
			updated_at: provider.updated_at,
		};
	}

	private isValidHttpUrl(value: string): boolean {
		try {
			const url = new URL(value);
			return url.protocol === "http:" || url.protocol === "https:";
		} catch {
			return false;
		}
	}

	private usesLocalhost(value: string): boolean {
		try {
			const hostname = new URL(value).hostname.toLowerCase();
			return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
		} catch {
			return false;
		}
	}
}

export function maskSecret(value: string | null | undefined): string | null {
	if (!value) return null;
	if (value.length <= 8) return "••••";
	return `${value.slice(0, 6)}…${value.slice(-4)}`;
}

export const aiProviderRegistryService = new AIProviderRegistryService();

export default aiProviderRegistryService;
