'use client';

import { useEffect, useState } from 'react';
import { Plus, BookOpen, Clock, TrendingUp, MoreHorizontal, X } from 'lucide-react';
import { apiClient } from '@/lib/api';
import Link from 'next/link';

interface TeacherClass {
  _id: string;
  id: string;
  name: string;
  subject: string;
  grade_level: number;
  schedule: string;
  description: string | null;
  student_count: number;
  assignment_count: number;
  avg_score: number | null;
}

export default function TeacherClassesPage() {
  const [classes, setClasses] = useState<TeacherClass[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: '', subject: 'Toán học', grade_level: 10, schedule: '', description: '' });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  async function load() {
    try {
      const res = await apiClient<{ success: boolean; data: TeacherClass[] }>('/teacher/classes');
      if (res.success) setClasses(res.data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void Promise.resolve().then(load);
  }, []);

  async function handleCreate() {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const res = await apiClient<{ success: boolean; data: any; message?: string }>('/teacher/classes', {
        method: 'POST',
        body: JSON.stringify(form),
      });
      if (res.success) {
        setShowCreate(false);
        setForm({ name: '', subject: 'Toán học', grade_level: 10, schedule: '', description: '' });
        setMessage(res.message || 'Đề xuất đã được gửi');
        setTimeout(() => setMessage(''), 4000);
      }
    } catch {
      // ignore
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(classId: string) {
    if (!confirm('Bạn có chắc muốn xóa lớp học này?')) return;
    try {
      await apiClient(`/teacher/classes/${classId}`, { method: 'DELETE' });
      setClasses((prev) => prev.filter((c) => (c._id || c.id) !== classId));
    } catch {
      // ignore
    }
  }

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
          <h1 className="text-xl font-bold text-gray-900">Lớp học</h1>
          <p className="text-sm text-gray-500 mt-0.5">Quản lý các lớp học của bạn</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Đề xuất tạo lớp
        </button>
      </div>

      {message && (
        <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-700">
          {message}
        </div>
      )}

      {/* Create modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowCreate(false)}>
          <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-900">Đề xuất tạo lớp mới</h2>
              <button onClick={() => setShowCreate(false)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tên lớp *</label>
                <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="VD: 10A1" className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Môn học</label>
                <input type="text" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Khối lớp</label>
                  <select value={form.grade_level} onChange={(e) => setForm({ ...form, grade_level: Number(e.target.value) })} className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-500">
                    {[...Array(12)].map((_, i) => <option key={i + 1} value={i + 1}>Lớp {i + 1}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Lịch học</label>
                  <input type="text" value={form.schedule} onChange={(e) => setForm({ ...form, schedule: e.target.value })} placeholder="T2, T4 - 7:00" className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Mô tả</label>
                <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 resize-none" />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setShowCreate(false)} className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg">Hủy</button>
              <button onClick={handleCreate} disabled={saving || !form.name.trim()} className="px-4 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg disabled:opacity-50">
                {saving ? 'Đang gửi...' : 'Gửi đề xuất'}
              </button>
            </div>
          </div>
        </div>
      )}

      {classes.length === 0 ? (
        <div className="text-center py-16">
          <BookOpen className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-sm text-gray-500">Chưa có lớp học nào</p>
          <button onClick={() => setShowCreate(true)} className="mt-3 text-sm font-medium text-emerald-600 hover:text-emerald-700">Tạo lớp đầu tiên</button>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-5">
          {classes.map((cls) => {
            const id = cls._id || cls.id;
            return (
              <div key={id} className="rounded-xl border border-gray-200 bg-white hover:shadow-md transition-shadow">
                <div className="p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="text-lg font-bold text-gray-900">{cls.name}</h3>
                      <p className="text-sm text-gray-500 mt-0.5">{cls.subject} · Lớp {cls.grade_level}</p>
                    </div>
                    <button onClick={() => handleDelete(id)} className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500" title="Xóa lớp">
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="grid grid-cols-3 gap-3 mb-4">
                    <div className="text-center p-2 rounded-lg bg-gray-50">
                      <p className="text-lg font-bold text-gray-900">{cls.student_count}</p>
                      <p className="text-xs text-gray-500">Học sinh</p>
                    </div>
                    <div className="text-center p-2 rounded-lg bg-gray-50">
                      <p className="text-lg font-bold text-gray-900">{cls.avg_score ?? '—'}</p>
                      <p className="text-xs text-gray-500">ĐTB</p>
                    </div>
                    <div className="text-center p-2 rounded-lg bg-gray-50">
                      <p className="text-lg font-bold text-gray-900">{cls.assignment_count}</p>
                      <p className="text-xs text-gray-500">Bài tập</p>
                    </div>
                  </div>

                  {cls.schedule && (
                    <div className="flex items-center gap-2 text-sm text-gray-500">
                      <Clock className="w-4 h-4 flex-shrink-0" />
                      <span>{cls.schedule}</span>
                    </div>
                  )}
                </div>

                <div className="border-t border-gray-100 px-5 py-3 flex items-center justify-end">
                  <Link href={`/teacher/classes/${id}`} className="text-xs font-medium text-emerald-600 hover:text-emerald-700">Chi tiết & Quản lý HS</Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
