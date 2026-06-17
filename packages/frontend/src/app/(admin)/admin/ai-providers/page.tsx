'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  listAIProviders,
  createAIProvider,
  updateAIProvider,
  deleteAIProvider,
  testAIProvider,
  type AIProviderRegistryItem,
  type UpsertAIProviderPayload,
  type AIProviderTestResult,
} from '@/lib/api';

type FormMode = 'closed' | 'create' | 'edit';

interface FormState {
  name: string;
  provider: 'openai' | 'openai-compatible';
  model: string;
  api_key: string;
  base_url: string;
  is_enabled: boolean;
}

const emptyForm: FormState = {
  name: '',
  provider: 'openai',
  model: '',
  api_key: '',
  base_url: '',
  is_enabled: true,
};

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'vừa xong';
  if (mins < 60) return `${mins} phút trước`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} giờ trước`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} ngày trước`;
  return new Date(iso).toLocaleDateString('vi-VN');
}

export default function AIProvidersPage() {
  const [providers, setProviders] = useState<AIProviderRegistryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [formMode, setFormMode] = useState<FormMode>('closed');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [formLoading, setFormLoading] = useState(false);

  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<Record<string, AIProviderTestResult | null>>({});

  const fetchProviders = useCallback(async () => {
    try {
      setLoading(true);
      const data = await listAIProviders();
      setProviders(data);
      setError(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Không thể tải dữ liệu');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProviders();
  }, [fetchProviders]);

  function openCreate() {
    setFormMode('create');
    setEditingId(null);
    setForm(emptyForm);
    setFormError(null);
  }

  function openEdit(provider: AIProviderRegistryItem) {
    setFormMode('edit');
    setEditingId(provider.id);
    setForm({
      name: provider.name,
      provider: provider.provider,
      model: provider.model,
      api_key: '',
      base_url: provider.base_url,
      is_enabled: provider.is_enabled,
    });
    setFormError(null);
  }

  function closeForm() {
    setFormMode('closed');
    setEditingId(null);
    setForm(emptyForm);
    setFormError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormLoading(true);
    setFormError(null);

    const payload: UpsertAIProviderPayload = {
      name: form.name,
      provider: form.provider,
      base_url: form.base_url,
      model: form.model,
      is_enabled: form.is_enabled,
    };
    if (form.api_key.trim()) {
      payload.api_key = form.api_key;
    }

    try {
      if (formMode === 'create') {
        await createAIProvider(payload);
      } else if (formMode === 'edit' && editingId) {
        await updateAIProvider(editingId, payload);
      }
      closeForm();
      await fetchProviders();
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Có lỗi xảy ra');
    } finally {
      setFormLoading(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Bạn có chắc muốn xóa AI provider này?')) return;
    try {
      await deleteAIProvider(id);
      await fetchProviders();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Không thể xóa');
    }
  }

  async function handleTest(id: string) {
    setTestingId(id);
    setTestResult((prev) => ({ ...prev, [id]: null }));
    try {
      const result = await testAIProvider(id);
      setTestResult((prev) => ({ ...prev, [id]: result }));
    } catch (err: unknown) {
      setTestResult((prev) => ({
        ...prev,
        [id]: { ok: false, latency_ms: 0, error: err instanceof Error ? err.message : 'Lỗi' },
      }));
    } finally {
      setTestingId(null);
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-gray-900">Nhà cung cấp AI ⚡</h1>
        <div className="flex items-center justify-center py-20 text-gray-400">Đang tải...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-gray-900">Nhà cung cấp AI ⚡</h1>
        <div className="rounded-2xl bg-red-50 p-6 text-center text-red-600">{error}</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Nhà cung cấp AI ⚡</h1>
        <button
          onClick={openCreate}
          className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 transition"
        >
          + Thêm Provider
        </button>
      </div>

      {/* Provider Form */}
      {formMode !== 'closed' && (
        <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            {formMode === 'create' ? 'Tạo AI Provider' : 'Chỉnh sửa AI Provider'}
          </h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tên</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
                  placeholder="OpenAI GPT-4o"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Provider</label>
                <select
                  value={form.provider}
                  onChange={(e) => setForm({ ...form, provider: e.target.value as FormState['provider'] })}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
                >
                  <option value="openai">OpenAI</option>
                  <option value="openai-compatible">Tương thích OpenAI</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Model</label>
                <input
                  type="text"
                  value={form.model}
                  onChange={(e) => setForm({ ...form, model: e.target.value })}
                  required
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
                  placeholder="gpt-4o"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Base URL</label>
                <input
                  type="url"
                  value={form.base_url}
                  onChange={(e) => setForm({ ...form, base_url: e.target.value })}
                  required
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
                  placeholder="https://api.openai.com/v1"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  API Key {formMode === 'edit' && <span className="text-gray-400">(để trống nếu không đổi)</span>}
                </label>
                <input
                  type="password"
                  value={form.api_key}
                  onChange={(e) => setForm({ ...form, api_key: e.target.value })}
                  required={formMode === 'create'}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
                  placeholder="sk-..."
                />
              </div>
              <div className="flex items-center gap-2 pt-6">
                <input
                  type="checkbox"
                  id="is_enabled"
                  checked={form.is_enabled}
                  onChange={(e) => setForm({ ...form, is_enabled: e.target.checked })}
                  className="h-4 w-4 rounded border-gray-300 text-slate-600 focus:ring-slate-500"
                />
                <label htmlFor="is_enabled" className="text-sm text-gray-700">Kích hoạt</label>
              </div>
            </div>

            {formError && (
              <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600">{formError}</div>
            )}

            <div className="flex gap-3">
              <button
                type="submit"
                disabled={formLoading}
                className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 transition disabled:opacity-50"
              >
                {formLoading ? 'Đang lưu...' : formMode === 'create' ? 'Tạo' : 'Cập nhật'}
              </button>
              <button
                type="button"
                onClick={closeForm}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition"
              >
                Hủy
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Providers Table */}
      <div className="rounded-2xl bg-white shadow-sm ring-1 ring-gray-100 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              <th className="px-5 py-3">ID</th>
              <th className="px-5 py-3">Tên</th>
              <th className="px-5 py-3">Provider</th>
              <th className="px-5 py-3">Model</th>
              <th className="px-5 py-3">Base URL</th>
              <th className="px-5 py-3">Trạng thái</th>
              <th className="px-5 py-3">Cập nhật</th>
              <th className="px-5 py-3">Hành động</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {providers.map((p) => (
              <tr key={p.id} className="hover:bg-gray-50">
                <td className="px-5 py-4 font-mono text-xs">{p.id.slice(0, 8)}</td>
                <td className="px-5 py-4 font-medium text-gray-900">{p.name}</td>
                <td className="px-5 py-4 text-gray-500">{p.provider}</td>
                <td className="px-5 py-4 text-gray-500">{p.model}</td>
                <td className="px-5 py-4 text-gray-400 text-xs max-w-[200px] truncate" title={p.base_url}>
                  {p.base_url}
                </td>
                <td className="px-5 py-4">
                  <div className="flex items-center gap-2">
                    {p.is_active ? (
                      <span className="inline-flex items-center rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">
                        Hoạt động
                      </span>
                    ) : p.is_enabled ? (
                      <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
                        Đã kích hoạt
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">
                        Đã vô hiệu hóa
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-5 py-4 text-gray-400 text-xs">{formatDate(p.updated_at)}</td>
                <td className="px-5 py-4">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleTest(p.id)}
                      disabled={testingId === p.id}
                      className="rounded-md bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100 transition disabled:opacity-50"
                    >
                      {testingId === p.id ? '...' : 'Kiểm tra'}
                    </button>
                    <button
                      onClick={() => openEdit(p)}
                      className="rounded-md bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100 transition"
                    >
                      Sửa
                    </button>
                    <button
                      onClick={() => handleDelete(p.id)}
                      className="rounded-md bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-100 transition"
                    >
                      Xóa
                    </button>
                  </div>
                  {/* Test result display */}
                  {testResult[p.id] && (
                    <div className={`mt-2 rounded-md px-2.5 py-1.5 text-xs ${
                      testResult[p.id]!.ok
                        ? 'bg-green-50 text-green-700'
                        : 'bg-red-50 text-red-600'
                    }`}>
                      {testResult[p.id]!.ok
                        ? `✓ OK — ${testResult[p.id]!.latency_ms}ms`
                        : `✗ Lỗi — ${testResult[p.id]!.error ?? 'Unknown'}`}
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {providers.length === 0 && (
              <tr>
                <td colSpan={8} className="px-5 py-10 text-center text-gray-400">
                  Chưa có AI provider nào. Nhấn &quot;+ Thêm Provider&quot; để bắt đầu.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
