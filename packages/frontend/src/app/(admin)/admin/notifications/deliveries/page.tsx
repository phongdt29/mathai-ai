'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiClient } from '@/lib/api';

interface NotificationRecipient {
  user_id: string | null;
  email: string | null;
  phone: string | null;
}

interface ChannelResult {
  channel: string;
  status: 'sent' | 'failed' | 'skipped';
  provider_message_id: string | null;
  error_code: string | null;
}

interface NotificationDelivery {
  _id: string;
  type: string;
  recipient: NotificationRecipient;
  channels: string[];
  channel_results: ChannelResult[];
  status: 'queued' | 'sent' | 'failed' | 'skipped';
  template_id: string;
  retry_count: number;
  createdAt: string;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

interface DeliveriesResponse {
  success: boolean;
  data: {
    deliveries: NotificationDelivery[];
    pagination: Pagination;
  };
}

interface Filters {
  type: string;
  status: string;
  recipient: string;
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

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    sent: 'bg-green-50 text-green-700',
    failed: 'bg-red-50 text-red-700',
    skipped: 'bg-yellow-50 text-yellow-700',
    queued: 'bg-blue-50 text-blue-700',
  };
  const labels: Record<string, string> = {
    sent: '✓ Đã gửi',
    failed: '✗ Thất bại',
    skipped: '⊘ Đã bỏ qua',
    queued: '⏳ Đang chờ',
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${styles[status] ?? 'bg-gray-100 text-gray-600'}`}>
      {labels[status] ?? status}
    </span>
  );
}

function ChannelResultBadge({ result }: { result: ChannelResult }) {
  const colors: Record<string, string> = {
    sent: 'text-green-600',
    failed: 'text-red-600',
    skipped: 'text-yellow-600',
  };
  return (
    <span className={`text-xs ${colors[result.status] ?? 'text-gray-500'}`}>
      {result.channel}:{result.status}
      {result.error_code && <span className="text-gray-400 ml-0.5">({result.error_code})</span>}
    </span>
  );
}

function getRecipientDisplay(recipient: NotificationRecipient): string {
  if (recipient.email) return recipient.email;
  if (recipient.phone) return recipient.phone;
  if (recipient.user_id) return recipient.user_id.slice(0, 10) + '…';
  return '—';
}

export default function NotificationDeliveriesPage() {
  const [deliveries, setDeliveries] = useState<NotificationDelivery[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 20, total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>({
    type: '',
    status: '',
    recipient: '',
  });

  const fetchDeliveries = useCallback(async (page: number = 1) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('limit', '20');
      if (filters.type) params.set('type', filters.type);
      if (filters.status) params.set('status', filters.status);
      if (filters.recipient) params.set('recipient', filters.recipient);

      const res = await apiClient<DeliveriesResponse>(`/admin/notifications/deliveries?${params.toString()}`);
      setDeliveries(res.data.deliveries);
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
      if (active) void fetchDeliveries(1);
    });
    return () => {
      active = false;
    };
  }, [fetchDeliveries]);

  function handleFilterChange(key: keyof Filters, value: string) {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }

  function handleApplyFilters(e: React.FormEvent) {
    e.preventDefault();
    fetchDeliveries(1);
  }

  function handleResetFilters() {
    setFilters({ type: '', status: '', recipient: '' });
  }

  function handlePageChange(newPage: number) {
    if (newPage < 1 || newPage > pagination.totalPages) return;
    fetchDeliveries(newPage);
  }

  async function handleRetry(deliveryId: string) {
    setRetryingId(deliveryId);
    try {
      await apiClient(`/admin/notifications/deliveries/${deliveryId}/retry`, {
        method: 'POST',
      });
      // Refresh the list to show updated status
      await fetchDeliveries(pagination.page);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Không thể retry');
    } finally {
      setRetryingId(null);
    }
  }

  if (error && deliveries.length === 0) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-gray-900">Lịch sử gửi thông báo 📬</h1>
        <div className="rounded-2xl bg-red-50 p-6 text-center text-red-600">{error}</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Lịch sử gửi thông báo 📬</h1>

      {/* Filters */}
      <form onSubmit={handleApplyFilters} className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-100">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <label htmlFor="filter-type" className="block text-xs font-medium text-gray-500 mb-1">Loại thông báo</label>
            <input
              id="filter-type"
              type="text"
              placeholder="Ví dụ: password_reset, assignment_graded"
              value={filters.type}
              onChange={(e) => handleFilterChange('type', e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-1.5 text-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
            />
          </div>
          <div>
            <label htmlFor="filter-status" className="block text-xs font-medium text-gray-500 mb-1">Trạng thái</label>
            <select
              id="filter-status"
              value={filters.status}
              onChange={(e) => handleFilterChange('status', e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-1.5 text-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
            >
              <option value="">Tất cả</option>
              <option value="queued">Đang chờ</option>
              <option value="sent">Đã gửi</option>
              <option value="failed">Thất bại</option>
              <option value="skipped">Đã bỏ qua</option>
            </select>
          </div>
          <div>
            <label htmlFor="filter-recipient" className="block text-xs font-medium text-gray-500 mb-1">Người nhận</label>
            <input
              id="filter-recipient"
              type="text"
              placeholder="Email, số điện thoại hoặc ID người dùng"
              value={filters.recipient}
              onChange={(e) => handleFilterChange('recipient', e.target.value)}
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
        <span>Tổng: {pagination.total.toLocaleString()} lượt gửi</span>
        {loading && <span className="text-blue-500">Đang tải...</span>}
      </div>

      {/* Table */}
      <div className="rounded-2xl bg-white shadow-sm ring-1 ring-gray-100 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              <th className="px-4 py-3">Thời gian</th>
              <th className="px-4 py-3">Loại</th>
              <th className="px-4 py-3">Người nhận</th>
              <th className="px-4 py-3">Kênh gửi</th>
              <th className="px-4 py-3">Kết quả kênh</th>
              <th className="px-4 py-3">Trạng thái</th>
              <th className="px-4 py-3">Thử lại</th>
              <th className="px-4 py-3">Hành động</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {deliveries.map((delivery) => (
              <tr key={delivery._id} className="hover:bg-gray-50">
                <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                  {formatDate(delivery.createdAt)}
                </td>
                <td className="px-4 py-3 text-gray-800">{delivery.type}</td>
                <td className="px-4 py-3 font-mono text-xs text-gray-600">
                  {getRecipientDisplay(delivery.recipient)}
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    {delivery.channels.map((ch) => (
                      <span key={ch} className="inline-flex items-center rounded-full bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600">
                        {ch}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-col gap-0.5">
                    {delivery.channel_results.map((cr, idx) => (
                      <ChannelResultBadge key={idx} result={cr} />
                    ))}
                    {delivery.channel_results.length === 0 && (
                      <span className="text-xs text-gray-400">—</span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={delivery.status} />
                </td>
                <td className="px-4 py-3 text-xs text-gray-500">
                  {delivery.retry_count > 0 ? delivery.retry_count : '—'}
                </td>
                <td className="px-4 py-3">
                  {delivery.status === 'failed' && (
                    <button
                      onClick={() => handleRetry(delivery._id)}
                      disabled={retryingId === delivery._id}
                      className="rounded-md bg-orange-50 px-2.5 py-1 text-xs font-medium text-orange-700 hover:bg-orange-100 transition disabled:opacity-50"
                    >
                      {retryingId === delivery._id ? '...' : 'Thử lại'}
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {!loading && deliveries.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-gray-400">
                  Không có dữ liệu notification delivery
                </td>
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
