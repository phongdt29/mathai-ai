'use client';

import { useState, useEffect } from 'react';
import { apiClient } from '@/lib/api';
import {
  AdminFlatIcon,
  type AdminFlatIconName,
} from '../components/AdminFlatIcon';

interface Stats {
  totalUsers: number;
  activeUsers: number;
  totalLessons: number;
  totalAIRequests: number;
  newUsersThisMonth: number;
  aiRequestsThisWeek: number;
}

interface User {
  _id: string;
  full_name: string;
  email: string;
  role: string;
  createdAt: string;
}

const roleMap: Record<string, string> = {
  student: 'Học sinh',
  teacher: 'Giáo viên',
  parent: 'Phụ huynh',
  admin: 'Admin',
};

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [recentUsers, setRecentUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      try {
        const res = await apiClient<{ success: boolean; data: { stats: Stats; recentUsers: User[] } }>('/admin/stats');
        if (res.success) {
          setStats(res.data.stats);
          setRecentUsers(res.data.recentUsers);
        } else {
          setError('Không thể tải dữ liệu');
        }
      } catch {
        setError('Không thể kết nối đến máy chủ');
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="rounded-2xl bg-red-50 p-6 text-center text-red-700">
        <p className="text-lg font-medium">{error ?? 'Đã xảy ra lỗi'}</p>
      </div>
    );
  }

  const activeRate = stats.totalUsers > 0
    ? `${((stats.activeUsers / stats.totalUsers) * 100).toFixed(1)}%`
    : '0.0%';
  const statCards: Array<{
    label: string;
    value: string;
    icon: AdminFlatIconName;
    change: string;
    color: string;
  }> = [
    { label: 'Tổng người dùng', value: stats.totalUsers.toLocaleString('vi-VN'), icon: 'users', change: `+${stats.newUsersThisMonth} tháng này`, color: 'bg-blue-50 text-blue-700' },
    { label: 'Đang hoạt động', value: stats.activeUsers.toLocaleString('vi-VN'), icon: 'activeUsers', change: activeRate, color: 'bg-green-50 text-green-700' },
    { label: 'Yêu cầu AI', value: stats.totalAIRequests.toLocaleString('vi-VN'), icon: 'aiRequests', change: `+${stats.aiRequestsThisWeek.toLocaleString('vi-VN')} tuần này`, color: 'bg-purple-50 text-purple-700' },
    { label: 'Bài học', value: stats.totalLessons.toLocaleString('vi-VN'), icon: 'lessons', change: `${stats.totalLessons} bài`, color: 'bg-amber-50 text-amber-700' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <AdminFlatIcon name="analytics" size={38} />
        <h1 className="text-2xl font-bold text-gray-900">Bảng điều khiển Admin</h1>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((s) => (
          <div key={s.label} className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-100">
            <div className="flex items-center justify-between mb-3">
              <AdminFlatIcon name={s.icon} size={38} />
              <span className={`text-xs font-medium px-2 py-1 rounded-full ${s.color}`}>{s.change}</span>
            </div>
            <div className="text-2xl font-bold text-gray-900">{s.value}</div>
            <div className="text-sm text-gray-500">{s.label}</div>
          </div>
        ))}
      </div>

      <div className="rounded-2xl bg-white shadow-sm ring-1 ring-gray-100">
        <div className="p-5 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900">Người dùng mới đăng ký</h2>
        </div>
        <div className="divide-y divide-gray-50">
          {recentUsers.map((u) => (
            <div key={u._id} className="flex items-center justify-between p-5">
              <div>
                <div className="font-medium text-gray-900">{u.full_name}</div>
                <div className="text-sm text-gray-500">{u.email}</div>
              </div>
              <div className="text-right">
                <div className="text-sm font-medium text-gray-700">{roleMap[u.role] ?? u.role}</div>
                <div className="text-xs text-gray-400">{new Date(u.createdAt).toLocaleDateString('vi-VN')}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
