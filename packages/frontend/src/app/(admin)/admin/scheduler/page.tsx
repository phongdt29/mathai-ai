'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiClient } from '@/lib/api';

interface ScheduledJobInfo {
  name: string;
  cronExpression: string;
  timezone: string;
  enabled: boolean;
  lockTimeoutMs: number;
  lastRunAt: string | null;
  lastStatus: 'running' | 'succeeded' | 'failed' | 'skipped' | null;
}

interface JobsResponse {
  success: boolean;
  data: ScheduledJobInfo[];
}

interface RunResult {
  success: boolean;
  data: {
    ok: boolean;
    metrics: Record<string, number>;
    notes?: string[];
  };
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('vi-VN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function StatusBadge({ status }: { status: string | null }) {
  if (!status) {
    return <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">Chưa chạy</span>;
  }
  switch (status) {
    case 'succeeded':
      return <span className="inline-flex items-center rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">✓ Thành công</span>;
    case 'failed':
      return <span className="inline-flex items-center rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">✗ Thất bại</span>;
    case 'running':
      return <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">⟳ Đang chạy</span>;
    case 'skipped':
      return <span className="inline-flex items-center rounded-full bg-yellow-50 px-2 py-0.5 text-xs font-medium text-yellow-700">⊘ Bỏ qua</span>;
    default:
      return <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">{status}</span>;
  }
}

function EnabledBadge({ enabled }: { enabled: boolean }) {
  if (enabled) {
    return <span className="inline-flex items-center rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">Bật</span>;
  }
  return <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">Tắt</span>;
}

function describeCron(expression: string): string {
  const parts = expression.split(' ');
  if (parts.length !== 5) return expression;

  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;

  // Common patterns
  if (minute.startsWith('*/') && hour === '*' && dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
    return `Mỗi ${minute.slice(2)} phút`;
  }
  if (hour.startsWith('*/') && dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
    return `Mỗi ${hour.slice(2)} giờ`;
  }
  if (dayOfMonth === '*' && month === '*' && dayOfWeek === '*' && !hour.includes('*') && !minute.includes('*')) {
    return `Hàng ngày lúc ${hour}:${minute.padStart(2, '0')}`;
  }
  if (dayOfMonth === '*' && month === '*' && dayOfWeek !== '*' && !hour.includes('*') && !minute.includes('*')) {
    const days: Record<string, string> = { '0': 'CN', '1': 'T2', '2': 'T3', '3': 'T4', '4': 'T5', '5': 'T6', '6': 'T7' };
    const dayName = days[dayOfWeek] || `thứ ${dayOfWeek}`;
    return `Hàng tuần ${dayName} lúc ${hour}:${minute.padStart(2, '0')}`;
  }

  return expression;
}

export default function SchedulerPage() {
  const [jobs, setJobs] = useState<ScheduledJobInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [runningJob, setRunningJob] = useState<string | null>(null);
  const [runResults, setRunResults] = useState<Record<string, { ok: boolean; message: string }>>({});

  const fetchJobs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient<JobsResponse>('/admin/scheduler/jobs');
      setJobs(res.data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Không thể tải dữ liệu');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  async function handleRunJob(jobName: string) {
    setRunningJob(jobName);
    setRunResults((prev) => {
      const next = { ...prev };
      delete next[jobName];
      return next;
    });

    try {
      const res = await apiClient<RunResult>(`/admin/scheduler/jobs/${encodeURIComponent(jobName)}/run`, {
        method: 'POST',
      });

      const resultData = res.data;
      setRunResults((prev) => ({
        ...prev,
        [jobName]: {
          ok: resultData.ok,
          message: resultData.ok
            ? `Thành công — ${JSON.stringify(resultData.metrics)}`
            : `Thất bại — ${resultData.notes?.join(', ') || JSON.stringify(resultData.metrics)}`,
        },
      }));

      // Refresh jobs list to update last_run_at
      await fetchJobs();
    } catch (err: unknown) {
      setRunResults((prev) => ({
        ...prev,
        [jobName]: {
          ok: false,
          message: err instanceof Error ? err.message : 'Lỗi không xác định',
        },
      }));
    } finally {
      setRunningJob(null);
    }
  }

  if (error && jobs.length === 0) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-gray-900">Lịch trình chạy tự động ⏰</h1>
        <div className="rounded-2xl bg-red-50 p-6 text-center text-red-600">{error}</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Lịch trình chạy tự động ⏰</h1>
        <button
          onClick={fetchJobs}
          disabled={loading}
          className="rounded-lg border border-gray-200 px-4 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-40"
        >
          {loading ? 'Đang tải...' : 'Làm mới'}
        </button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-100">
          <p className="text-sm text-gray-500">Tổng số tác vụ</p>
          <p className="text-2xl font-bold text-gray-900">{jobs.length}</p>
        </div>
        <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-100">
          <p className="text-sm text-gray-500">Đang bật</p>
          <p className="text-2xl font-bold text-green-600">{jobs.filter((j) => j.enabled).length}</p>
        </div>
        <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-100">
          <p className="text-sm text-gray-500">Lỗi gần nhất</p>
          <p className="text-2xl font-bold text-red-600">{jobs.filter((j) => j.lastStatus === 'failed').length}</p>
        </div>
      </div>

      {/* Jobs Table */}
      <div className="rounded-2xl bg-white shadow-sm ring-1 ring-gray-100 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              <th className="px-4 py-3">Tên Job</th>
              <th className="px-4 py-3">Lịch chạy</th>
              <th className="px-4 py-3">Timezone</th>
              <th className="px-4 py-3">Trạng thái</th>
              <th className="px-4 py-3">Lần chạy cuối</th>
              <th className="px-4 py-3">Kết quả cuối</th>
              <th className="px-4 py-3">Hành động</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {jobs.map((job) => (
              <tr key={job.name} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  <div className="font-medium text-gray-900">{job.name}</div>
                  <div className="text-xs text-gray-400 font-mono">{job.cronExpression}</div>
                </td>
                <td className="px-4 py-3 text-gray-600 text-xs">
                  {describeCron(job.cronExpression)}
                </td>
                <td className="px-4 py-3 text-xs text-gray-500">{job.timezone}</td>
                <td className="px-4 py-3">
                  <EnabledBadge enabled={job.enabled} />
                </td>
                <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                  {formatDate(job.lastRunAt)}
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={job.lastStatus} />
                </td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => handleRunJob(job.name)}
                    disabled={runningJob !== null}
                    className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    aria-label={`Chạy job ${job.name}`}
                  >
                    {runningJob === job.name ? 'Đang chạy...' : 'Chạy ngay'}
                  </button>
                </td>
              </tr>
            ))}
            {!loading && jobs.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-gray-400">
                  Không có job nào được đăng ký
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Run Results */}
      {Object.keys(runResults).length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-medium text-gray-700">Kết quả trigger thủ công</h2>
          {Object.entries(runResults).map(([jobName, result]) => (
            <div
              key={jobName}
              className={`rounded-xl p-3 text-sm ${
                result.ok
                  ? 'bg-green-50 text-green-800 ring-1 ring-green-200'
                  : 'bg-red-50 text-red-800 ring-1 ring-red-200'
              }`}
            >
              <span className="font-medium">{jobName}:</span> {result.message}
            </div>
          ))}
        </div>
      )}

      {loading && jobs.length > 0 && (
        <div className="text-center text-sm text-blue-500">Đang tải...</div>
      )}
    </div>
  );
}
