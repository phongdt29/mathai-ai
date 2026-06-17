'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiClient } from '@/lib/api';

interface NotificationTemplate {
  _id: string;
  template_id: string;
  type: string;
  version: string;
  channels: string[];
  variables: string[];
  is_active: boolean;
  createdAt: string;
  updatedAt: string;
}

interface TemplatesResponse {
  success: boolean;
  data: NotificationTemplate[];
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('vi-VN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function ChannelBadge({ channel }: { channel: string }) {
  const colors: Record<string, string> = {
    email: 'bg-blue-50 text-blue-700',
    sms: 'bg-purple-50 text-purple-700',
    push: 'bg-orange-50 text-orange-700',
    in_app: 'bg-green-50 text-green-700',
  };
  const labels: Record<string, string> = {
    email: 'Email',
    sms: 'SMS',
    push: 'Thông báo đẩy',
    in_app: 'Trong ứng dụng',
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${colors[channel] ?? 'bg-gray-100 text-gray-600'}`}>
      {labels[channel] ?? channel}
    </span>
  );
}

export default function NotificationTemplatesPage() {
  const [templates, setTemplates] = useState<NotificationTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const fetchTemplates = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient<TemplatesResponse>('/admin/notifications/templates');
      setTemplates(res.data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Không thể tải dữ liệu');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    // Defer to a microtask so the loading state update does not run synchronously
    // inside the effect (react-hooks/set-state-in-effect).
    Promise.resolve().then(() => {
      if (active) void fetchTemplates();
    });
    return () => {
      active = false;
    };
  }, [fetchTemplates]);

  async function handleToggleActive(template: NotificationTemplate) {
    setTogglingId(template._id);
    try {
      await apiClient(`/admin/notifications/templates/${template._id}/toggle-active`, {
        method: 'PUT',
      });
      setTemplates((prev) =>
        prev.map((t) =>
          t._id === template._id ? { ...t, is_active: !t.is_active } : t,
        ),
      );
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Không thể cập nhật trạng thái');
    } finally {
      setTogglingId(null);
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-gray-900">Mẫu thông báo 📝</h1>
        <div className="flex items-center justify-center py-20 text-gray-400">Đang tải...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-gray-900">Mẫu thông báo 📝</h1>
        <div className="rounded-2xl bg-red-50 p-6 text-center text-red-600">{error}</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Mẫu thông báo 📝</h1>

      {/* Summary */}
      <div className="flex items-center gap-4 text-sm text-gray-500">
        <span>Tổng: {templates.length} mẫu</span>
        <span>Hoạt động: {templates.filter((t) => t.is_active).length}</span>
      </div>

      {/* Table */}
      <div className="rounded-2xl bg-white shadow-sm ring-1 ring-gray-100 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              <th className="px-4 py-3">Template ID</th>
              <th className="px-4 py-3">Phiên bản</th>
              <th className="px-4 py-3">Kênh</th>
              <th className="px-4 py-3">Trạng thái</th>
              <th className="px-4 py-3">Cập nhật</th>
              <th className="px-4 py-3">Hành động</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {templates.map((template) => (
              <tr key={template._id} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  <div className="font-medium text-gray-900">{template.template_id}</div>
                  <div className="text-xs text-gray-400">{template.type}</div>
                </td>
                <td className="px-4 py-3 text-gray-600">{template.version}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    {template.channels.map((ch) => (
                      <ChannelBadge key={ch} channel={ch} />
                    ))}
                  </div>
                </td>
                <td className="px-4 py-3">
                  {template.is_active ? (
                    <span className="inline-flex items-center rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">
                      Hoạt động
                    </span>
                  ) : (
                    <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">
                      Không hoạt động
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                  {formatDate(template.updatedAt)}
                </td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => handleToggleActive(template)}
                    disabled={togglingId === template._id}
                    className={`rounded-md px-3 py-1 text-xs font-medium transition disabled:opacity-50 ${
                      template.is_active
                        ? 'bg-red-50 text-red-700 hover:bg-red-100'
                        : 'bg-green-50 text-green-700 hover:bg-green-100'
                    }`}
                  >
                    {togglingId === template._id
                      ? '...'
                      : template.is_active
                        ? 'Vô hiệu hóa'
                        : 'Kích hoạt'}
                  </button>
                </td>
              </tr>
            ))}
            {templates.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-gray-400">
                  Chưa có notification template nào
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
