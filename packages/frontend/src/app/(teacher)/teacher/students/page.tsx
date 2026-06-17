'use client';

import { useEffect, useState } from 'react';
import { Search, Download, TrendingUp, TrendingDown, Minus, Eye } from 'lucide-react';
import { apiClient } from '@/lib/api';

interface Student {
  id: string;
  full_name: string;
  email: string;
  grade_level: number;
  classification: string;
  classes: string[];
  avg_score: number | null;
}

const classificationConfig: Record<string, { label: string; color: string }> = {
  gioi: { label: 'Giỏi', color: 'bg-emerald-50 text-emerald-700' },
  kha: { label: 'Khá', color: 'bg-blue-50 text-blue-700' },
  trung_binh: { label: 'Trung bình', color: 'bg-amber-50 text-amber-700' },
  yeu: { label: 'Yếu', color: 'bg-red-50 text-red-700' },
};

export default function TeacherStudentsPage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterClass, setFilterClass] = useState('all');
  const [filterLevel, setFilterLevel] = useState('all');

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await apiClient<{ success: boolean; data: Student[] }>('/teacher/students');
        if (!cancelled && res.success) setStudents(res.data);
      } catch {
        // ignore
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  // Extract unique class names for filter
  const allClasses = Array.from(new Set(students.flatMap((s) => s.classes))).sort();

  const filtered = students.filter((s) => {
    const matchSearch = s.full_name.toLowerCase().includes(search.toLowerCase()) || s.email.toLowerCase().includes(search.toLowerCase());
    const matchClass = filterClass === 'all' || s.classes.includes(filterClass);
    const matchLevel = filterLevel === 'all' || s.classification === filterLevel;
    return matchSearch && matchClass && matchLevel;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-emerald-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Học sinh</h1>
          <p className="text-sm text-gray-500 mt-0.5">{students.length} học sinh trong {allClasses.length} lớp</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Tìm theo tên hoặc email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-gray-200 py-2.5 pl-10 pr-4 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
          />
        </div>
        <select value={filterClass} onChange={(e) => setFilterClass(e.target.value)} className="rounded-lg border border-gray-200 py-2.5 px-3 text-sm text-gray-700 outline-none focus:border-emerald-500">
          <option value="all">Tất cả lớp</option>
          {allClasses.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={filterLevel} onChange={(e) => setFilterLevel(e.target.value)} className="rounded-lg border border-gray-200 py-2.5 px-3 text-sm text-gray-700 outline-none focus:border-emerald-500">
          <option value="all">Tất cả trình độ</option>
          <option value="gioi">Giỏi</option>
          <option value="kha">Khá</option>
          <option value="trung_binh">Trung bình</option>
          <option value="yeu">Yếu</option>
        </select>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider">Họ tên</th>
                <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider">Lớp</th>
                <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider">Khối</th>
                <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider">Xếp loại</th>
                <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider">ĐTB</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((s) => {
                const cl = classificationConfig[s.classification] || { label: s.classification || '—', color: 'bg-gray-100 text-gray-600' };
                return (
                  <tr key={s.id} className="hover:bg-gray-50 transition-colors">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <div className="h-9 w-9 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 text-sm font-bold flex-shrink-0">
                          {s.full_name.split(' ').pop()?.charAt(0) || '?'}
                        </div>
                        <div>
                          <p className="font-medium text-gray-900">{s.full_name}</p>
                          <p className="text-xs text-gray-400">{s.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex flex-wrap gap-1">
                        {s.classes.map((c) => (
                          <span key={c} className="text-xs font-medium px-2 py-0.5 rounded bg-gray-100 text-gray-600">{c}</span>
                        ))}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-gray-600">{s.grade_level}</td>
                    <td className="py-3 px-4">
                      <span className={`text-xs font-medium px-2 py-1 rounded-full ${cl.color}`}>{cl.label}</span>
                    </td>
                    <td className="py-3 px-4">
                      <span className={`font-semibold ${(s.avg_score ?? 0) >= 8 ? 'text-emerald-600' : (s.avg_score ?? 0) >= 6.5 ? 'text-amber-600' : (s.avg_score ?? 0) > 0 ? 'text-red-500' : 'text-gray-400'}`}>
                        {s.avg_score ?? '—'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 && (
          <div className="py-12 text-center text-sm text-gray-400">
            {students.length === 0 ? 'Chưa có học sinh nào. Thêm học sinh vào lớp học trước.' : 'Không tìm thấy học sinh nào'}
          </div>
        )}
      </div>
    </div>
  );
}
