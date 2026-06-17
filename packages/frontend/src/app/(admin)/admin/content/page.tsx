'use client';

import { useEffect, useState } from 'react';
import { apiClient } from '@/lib/api';

interface ContentItem {
  _id: string;
  title: string;
  type: 'Giáo trình' | 'Bài học' | 'Đánh giá';
  status: string;
  createdAt: string;
}

interface ContentResponse {
  success: boolean;
  data: { data: ContentItem[] } | ContentItem[];
  message?: string;
}

const statusColor: Record<string, string> = {
  active: 'bg-green-50 text-green-700 ring-green-600/20',
  completed: 'bg-green-50 text-green-700 ring-green-600/20',
  pending: 'bg-amber-50 text-amber-700 ring-amber-600/20',
  draft: 'bg-gray-50 text-gray-600 ring-gray-500/10',
};

const typeColor: Record<string, string> = {
  'Giáo trình': 'bg-blue-50 text-blue-700 ring-blue-600/20',
  'Bài học': 'bg-green-50 text-green-700 ring-green-600/20',
  'Đánh giá': 'bg-purple-50 text-purple-700 ring-purple-600/20',
};

export default function ContentPage() {
  const [content, setContent] = useState<ContentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiClient<ContentResponse>('/admin/content')
      .then((res) => {
        const items = Array.isArray(res.data) ? res.data : res.data.data;
        setContent(items);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Không thể tải nội dung');
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-blue-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl bg-red-50 p-6 text-center text-red-600 shadow-sm ring-1 ring-red-100">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Quản lý nội dung 📝</h1>
        <button className="rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-700">
          + Tạo nội dung
        </button>
      </div>

      {content.length === 0 ? (
        <div className="rounded-2xl bg-white p-10 text-center text-gray-500 shadow-sm ring-1 ring-gray-100">
          Chưa có nội dung nào
        </div>
      ) : (
        <div className="grid gap-4">
          {content.map((item) => (
            <div
              key={item._id}
              className="flex items-center justify-between rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-100"
            >
              <div>
                <div className="mb-1 flex items-center gap-2">
                  <span
                    className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${typeColor[item.type] || 'bg-gray-50 text-gray-600 ring-gray-500/10'}`}
                  >
                    {item.type}
                  </span>
                </div>
                <div className="font-medium text-gray-900">{item.title}</div>
                <div className="text-sm text-gray-400">
                  {new Date(item.createdAt).toLocaleDateString('vi-VN')}
                </div>
              </div>
              <span
                className={`rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset ${statusColor[item.status.toLowerCase()] || 'bg-gray-50 text-gray-600 ring-gray-500/10'}`}
              >
                {item.status}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
