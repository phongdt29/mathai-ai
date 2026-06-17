'use client';

import { useEffect, useState } from 'react';
import { apiClient } from '@/lib/api';

interface AILog {
  _id: string;
  user: string;
  generation_type: string;
  ai_model: string | null;
  tokens_input: number | null;
  tokens_output: number | null;
  total_tokens: number;
  response_time_ms: number | null;
  status: string;
  error_message: string | null;
  createdAt: string;
}

interface Summary {
  totalTokens: number;
  avgResponseTime: number;
  errorCount: number;
  total: number;
}

function formatTime(ms: number | null): string {
  if (ms == null) return '—';
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`;
}

function formatDate(iso: string): string {
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

export default function AILogsPage() {
  const [logs, setLogs] = useState<AILog[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchLogs() {
      try {
        const res = await apiClient<{ success: boolean; data: { logs: AILog[]; summary: Summary } }>('/admin/ai-logs?status=&type=&limit=50');
        setLogs(res.data.logs);
        setSummary(res.data.summary);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Không thể tải dữ liệu');
      } finally {
        setLoading(false);
      }
    }
    fetchLogs();
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-gray-900">AI Logs 🔍</h1>
        <div className="flex items-center justify-center py-20 text-gray-400">Đang tải...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-gray-900">AI Logs 🔍</h1>
        <div className="rounded-2xl bg-red-50 p-6 text-center text-red-600">{error}</div>
      </div>
    );
  }

  const stats = [
    { label: 'Tổng requests', value: summary?.total.toLocaleString() ?? '0' },
    { label: 'Tổng tokens', value: summary?.totalTokens.toLocaleString() ?? '0' },
    { label: 'Thời gian TB', value: formatTime(summary?.avgResponseTime ?? null) },
    { label: 'Lỗi', value: summary?.errorCount.toLocaleString() ?? '0' },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">AI Logs 🔍</h1>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-100">
            <p className="text-xs text-gray-500">{s.label}</p>
            <p className="mt-1 text-xl font-semibold text-gray-900">{s.value}</p>
          </div>
        ))}
      </div>

      <div className="rounded-2xl bg-white shadow-sm ring-1 ring-gray-100 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              <th className="px-5 py-3">ID</th>
              <th className="px-5 py-3">User</th>
              <th className="px-5 py-3">Loại</th>
              <th className="px-5 py-3">Model</th>
              <th className="px-5 py-3">Tokens</th>
              <th className="px-5 py-3">Thời gian</th>
              <th className="px-5 py-3">Status</th>
              <th className="px-5 py-3">Ngày</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {logs.map((l) => (
              <tr key={l._id} className="hover:bg-gray-50">
                <td className="px-5 py-4 font-mono text-xs">{l._id.slice(0, 8)}</td>
                <td className="px-5 py-4 text-gray-500">{l.user}</td>
                <td className="px-5 py-4">{l.generation_type}</td>
                <td className="px-5 py-4 text-gray-500">{l.ai_model ?? '—'}</td>
                <td className="px-5 py-4">{l.total_tokens.toLocaleString()}</td>
                <td className="px-5 py-4">{formatTime(l.response_time_ms)}</td>
                <td className="px-5 py-4">
                  {l.status === 'success'
                    ? <span className="text-green-600">✓ OK</span>
                    : <span className="text-red-500" title={l.error_message ?? undefined}>✗ Lỗi</span>}
                </td>
                <td className="px-5 py-4 text-gray-400 text-xs">{formatDate(l.createdAt)}</td>
              </tr>
            ))}
            {logs.length === 0 && (
              <tr>
                <td colSpan={8} className="px-5 py-10 text-center text-gray-400">Không có dữ liệu</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
