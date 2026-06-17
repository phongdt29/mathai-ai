'use client';

import { useEffect, useState } from 'react';
import { Users, BookOpen, ClipboardList, BarChart3, TrendingUp, Clock, CheckCircle } from 'lucide-react';
import Link from 'next/link';
import { apiClient } from '@/lib/api';

interface DashboardData {
  stats: {
    total_students: number;
    total_classes: number;
    total_assignments: number;
    ungraded_submissions: number;
  };
  classes: { id: string; name: string; subject: string; students: number; avgScore: number | null; schedule: string }[];
  recent_students: { id: string; full_name: string; email: string; grade_level: number; classification: string; updatedAt: string }[];
  pending_assignments: { id: string; title: string; class_name: string; type: string; status: string; due_date: string | null }[];
}

const classificationLabels: Record<string, string> = {
  gioi: 'Giỏi',
  kha: 'Khá',
  trung_binh: 'TB',
  yeu: 'Yếu',
};

export default function TeacherDashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await apiClient<{ success: boolean; data: DashboardData }>('/teacher/dashboard');
        if (!cancelled && res.success) setData(res.data);
      } catch {
        // keep null
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-emerald-600 border-t-transparent" />
      </div>
    );
  }

  const stats = data?.stats || { total_students: 0, total_classes: 0, total_assignments: 0, ungraded_submissions: 0 };

  const statCards = [
    { label: 'Tổng học sinh', value: stats.total_students, icon: Users, color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-200' },
    { label: 'Lớp đang dạy', value: stats.total_classes, icon: BookOpen, color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-200' },
    { label: 'Bài tập đã giao', value: stats.total_assignments, icon: ClipboardList, color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-200' },
    { label: 'Bài chưa chấm', value: stats.ungraded_submissions, icon: CheckCircle, color: 'text-purple-600', bg: 'bg-purple-50', border: 'border-purple-200' },
  ];

  return (
    <div className="space-y-6">
      <div className="rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 p-6 text-white">
        <h1 className="text-2xl font-bold">Xin chào, Giáo viên!</h1>
        <p className="mt-1 text-emerald-100">
          Hôm nay bạn có <span className="font-semibold text-white">{stats.total_classes} lớp</span> và{' '}
          <span className="font-semibold text-white">{stats.ungraded_submissions} bài</span> cần chấm.
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((s) => (
          <div key={s.label} className={`rounded-xl border ${s.border} ${s.bg} p-4`}>
            <s.icon className={`w-5 h-5 ${s.color} mb-2`} />
            <p className="text-2xl font-bold text-gray-900">{s.value}</p>
            <p className="text-sm text-gray-500 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Pending Assignments */}
        <div className="lg:col-span-1 rounded-xl border border-gray-200 bg-white p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-gray-900">Công việc cần làm</h2>
            <Link href="/teacher/assignments" className="text-xs text-emerald-600 hover:text-emerald-700 font-medium">Xem tất cả</Link>
          </div>
          {(data?.pending_assignments || []).length === 0 ? (
            <p className="text-sm text-gray-400 py-4 text-center">Không có việc cần làm</p>
          ) : (
            <div className="space-y-3">
              {(data?.pending_assignments || []).map((task) => (
                <div key={task.id} className="flex items-start gap-3 p-3 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors">
                  <ClipboardList className="w-5 h-5 text-amber-500 mt-0.5 flex-shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-900 truncate">{task.title}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{task.class_name} · {task.type === 'homework' ? 'Bài tập' : task.type === 'quiz' ? 'Kiểm tra ngắn' : 'Kiểm tra'}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Class Performance */}
        <div className="lg:col-span-2 rounded-xl border border-gray-200 bg-white p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-gray-900">Hiệu suất lớp học</h2>
            <Link href="/teacher/analytics" className="text-xs text-emerald-600 hover:text-emerald-700 font-medium">Xem chi tiết</Link>
          </div>
          {(data?.classes || []).length === 0 ? (
            <p className="text-sm text-gray-400 py-4 text-center">Chưa có lớp học nào. <Link href="/teacher/classes" className="text-emerald-600 hover:underline">Tạo lớp mới</Link></p>
          ) : (
            <div className="space-y-4">
              {(data?.classes || []).map((cls) => (
                <div key={cls.id} className="flex items-center gap-4">
                  <div className="flex-shrink-0 w-14">
                    <span className="text-sm font-bold text-gray-900">{cls.name}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-gray-500">{cls.students} học sinh · {cls.subject}</span>
                      <span className="text-xs text-gray-500 font-medium">ĐTB: {cls.avgScore ?? '—'}</span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-gray-100 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${(cls.avgScore ?? 0) >= 7 ? 'bg-emerald-500' : (cls.avgScore ?? 0) >= 5 ? 'bg-amber-500' : 'bg-red-400'}`}
                        style={{ width: `${((cls.avgScore ?? 0) / 10) * 100}%` }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Recent Students */}
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-gray-900">Học sinh gần đây</h2>
          <Link href="/teacher/students" className="text-xs text-emerald-600 hover:text-emerald-700 font-medium">Xem tất cả</Link>
        </div>
        {(data?.recent_students || []).length === 0 ? (
          <p className="text-sm text-gray-400 py-4 text-center">Chưa có học sinh nào trong lớp</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left py-2 px-3 text-xs font-medium text-gray-500 uppercase">Họ tên</th>
                  <th className="text-left py-2 px-3 text-xs font-medium text-gray-500 uppercase">Email</th>
                  <th className="text-left py-2 px-3 text-xs font-medium text-gray-500 uppercase">Lớp</th>
                  <th className="text-left py-2 px-3 text-xs font-medium text-gray-500 uppercase">Xếp loại</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {(data?.recent_students || []).map((s) => (
                  <tr key={s.id} className="hover:bg-gray-50">
                    <td className="py-3 px-3 font-medium text-gray-900">{s.full_name}</td>
                    <td className="py-3 px-3 text-gray-500">{s.email}</td>
                    <td className="py-3 px-3 text-gray-600">{s.grade_level}</td>
                    <td className="py-3 px-3">
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                        {classificationLabels[s.classification] || s.classification || '—'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
