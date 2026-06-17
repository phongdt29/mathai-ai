'use client';

import { useEffect, useState } from 'react';
import { apiClient } from '@/lib/api';

interface Activity {
  action: string;
  user: string;
  time: string;
  type: string;
}

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return 'Vừa xong';
  if (minutes < 60) return `${minutes} phút trước`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} giờ trước`;
  const days = Math.floor(hours / 24);
  return `${days} ngày trước`;
}

export default function ActivityPage() {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiClient<{ success: boolean; data: Activity[] }>('/admin/activity')
      .then((res) => {
        setActivities(res.data);
      })
      .catch(() => {
        setError('Không thể tải hoạt động. Vui lòng thử lại.');
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-gray-900">Hoạt động gần đây 📋</h1>
        <div className="rounded-2xl bg-white shadow-sm ring-1 ring-gray-100 p-10 text-center text-gray-400">
          Đang tải...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-gray-900">Hoạt động gần đây 📋</h1>
        <div className="rounded-2xl bg-white shadow-sm ring-1 ring-gray-100 p-10 text-center text-red-500">
          {error}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Hoạt động gần đây 📋</h1>
      <div className="rounded-2xl bg-white shadow-sm ring-1 ring-gray-100">
        <div className="divide-y divide-gray-50">
          {activities.length === 0 ? (
            <div className="p-10 text-center text-gray-400">Chưa có hoạt động nào.</div>
          ) : (
            activities.map((a, i) => (
              <div key={i} className="flex items-center gap-4 p-5">
                <span className="text-2xl">{a.type}</span>
                <div className="flex-1">
                  <div className="font-medium text-gray-900">{a.action}</div>
                  <div className="text-sm text-gray-500">{a.user}</div>
                </div>
                <span className="text-xs text-gray-400">{formatRelativeTime(a.time)}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
