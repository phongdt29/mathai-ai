'use client';

import { useEffect, useState } from 'react';
import { apiClient } from '@/lib/api';
import { downloadAdminReportCsv, type AdminReportsData } from './export';

interface ReportsResponse {
  success: boolean;
  data: {
    dau: number;
    mau: number;
    totalUsers: number;
    totalLessons: number;
    completedLessons: number;
    completionRate: number;
    avgStudyTimeMinutes: number;
    totalSessions: number;
  };
}

type ReportsData = AdminReportsData;

const metrics: { key: keyof ReportsData; label: string; icon: string; format: (v: number) => string }[] = [
  { key: 'dau', label: 'DAU', icon: '👤', format: (v) => String(v) },
  { key: 'mau', label: 'MAU', icon: '👥', format: (v) => String(v) },
  { key: 'avgStudyTimeMinutes', label: 'Thời gian TB/ngày', icon: '⏱️', format: (v) => `${v} phút` },
  { key: 'completionRate', label: 'Tỷ lệ hoàn thành', icon: '✅', format: (v) => `${v}%` },
  { key: 'totalUsers', label: 'Tổng người dùng', icon: '🧑‍🤝‍🧑', format: (v) => String(v) },
  { key: 'totalLessons', label: 'Tổng bài học', icon: '📚', format: (v) => String(v) },
  { key: 'completedLessons', label: 'Bài đã hoàn thành', icon: '🎓', format: (v) => String(v) },
  { key: 'totalSessions', label: 'Tổng phiên học', icon: '📊', format: (v) => String(v) },
];

export default function ReportsPage() {
  const [data, setData] = useState<ReportsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiClient<ReportsResponse>('/admin/reports')
      .then((res) => {
        setData(res.data);
      })
      .catch((err: Error) => {
        setError(err.message || 'Không thể tải dữ liệu báo cáo.');
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-blue-500" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-2xl bg-red-50 p-6 text-center text-red-600 shadow-sm ring-1 ring-red-100">
        {error || 'Đã xảy ra lỗi.'}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Báo cáo 📈</h1>
        <button
          type="button"
          onClick={() => downloadAdminReportCsv(data)}
          className="rounded-xl border border-blue-600 px-4 py-2 text-sm font-semibold text-blue-700 transition hover:bg-blue-50"
        >
          Xuất CSV
        </button>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {metrics.map((m) => (
          <div
            key={m.key}
            className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-100"
          >
            <div className="text-2xl">{m.icon}</div>
            <p className="mt-2 text-sm text-gray-500">{m.label}</p>
            <p className="text-2xl font-bold text-gray-900">{m.format(data[m.key])}</p>
          </div>
        ))}
      </div>

      <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
        <h2 className="text-lg font-bold text-gray-900 mb-4">Tổng quan</h2>
        <p className="text-gray-500">Biểu đồ chi tiết sẽ được cập nhật trong phiên bản tiếp theo. 📊</p>
      </div>
    </div>
  );
}
