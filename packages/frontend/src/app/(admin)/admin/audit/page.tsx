'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiClient } from '@/lib/api';

interface AuditLogEntry {
  _id: string;
  actorUserId: string | null;
  actorRole: string | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  result: 'success' | 'failure' | 'denied';
  ipAddress: string | null;
  errorCode: string | null;
  createdAt: string;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

interface AuditLogsResponse {
  success: boolean;
  data: {
    logs: AuditLogEntry[];
    pagination: Pagination;
  };
}

interface Filters {
  actor_id: string;
  action: string;
  resource_type: string;
  result: string;
  date_from: string;
  date_to: string;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('vi-VN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function ResultBadge({ result }: { result: string }) {
  if (result === 'success') {
    return <span className="inline-flex items-center rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">✓ Thành công</span>;
  }
  if (result === 'failure') {
    return <span className="inline-flex items-center rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">✗ Thất bại</span>;
  }
  return <span className="inline-flex items-center rounded-full bg-yellow-50 px-2 py-0.5 text-xs font-medium text-yellow-700">⊘ Từ chối</span>;
}

export default function AuditLogsPage() {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 20, total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>({
    actor_id: '',
    action: '',
    resource_type: '',
    result: '',
    date_from: '',
    date_to: '',
  });

  const fetchLogs = useCallback(async (page: number = 1) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('limit', '20');
      if (filters.actor_id) params.set('actor_id', filters.actor_id);
      if (filters.action) params.set('action', filters.action);
      if (filters.resource_type) params.set('resource_type', filters.resource_type);
      if (filters.result) params.set('result', filters.result);
      if (filters.date_from) params.set('date_from', filters.date_from);
      if (filters.date_to) params.set('date_to', filters.date_to);

      const res = await apiClient<AuditLogsResponse>(`/admin/audit-logs?${params.toString()}`);
      setLogs(res.data.logs);
      setPagination(res.data.pagination);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Không thể tải dữ liệu');
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    let active = true;
    // Defer to a microtask so the loading state update does not run synchronously
    // inside the effect (react-hooks/set-state-in-effect).
    Promise.resolve().then(() => {
      if (active) void fetchLogs(1);
    });
    return () => {
      active = false;
    };
  }, [fetchLogs]);

  function handleFilterChange(key: keyof Filters, value: string) {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }

  function handleApplyFilters(e: React.FormEvent) {
    e.preventDefault();
    fetchLogs(1);
  }

  function handleResetFilters() {
    setFilters({ actor_id: '', action: '', resource_type: '', result: '', date_from: '', date_to: '' });
  }

  function handlePageChange(newPage: number) {
    if (newPage < 1 || newPage > pagination.totalPages) return;
    fetchLogs(newPage);
  }

  if (error && logs.length === 0) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-gray-900">Nhật ký hoạt động 📋</h1>
        <div className="rounded-2xl bg-red-50 p-6 text-center text-red-600">{error}</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Nhật ký hoạt động 📋</h1>

      {/* Filters */}
      <form onSubmit={handleApplyFilters} className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-100">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <div>
            <label htmlFor="filter-actor" className="block text-xs font-medium text-gray-500 mb-1">ID Tác nhân</label>
            <input
              id="filter-actor"
              type="text"
              placeholder="ID người dùng..."
              value={filters.actor_id}
              onChange={(e) => handleFilterChange('actor_id', e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-1.5 text-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
            />
          </div>
          <div>
            <label htmlFor="filter-action" className="block text-xs font-medium text-gray-500 mb-1">Hành động</label>
            <input
              id="filter-action"
              type="text"
              placeholder="Ví dụ: auth.password_reset"
              value={filters.action}
              onChange={(e) => handleFilterChange('action', e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-1.5 text-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
            />
          </div>
          <div>
            <label htmlFor="filter-resource" className="block text-xs font-medium text-gray-500 mb-1">Loại tài nguyên</label>
            <input
              id="filter-resource"
              type="text"
              placeholder="Ví dụ: user, ai_provider"
              value={filters.resource_type}
              onChange={(e) => handleFilterChange('resource_type', e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-1.5 text-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
            />
          </div>
          <div>
            <label htmlFor="filter-result" className="block text-xs font-medium text-gray-500 mb-1">Kết quả</label>
            <select
              id="filter-result"
              value={filters.result}
              onChange={(e) => handleFilterChange('result', e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-1.5 text-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
            >
              <option value="">Tất cả</option>
              <option value="success">Thành công</option>
              <option value="failure">Thất bại</option>
              <option value="denied">Từ chối</option>
            </select>
          </div>
          <div>
            <label htmlFor="filter-date-from" className="block text-xs font-medium text-gray-500 mb-1">Từ ngày</label>
            <input
              id="filter-date-from"
              type="date"
              value={filters.date_from}
              onChange={(e) => handleFilterChange('date_from', e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-1.5 text-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
            />
          </div>
          <div>
            <label htmlFor="filter-date-to" className="block text-xs font-medium text-gray-500 mb-1">Đến ngày</label>
            <input
              id="filter-date-to"
              type="date"
              value={filters.date_to}
              onChange={(e) => handleFilterChange('date_to', e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-1.5 text-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
            />
          </div>
        </div>
        <div className="mt-3 flex gap-2">
          <button
            type="submit"
            className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
          >
            Lọc
          </button>
          <button
            type="button"
            onClick={handleResetFilters}
            className="rounded-lg border border-gray-200 px-4 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
          >
            Xóa bộ lọc
          </button>
        </div>
      </form>

      {/* Summary */}
      <div className="flex items-center justify-between text-sm text-gray-500">
        <span>Tổng: {pagination.total.toLocaleString()} bản ghi</span>
        {loading && <span className="text-blue-500">Đang tải...</span>}
      </div>

      {/* Table */}
      <div className="rounded-2xl bg-white shadow-sm ring-1 ring-gray-100 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              <th className="px-4 py-3">Thời gian</th>
              <th className="px-4 py-3">Tác nhân</th>
              <th className="px-4 py-3">Hành động</th>
              <th className="px-4 py-3">Loại tài nguyên</th>
              <th className="px-4 py-3">ID Tài nguyên</th>
              <th className="px-4 py-3">Kết quả</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {logs.map((log) => (
              <tr key={log._id} className="hover:bg-gray-50">
                <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">{formatDate(log.createdAt)}</td>
                <td className="px-4 py-3 font-mono text-xs text-gray-600">
                  {log.actorUserId ? log.actorUserId.slice(0, 8) + '…' : '—'}
                  {log.actorRole && <span className="ml-1 text-gray-400">({log.actorRole})</span>}
                </td>
                <td className="px-4 py-3 text-gray-800">{log.action}</td>
                <td className="px-4 py-3 text-gray-600">{log.resourceType}</td>
                <td className="px-4 py-3 font-mono text-xs text-gray-500">
                  {log.resourceId ? log.resourceId.slice(0, 10) + (log.resourceId.length > 10 ? '…' : '') : '—'}
                </td>
                <td className="px-4 py-3"><ResultBadge result={log.result} /></td>
              </tr>
            ))}
            {!loading && logs.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-gray-400">Không có dữ liệu audit log</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">
            Trang {pagination.page} / {pagination.totalPages}
          </p>
          <div className="flex gap-1">
            <button
              onClick={() => handlePageChange(1)}
              disabled={pagination.page <= 1}
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm disabled:opacity-40 hover:bg-gray-50 transition-colors"
              aria-label="Trang đầu"
            >
              «
            </button>
            <button
              onClick={() => handlePageChange(pagination.page - 1)}
              disabled={pagination.page <= 1}
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm disabled:opacity-40 hover:bg-gray-50 transition-colors"
              aria-label="Trang trước"
            >
              ‹
            </button>
            <button
              onClick={() => handlePageChange(pagination.page + 1)}
              disabled={pagination.page >= pagination.totalPages}
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm disabled:opacity-40 hover:bg-gray-50 transition-colors"
              aria-label="Trang sau"
            >
              ›
            </button>
            <button
              onClick={() => handlePageChange(pagination.totalPages)}
              disabled={pagination.page >= pagination.totalPages}
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm disabled:opacity-40 hover:bg-gray-50 transition-colors"
              aria-label="Trang cuối"
            >
              »
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
