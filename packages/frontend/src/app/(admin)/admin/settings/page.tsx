"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import {
	type AIProviderKind,
	type AIProviderRegistryItem,
	activateAIProvider,
	createAIProvider,
	deleteAIProvider,
	listAIProviders,
	type UpsertAIProviderPayload,
	updateAIProvider,
} from "@/lib/api";
import { AI_MODEL_DISCOVERY_ROUTE } from "@/lib/api-routes";

interface ModelInfo {
	id: string;
	owned_by?: string;
}

interface ProviderFormState {
	id: string;
	name: string;
	provider: AIProviderKind;
	base_url: string;
	api_key: string;
	model: string;
	is_enabled: boolean;
}

const emptyProviderForm: ProviderFormState = {
	id: "",
	name: "",
	provider: "openai-compatible",
	base_url: "",
	api_key: "",
	model: "",
	is_enabled: true,
};

function providerLabel(provider: AIProviderKind): string {
	return provider === "openai" ? "OpenAI" : "Tương thích OpenAI";
}

export default function AdminSettingsPage() {
	const { user, loading } = useAuth(["admin", "staff"]);
	const [defaultModel, setDefaultModel] = useState("gpt-4o-mini");
	const [providerForm, setProviderForm] =
		useState<ProviderFormState>(emptyProviderForm);
	const [providers, setProviders] = useState<AIProviderRegistryItem[]>([]);
	const [loadingProviders, setLoadingProviders] = useState(true);
	const [providerError, setProviderError] = useState("");
	const [models, setModels] = useState<ModelInfo[]>([]);
	const [selectedModel, setSelectedModel] = useState("");
	const [fetchingModels, setFetchingModels] = useState(false);
	const [fetchError, setFetchError] = useState("");
	const [saveAiMsg, setSaveAiMsg] = useState("");

	const activeProvider = useMemo(
		() => providers.find((provider) => provider.is_active) ?? null,
		[providers],
	);

	useEffect(() => {
		if (loading || user?.role !== "admin") return;

		queueMicrotask(() => {
			void refreshProviders();
		});
	}, [loading, user?.role]);

	async function refreshProviders() {
		setLoadingProviders(true);
		setProviderError("");
		try {
			const list = await listAIProviders();
			setProviders(list);
			const preferred = list.find((provider) => provider.is_active) ?? list[0];
			if (preferred) {
				setDefaultModel(preferred.model);
				setSelectedModel(preferred.model);
			}
		} catch (err) {
			setProviderError(
				err instanceof Error
					? err.message
					: "Không thể tải danh sách AI provider",
			);
		} finally {
			setLoadingProviders(false);
		}
	}

	function editProvider(provider: AIProviderRegistryItem) {
		setProviderForm({
			id: provider.id,
			name: provider.name,
			provider: provider.provider,
			base_url: provider.base_url,
			api_key: "",
			model: provider.model,
			is_enabled: provider.is_enabled,
		});
		setSelectedModel(provider.model);
		setModels([]);
		setFetchError("");
		setSaveAiMsg("");
	}

	async function saveAi() {
		const model = providerForm.model.trim() || selectedModel.trim();
		if (!providerForm.name.trim()) {
			setSaveAiMsg("Vui lòng nhập tên provider");
			return;
		}
		if (!providerForm.base_url.trim()) {
			setSaveAiMsg("Vui lòng nhập endpoint provider");
			return;
		}
		if (!model) {
			setSaveAiMsg("Vui lòng nhập model");
			return;
		}
		if (!providerForm.id && !providerForm.api_key.trim()) {
			setSaveAiMsg("API key là bắt buộc khi tạo provider mới");
			return;
		}

		const payload: UpsertAIProviderPayload = {
			name: providerForm.name.trim(),
			provider: providerForm.provider,
			base_url: providerForm.base_url.trim(),
			model,
			is_enabled: providerForm.is_enabled,
		};
		if (providerForm.api_key.trim()) {
			payload.api_key = providerForm.api_key.trim();
		}

		try {
			const saved = providerForm.id
				? await updateAIProvider(providerForm.id, payload)
				: await createAIProvider(payload);
			setDefaultModel(saved.model);
			setSelectedModel(saved.model);
			setProviderForm(emptyProviderForm);
			setSaveAiMsg(
				providerForm.id ? "Đã cập nhật AI provider!" : "Đã tạo AI provider!",
			);
			await refreshProviders();
			setTimeout(() => setSaveAiMsg(""), 2500);
		} catch (err) {
			setSaveAiMsg(
				err instanceof Error ? err.message : "Không thể lưu AI provider",
			);
		}
	}

	async function activateProvider(providerId: string) {
		setProviderError("");
		try {
			const provider = await activateAIProvider(providerId);
			setDefaultModel(provider.model);
			setSelectedModel(provider.model);
			await refreshProviders();
		} catch (err) {
			setProviderError(
				err instanceof Error ? err.message : "Không thể kích hoạt provider",
			);
		}
	}

	async function removeProvider(providerId: string) {
		if (
			!window.confirm(
				"Xóa AI provider này? API key đã lưu sẽ bị xóa khỏi cấu hình.",
			)
		) {
			return;
		}
		setProviderError("");
		try {
			await deleteAIProvider(providerId);
			if (providerForm.id === providerId) setProviderForm(emptyProviderForm);
			await refreshProviders();
		} catch (err) {
			setProviderError(
				err instanceof Error ? err.message : "Không thể xóa provider",
			);
		}
	}

	async function fetchModels() {
		if (!providerForm.base_url.trim()) {
			setFetchError("Vui lòng nhập endpoint trước");
			return;
		}

		setFetchingModels(true);
		setFetchError("");
		setModels([]);

		try {
			const base = providerForm.base_url.trim().replace(/\/+$/, "");
			const res = await fetch(AI_MODEL_DISCOVERY_ROUTE, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					endpoint: base,
					apiKey: providerForm.api_key.trim(),
				}),
			});

			const json = await res.json();
			if (!res.ok) {
				throw new Error(json.error || `HTTP ${res.status}`);
			}
			const list: ModelInfo[] = (json.data ?? json).map(
				(m: { id: string; owned_by?: string }) => ({
					id: m.id,
					owned_by: m.owned_by,
				}),
			);

			setModels(list);
			if (list.length > 0) {
				setSelectedModel(list[0].id);
				setProviderForm((current) => ({ ...current, model: list[0].id }));
			}
		} catch (err) {
			setFetchError(
				err instanceof Error ? err.message : "Không thể kết nối đến endpoint",
			);
		} finally {
			setFetchingModels(false);
		}
	}

	if (loading) {
		return (
			<div className="rounded-2xl bg-white p-6 text-sm text-gray-600 shadow-sm ring-1 ring-gray-100">
				Đang tải...
			</div>
		);
	}

	if (user?.role === "staff") {
		return (
			<div className="max-w-2xl rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
				<h1 className="text-xl font-bold text-gray-900">
					Không có quyền truy cập cài đặt hệ thống
				</h1>
				<p className="mt-2 text-sm text-gray-600">
					Tài khoản staff chỉ được truy cập các màn hình vận hành được phân
					quyền. Vui lòng dùng tài khoản admin để quản lý Danh sách nhà cung cấp AI.
				</p>
			</div>
		);
	}

	return (
		<div className="max-w-4xl space-y-6">
			<h1 className="text-2xl font-bold text-gray-900">Cài đặt hệ thống</h1>

			<div className="rounded-2xl bg-amber-50 p-5 text-sm text-amber-900 ring-1 ring-amber-100">
				Cấu hình production được lưu và kiểm soát ở backend. Trang này chỉ quản
				lý AI Provider Registry qua API admin.
			</div>

			<div className="space-y-5 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
				<div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
					<div>
						<h2 className="text-lg font-bold text-gray-900">
							Danh sách nhà cung cấp AI
						</h2>
						<p className="mt-1 text-sm text-gray-500">
							Quản lý nhà cung cấp OpenAI hoặc tương thích OpenAI. API key được lưu ở
							backend và chỉ hiển thị dạng rút gọn.
						</p>
					</div>
					<button
						onClick={refreshProviders}
						type="button"
						className="rounded-xl border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
					>
						Làm mới
					</button>
				</div>

				{providerError && (
					<p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
						{providerError}
					</p>
				)}
				{activeProvider && (
					<p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
						Provider đang hoạt động: <strong>{activeProvider.name}</strong> ·{" "}
						{activeProvider.model}
					</p>
				)}

				<div className="grid gap-4 md:grid-cols-2">
					<div>
						<label className="mb-2 block text-sm font-medium text-gray-700">
							Tên provider
						</label>
						<input
							value={providerForm.name}
							onChange={(e) =>
								setProviderForm((current) => ({
									...current,
									name: e.target.value,
								}))
							}
							placeholder="OpenRouter production"
							className="w-full rounded-xl border border-gray-300 px-4 py-3 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
						/>
					</div>
					<div>
						<label className="mb-2 block text-sm font-medium text-gray-700">
							Loại provider
						</label>
						<select
							value={providerForm.provider}
							onChange={(e) =>
								setProviderForm((current) => ({
									...current,
									provider: e.target.value as AIProviderKind,
								}))
							}
							className="w-full rounded-xl border border-gray-300 px-4 py-3 outline-none transition focus:border-indigo-500"
						>
							<option value="openai">OpenAI</option>
							<option value="openai-compatible">Tương thích OpenAI</option>
						</select>
					</div>
				</div>
				<label className="inline-flex items-center gap-2 text-sm font-medium text-gray-700">
					<input
						type="checkbox"
						checked={providerForm.is_enabled}
						onChange={(e) =>
							setProviderForm((current) => ({
								...current,
								is_enabled: e.target.checked,
							}))
						}
					/>
					Provider đang bật
				</label>
				<div>
					<label className="mb-2 block text-sm font-medium text-gray-700">
						Model mặc định
					</label>
					<input
						value={defaultModel}
						readOnly
						className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-gray-600 outline-none"
					/>
				</div>
				<div>
					<label className="mb-2 block text-sm font-medium text-gray-700">
						Endpoint tùy chỉnh (tương thích OpenAI)
					</label>
					<input
						type="url"
						value={providerForm.base_url}
						onChange={(e) =>
							setProviderForm((current) => ({
								...current,
								base_url: e.target.value,
							}))
						}
						placeholder="https://api.openai.com/v1"
						className="w-full rounded-xl border border-gray-300 px-4 py-3 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
					/>
					<p className="mt-1.5 text-xs text-gray-500">
						Hỗ trợ API tương thích OpenAI như OpenRouter, Together, LM Studio,
						Ollama có endpoint HTTP(S).
					</p>
				</div>
				<div>
					<label className="mb-2 block text-sm font-medium text-gray-700">
						Khóa API
					</label>
					<input
						type="password"
						value={providerForm.api_key}
						onChange={(e) =>
							setProviderForm((current) => ({
								...current,
								api_key: e.target.value,
							}))
						}
						placeholder={
							providerForm.id ? "Để trống để giữ key hiện tại" : "sk-..."
						}
						className="w-full rounded-xl border border-gray-300 px-4 py-3 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
					/>
				</div>

				<div>
					<label className="mb-2 block text-sm font-medium text-gray-700">
						Model từ Endpoint
					</label>
					<div className="flex flex-col gap-2 sm:flex-row">
						<button
							type="button"
							onClick={fetchModels}
							disabled={fetchingModels}
							className="shrink-0 rounded-xl border border-indigo-600 px-4 py-3 text-sm font-semibold text-indigo-600 transition hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-50"
						>
							{fetchingModels ? "Đang tải..." : "Lấy danh sách model"}
						</button>
						{models.length > 0 && (
							<select
								value={selectedModel}
								onChange={(e) => {
									setSelectedModel(e.target.value);
									setProviderForm((current) => ({
										...current,
										model: e.target.value,
									}));
								}}
								className="w-full rounded-xl border border-gray-300 px-4 py-3 outline-none transition focus:border-indigo-500"
							>
								{models.map((model) => (
									<option key={model.id} value={model.id}>
										{model.id}
										{model.owned_by ? ` (${model.owned_by})` : ""}
									</option>
								))}
							</select>
						)}
					</div>
					{fetchError && (
						<p className="mt-2 text-xs text-red-600">{fetchError}</p>
					)}
					{models.length > 0 && (
						<p className="mt-1.5 text-xs text-gray-500">
							Tìm thấy {models.length} model. Chọn model để sử dụng.
						</p>
					)}
				</div>

				<div>
					<label className="mb-2 block text-sm font-medium text-gray-700">
						ID Model tùy chỉnh
					</label>
					<input
						type="text"
						value={providerForm.model || selectedModel}
						onChange={(e) => {
							setSelectedModel(e.target.value);
							setProviderForm((current) => ({
								...current,
								model: e.target.value,
							}));
						}}
						placeholder="gpt-4o, deepseek-chat, llama-3.1-70b..."
						className="w-full rounded-xl border border-gray-300 px-4 py-3 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
					/>
				</div>
				<div className="flex flex-wrap gap-3">
					<button
						onClick={saveAi}
						className="rounded-xl bg-indigo-600 px-6 py-3 font-semibold text-white transition hover:bg-indigo-700"
					>
						{providerForm.id ? "Cập nhật AI provider" : "Lưu AI provider"}
					</button>
					{providerForm.id && (
						<button
							type="button"
							onClick={() => setProviderForm(emptyProviderForm)}
							className="rounded-xl border border-gray-300 px-6 py-3 font-semibold text-gray-700 transition hover:bg-gray-50"
						>
							Hủy chỉnh sửa
						</button>
					)}
				</div>
				{saveAiMsg && (
					<p className="text-sm font-medium text-green-600">{saveAiMsg}</p>
				)}

				<div className="border-t border-gray-100 pt-5">
					<h3 className="text-sm font-bold uppercase tracking-wide text-gray-500">
						Provider đã cấu hình
					</h3>
					{loadingProviders ? (
						<p className="mt-3 text-sm text-gray-500">Đang tải provider...</p>
					) : providers.length === 0 ? (
						<p className="mt-3 rounded-xl bg-gray-50 px-4 py-3 text-sm text-gray-600">
							Chưa có AI provider. Tạo provider đầu tiên để dùng cho chat và các
							luồng AI production.
						</p>
					) : (
						<div className="mt-3 space-y-3">
							{providers.map((provider) => (
								<div
									key={provider.id}
									className="rounded-2xl border border-gray-200 p-4"
								>
									<div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
										<div>
											<div className="flex flex-wrap items-center gap-2">
												<h4 className="font-semibold text-gray-900">
													{provider.name}
												</h4>
												{provider.is_active && (
													<span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">
														Hoạt động
													</span>
												)}
												{!provider.is_enabled && (
													<span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-600">
														Đã tắt
													</span>
												)}
											</div>
											<p className="mt-1 text-sm text-gray-600">
												{providerLabel(provider.provider)} · {provider.model}
											</p>
											<p className="mt-1 break-all text-xs text-gray-500">
												{provider.base_url}
											</p>
											<p className="mt-1 text-xs text-gray-500">
												Key: {provider.api_key_masked ?? "ẩn"}
											</p>
										</div>
										<div className="flex flex-wrap gap-2">
											<button
												type="button"
												onClick={() => editProvider(provider)}
												className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
											>
												Sửa
											</button>
											<button
												type="button"
												disabled={provider.is_active || !provider.is_enabled}
												onClick={() => activateProvider(provider.id)}
												className="rounded-lg border border-emerald-600 px-3 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-50"
											>
												Kích hoạt
											</button>
											<button
												type="button"
												onClick={() => removeProvider(provider.id)}
												className="rounded-lg border border-red-200 px-3 py-2 text-sm font-semibold text-red-600 hover:bg-red-50"
											>
												Xóa
											</button>
										</div>
									</div>
								</div>
							))}
						</div>
					)}
				</div>
			</div>
		</div>
	);
}
