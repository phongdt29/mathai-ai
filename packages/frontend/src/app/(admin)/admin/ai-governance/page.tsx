'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiClient } from '@/lib/api';

interface CountBucket {
  key: string;
  count: number;
}

interface ProviderModelBucket {
  provider: string;
  model: string;
  count: number;
  tokensInput: number;
  tokensOutput: number;
}

interface AIGovernanceSummary {
  logs: {
    total: number;
    byPurpose: CountBucket[];
    byStatus: CountBucket[];
    bySafetyStatus: CountBucket[];
  };
  approvals: {
    pending: number;
    requiresApproval: number;
    byStatus: CountBucket[];
  };
  safety: {
    blocked: number;
    flagged: number;
    events: number;
  };
  providers: ProviderModelBucket[];
  generatedAt: string;
}

function formatNumber(n: number): string {
  return n.toLocaleString('vi-VN');
}

function estimateCost(tokensInput: number, tokensOutput: number): string {
  // Rough estimate: $0.01/1K input tokens, $0.03/1K output tokens (GPT-4 class)
  const cost = (tokensInput / 1000) * 0.01 + (tokensOutput / 1000) * 0.03;
  if (cost < 0.01) return '< $0.01';
  return `~$${cost.toFixed(2)}`;
}

export default function AIGovernancePage() {
  const [summary, setSummary] = useState<AIGovernanceSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      try {
        const res = await apiClient<{ success: boolean; data: AIGovernanceSummary }>(
          '/admin/ai-governance/summary'
        );
        setSummary(res.data);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Không thể tải dữ liệu');
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-gray-900">Quản trị AI 🛡️</h1>
        <div className="flex items-center justify-center py-20 text-gray-400">Đang tải...</div>
      </div>
    );
  }

  if (error || !summary) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-gray-900">Quản trị AI 🛡️</h1>
        <div className="rounded-2xl bg-red-50 p-6 text-center text-red-600">
          {error ?? 'Đã xảy ra lỗi'}
        </div>
      </div>
    );
  }

  const totalTokensInput = summary.providers.reduce((sum, p) => sum + p.tokensInput, 0);
  const totalTokensOutput = summary.providers.reduce((sum, p) => sum + p.tokensOutput, 0);
  const totalTokens = totalTokensInput + totalTokensOutput;

  const usageStats = [
    { label: 'Tổng requests', value: formatNumber(summary.logs.total), emoji: '📊' },
    { label: 'Tổng tokens', value: formatNumber(totalTokens), emoji: '🔤' },
    { label: 'Chi phí ước tính', value: estimateCost(totalTokensInput, totalTokensOutput), emoji: '💰' },
    { label: 'Nhà cung cấp hoạt động', value: String(summary.providers.length), emoji: '🤖' },
  ];

  const safetyStats = [
    { label: 'Sự kiện an toàn', value: formatNumber(summary.safety.events), color: 'text-orange-600' },
    { label: 'Bị chặn', value: formatNumber(summary.safety.blocked), color: 'text-red-600' },
    { label: 'Bị đánh dấu', value: formatNumber(summary.safety.flagged), color: 'text-yellow-600' },
    { label: 'Chờ duyệt', value: formatNumber(summary.approvals.pending), color: 'text-blue-600' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Quản trị AI 🛡️</h1>
        <div className="flex gap-3">
          <Link
            href="/admin/ai-logs"
            className="rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200 transition"
          >
            📋 Nhật ký AI
          </Link>
          <Link
            href="/admin/ai-providers"
            className="rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200 transition"
          >
            🔌 Nhà cung cấp AI
          </Link>
        </div>
      </div>

      {/* AI Usage Overview */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {usageStats.map((s) => (
          <div key={s.label} className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-100">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-lg">{s.emoji}</span>
              <p className="text-xs text-gray-500">{s.label}</p>
            </div>
            <p className="text-xl font-semibold text-gray-900">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Safety & Risk Events */}
      <div className="rounded-2xl bg-white shadow-sm ring-1 ring-gray-100">
        <div className="p-5 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900">🚨 Sự kiện rủi ro & Bộ lọc an toàn</h2>
        </div>
        <div className="grid grid-cols-2 gap-4 p-5 sm:grid-cols-4">
          {safetyStats.map((s) => (
            <div key={s.label} className="text-center">
              <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
              <p className="text-xs text-gray-500 mt-1">{s.label}</p>
            </div>
          ))}
        </div>
        {summary.logs.bySafetyStatus.length > 0 && (
          <div className="border-t border-gray-100 p-5">
            <h3 className="text-sm font-medium text-gray-700 mb-3">Phân bổ Safety Status</h3>
            <div className="flex flex-wrap gap-2">
              {summary.logs.bySafetyStatus.map((bucket) => (
                <span
                  key={bucket.key}
                  className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium ${
                    bucket.key === 'blocked'
                      ? 'bg-red-100 text-red-700'
                      : bucket.key === 'flagged'
                        ? 'bg-yellow-100 text-yellow-700'
                        : bucket.key === 'safe'
                          ? 'bg-green-100 text-green-700'
                          : 'bg-gray-100 text-gray-600'
                  }`}
                >
                  {bucket.key === 'blocked'
                    ? 'Bị chặn'
                    : bucket.key === 'flagged'
                      ? 'Bị đánh dấu'
                      : bucket.key === 'safe'
                        ? 'An toàn'
                        : bucket.key}
                  : {formatNumber(bucket.count)}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Provider Usage Breakdown */}
      <div className="rounded-2xl bg-white shadow-sm ring-1 ring-gray-100">
        <div className="p-5 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900">🤖 Sử dụng nhà cung cấp AI</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 text-xs uppercase text-gray-500">
              <tr>
                <th className="px-5 py-3">Provider</th>
                <th className="px-5 py-3">Model</th>
                <th className="px-5 py-3">Requests</th>
                <th className="px-5 py-3">Tokens (In)</th>
                <th className="px-5 py-3">Tokens (Out)</th>
                <th className="px-5 py-3">Chi phí ước tính</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {summary.providers.map((p, idx) => (
                <tr key={`${p.provider}-${p.model}-${idx}`} className="hover:bg-gray-50">
                  <td className="px-5 py-4 font-medium text-gray-900">{p.provider}</td>
                  <td className="px-5 py-4 text-gray-600">{p.model}</td>
                  <td className="px-5 py-4">{formatNumber(p.count)}</td>
                  <td className="px-5 py-4 text-gray-500">{formatNumber(p.tokensInput)}</td>
                  <td className="px-5 py-4 text-gray-500">{formatNumber(p.tokensOutput)}</td>
                  <td className="px-5 py-4 text-gray-500">{estimateCost(p.tokensInput, p.tokensOutput)}</td>
                </tr>
              ))}
              {summary.providers.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-10 text-center text-gray-400">
                    Chưa có dữ liệu provider
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Request Purpose Breakdown */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-2xl bg-white shadow-sm ring-1 ring-gray-100">
          <div className="p-5 border-b border-gray-100">
            <h2 className="text-base font-bold text-gray-900">📋 Theo mục đích</h2>
          </div>
          <div className="p-5 space-y-3">
            {summary.logs.byPurpose.map((bucket) => (
              <div key={bucket.key} className="flex items-center justify-between">
                <span className="text-sm text-gray-700 capitalize">
                  {bucket.key === 'diagnostic'
                    ? 'Đánh giá năng lực'
                    : bucket.key === 'tutor' || bucket.key === 'chat'
                      ? 'Trợ lý học tập'
                      : bucket.key === 'solve' || bucket.key === 'solution'
                        ? 'Giải bài tập'
                        : bucket.key}
                </span>
                <span className="text-sm font-medium text-gray-900">{formatNumber(bucket.count)}</span>
              </div>
            ))}
            {summary.logs.byPurpose.length === 0 && (
              <p className="text-sm text-gray-400 text-center">Không có dữ liệu</p>
            )}
          </div>
        </div>

        <div className="rounded-2xl bg-white shadow-sm ring-1 ring-gray-100">
          <div className="p-5 border-b border-gray-100">
            <h2 className="text-base font-bold text-gray-900">📊 Theo trạng thái</h2>
          </div>
          <div className="p-5 space-y-3">
            {summary.logs.byStatus.map((bucket) => (
              <div key={bucket.key} className="flex items-center justify-between">
                <span className="text-sm text-gray-700 capitalize">
                  {bucket.key === 'success' ? 'Thành công' : bucket.key === 'error' ? 'Lỗi' : bucket.key}
                </span>
                <div className="flex items-center gap-2">
                  <span
                    className={`h-2 w-2 rounded-full ${
                      bucket.key === 'success' ? 'bg-green-500' : bucket.key === 'error' ? 'bg-red-500' : 'bg-gray-400'
                    }`}
                  />
                  <span className="text-sm font-medium text-gray-900">{formatNumber(bucket.count)}</span>
                </div>
              </div>
            ))}
            {summary.logs.byStatus.length === 0 && (
              <p className="text-sm text-gray-400 text-center">Không có dữ liệu</p>
            )}
          </div>
        </div>
      </div>

      {/* Quick Links */}
      <div className="rounded-2xl bg-slate-50 p-5 ring-1 ring-slate-200">
        <h3 className="text-sm font-medium text-slate-700 mb-3">Liên kết nhanh</h3>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/admin/ai-logs"
            className="rounded-lg bg-white px-4 py-2 text-sm text-slate-700 shadow-sm ring-1 ring-slate-200 hover:ring-slate-300 transition"
          >
            Xem chi tiết Nhật ký AI →
          </Link>
          <Link
            href="/admin/ai-providers"
            className="rounded-lg bg-white px-4 py-2 text-sm text-slate-700 shadow-sm ring-1 ring-slate-200 hover:ring-slate-300 transition"
          >
            Quản lý Nhà cung cấp AI →
          </Link>
        </div>
      </div>

      <p className="text-xs text-gray-400 text-right">
        Cập nhật lúc: {new Date(summary.generatedAt).toLocaleString('vi-VN')}
      </p>
    </div>
  );
}
