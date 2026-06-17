'use client';

import { useEffect, useState, useMemo } from 'react';
import { Plus, BookOpen, Eye, Pencil, Trash2, X, Lock, Unlock, Users, ClipboardList, UserPlus, Search } from 'lucide-react';
import { apiClient } from '@/lib/api';

interface ClassItem {
  _id: string;
  name: string;
  subject: string;
  grade_level: number;
  schedule: string;
  description: string | null;
  is_active: boolean;
  createdAt: string;
  teacher: { _id: string; full_name: string; email: string; is_active: boolean } | null;
  student_count: number;
  students: { _id: string; full_name: string; email: string }[];
  stats: { total_assignments: number; active_assignments: number };
}

interface ClassDetail extends Omit<ClassItem, 'students'> {
  students: { _id: string; full_name: string; email: string; is_active: boolean }[];
  assignments: {
    _id: string; title: string; description: string | null;
    type: 'homework' | 'quiz' | 'exam';
    status: 'draft' | 'active' | 'grading' | 'closed';
    due_date: string | null; total_points: number; createdAt: string;
    submissions: { submitted: number; graded: number };
  }[];
}

interface TeacherOption { _id: string; full_name: string; email: string }
interface StudentOption { _id: string; full_name: string; email: string; grade_level: number; school_name: string }

const emptyForm = { name: '', subject: '', grade_level: '', schedule: '', description: '', teacher_id: '' };

const assignmentTypes: Record<string, string> = { homework: 'Bài tập', quiz: 'Kiểm tra ngắn', exam: 'Kiểm tra' };
const statusLabels: Record<string, string> = { draft: 'Nháp', active: 'Đang mở', grading: 'Đang chấm', closed: 'Đóng' };

export default function AdminClassesPage() {
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<ClassItem | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [detail, setDetail] = useState<ClassDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [teachers, setTeachers] = useState<TeacherOption[]>([]);
  const [allStudents, setAllStudents] = useState<StudentOption[]>([]);
  const [showStudentPicker, setShowStudentPicker] = useState(false);
  const [studentSearch, setStudentSearch] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [teacherFilter, setTeacherFilter] = useState<string>('all');

  const filtered = useMemo(() => {
    let result = classes;
    if (statusFilter === 'active') result = result.filter((c) => c.is_active);
    else if (statusFilter === 'inactive') result = result.filter((c) => !c.is_active);
    if (teacherFilter !== 'all') result = result.filter((c) => c.teacher?._id === teacherFilter);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter((c) =>
        c.name.toLowerCase().includes(q) ||
        c.subject.toLowerCase().includes(q) ||
        (c.teacher?.full_name || '').toLowerCase().includes(q)
      );
    }
    return result;
  }, [classes, statusFilter, teacherFilter, searchQuery]);

  async function load() {
    try {
      const res = await apiClient<{ success: boolean; data: ClassItem[] }>('/admin/classes');
      if (res.success) setClasses(res.data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  async function loadTeachers() {
    try {
      const res = await apiClient<{ success: boolean; data: TeacherOption[] }>('/admin/teachers-list');
      if (res.success) setTeachers(res.data);
    } catch {
      // ignore
    }
  }

  async function loadStudents() {
    try {
      const res = await apiClient<{ success: boolean; data: StudentOption[] }>('/admin/students-list');
      if (res.success) setAllStudents(res.data);
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    void Promise.resolve().then(() => {
      void load();
      void loadTeachers();
    });
  }, []);

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setError('');
    setShowForm(true);
  }

  function openEdit(c: ClassItem) {
    setEditing(c);
    setForm({
      name: c.name,
      subject: c.subject,
      grade_level: String(c.grade_level),
      schedule: c.schedule || '',
      description: c.description || '',
      teacher_id: c.teacher?._id || '',
    });
    setError('');
    setShowForm(true);
  }

  async function openDetail(id: string) {
    setDetailLoading(true);
    setShowStudentPicker(false);
    setStudentSearch('');
    try {
      const res = await apiClient<{ success: boolean; data: ClassDetail }>(`/admin/classes/${id}`);
      if (res.success) setDetail(res.data);
    } catch {
      // ignore
    } finally {
      setDetailLoading(false);
    }
  }

  async function handleSave() {
    if (!form.name.trim() || !form.subject.trim() || !form.grade_level || !form.teacher_id) return;
    const grade = Number(form.grade_level);
    if (grade < 1 || grade > 12) { setError('Khối phải từ 1 đến 12'); return; }
    setSaving(true);
    setError('');
    try {
      const body: Record<string, unknown> = {
        name: form.name,
        subject: form.subject,
        grade_level: grade,
        teacher_id: form.teacher_id,
      };
      if (form.schedule.trim()) body.schedule = form.schedule;
      if (form.description.trim()) body.description = form.description;

      if (editing) {
        const res = await apiClient<{ success: boolean; data: unknown }>(`/admin/classes/${editing._id}`, {
          method: 'PUT',
          body: JSON.stringify(body),
        });
        if (res.success) { load(); setShowForm(false); }
      } else {
        const res = await apiClient<{ success: boolean; data: unknown }>('/admin/classes', {
          method: 'POST',
          body: JSON.stringify(body),
        });
        if (res.success) { load(); setShowForm(false); }
      }
    } catch (e: any) {
      setError(e.message || 'Có lỗi xảy ra');
    } finally {
      setSaving(false);
    }
  }

  async function handleToggle(c: ClassItem) {
    try {
      const res = await apiClient<{ success: boolean; data: unknown }>(`/admin/classes/${c._id}/toggle`, { method: 'PUT' });
      if (res.success) {
        setClasses((prev) => prev.map((x) => (x._id === c._id ? { ...x, is_active: !x.is_active } : x)));
      }
    } catch {
      // ignore
    }
  }

  async function handleDelete(c: ClassItem) {
    if (!confirm(`Vô hiệu hóa lớp "${c.name}"? Hành động này sẽ khóa lớp học.`)) return;
    try {
      await apiClient(`/admin/classes/${c._id}`, { method: 'DELETE' });
      setClasses((prev) => prev.map((x) => (x._id === c._id ? { ...x, is_active: false } : x)));
    } catch {
      // ignore
    }
  }

  async function handleAddStudent(studentId: string) {
    if (!detail) return;
    try {
      const res = await apiClient<{ success: boolean; data: unknown }>(`/admin/classes/${detail._id}/students`, {
        method: 'POST',
        body: JSON.stringify({ student_id: studentId }),
      });
      if (res.success) {
        await openDetail(detail._id);
        load();
      }
    } catch {
      // ignore
    }
  }

  async function handleRemoveStudent(studentId: string) {
    if (!detail) return;
    if (!confirm('Xóa học sinh khỏi lớp?')) return;
    try {
      const res = await apiClient<{ success: boolean; data: unknown }>(`/admin/classes/${detail._id}/students/${studentId}`, {
        method: 'DELETE',
      });
      if (res.success) {
        await openDetail(detail._id);
        load();
      }
    } catch {
      // ignore
    }
  }

  function openStudentPicker() {
    loadStudents();
    setStudentSearch('');
    setShowStudentPicker(true);
  }

  const availableStudents = useMemo(() => {
    if (!detail) return [];
    const enrolled = new Set(detail.students.map((s) => s._id));
    let result = allStudents.filter((s) => !enrolled.has(s._id));
    if (studentSearch.trim()) {
      const q = studentSearch.toLowerCase();
      result = result.filter((s) =>
        s.full_name.toLowerCase().includes(q) ||
        s.email.toLowerCase().includes(q)
      );
    }
    return result;
  }, [allStudents, detail, studentSearch]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
      </div>
    );
  }

  const activeCount = classes.filter((c) => c.is_active).length;
  const totalStudents = classes.reduce((s, c) => s + c.student_count, 0);
  const totalAssignments = classes.reduce((s, c) => s + c.stats.total_assignments, 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Quản lý Lớp học</h1>
          <p className="text-sm text-gray-500 mt-0.5">Tạo, chỉnh sửa lớp học và quản lý học sinh</p>
        </div>
        <button onClick={openCreate} className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors">
          <Plus className="w-4 h-4" />
          Thêm lớp
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
          <BookOpen className="w-5 h-5 text-blue-600 mb-2" />
          <p className="text-2xl font-bold text-gray-900">{activeCount}<span className="text-sm font-normal text-gray-400">/{classes.length}</span></p>
          <p className="text-sm text-gray-500">Lớp hoạt động</p>
        </div>
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <Users className="w-5 h-5 text-emerald-600 mb-2" />
          <p className="text-2xl font-bold text-gray-900">{totalStudents}</p>
          <p className="text-sm text-gray-500">Tổng học sinh</p>
        </div>
        <div className="rounded-xl border border-purple-200 bg-purple-50 p-4">
          <ClipboardList className="w-5 h-5 text-purple-600 mb-2" />
          <p className="text-2xl font-bold text-gray-900">{totalAssignments}</p>
          <p className="text-sm text-gray-500">Tổng bài tập</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Tìm lớp, môn, giáo viên..."
            className="w-full rounded-lg border border-gray-200 pl-9 pr-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
        >
          <option value="all">Tất cả</option>
          <option value="active">Hoạt động</option>
          <option value="inactive">Đã khóa</option>
        </select>
        <select
          value={teacherFilter}
          onChange={(e) => setTeacherFilter(e.target.value)}
          className="rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
        >
          <option value="all">Tất cả GV</option>
          {teachers.map((t) => (
            <option key={t._id} value={t._id}>{t.full_name}</option>
          ))}
        </select>
      </div>

      {/* Class table */}
      {filtered.length === 0 ? (
        <div className="text-center py-16">
          <BookOpen className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-sm text-gray-500">{classes.length === 0 ? 'Chưa có lớp học nào' : 'Không tìm thấy lớp học phù hợp'}</p>
          {classes.length === 0 && (
            <button onClick={openCreate} className="mt-3 text-sm font-medium text-blue-600 hover:text-blue-700">Thêm lớp đầu tiên</button>
          )}
        </div>
      ) : (
        <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
          <table className="w-full text-left">
            <thead className="bg-gray-50 text-xs uppercase text-gray-500">
              <tr>
                <th className="px-5 py-3">Lớp học</th>
                <th className="px-5 py-3">Giáo viên</th>
                <th className="px-5 py-3">Học sinh</th>
                <th className="px-5 py-3">Bài tập</th>
                <th className="px-5 py-3">Trạng thái</th>
                <th className="px-5 py-3 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map((c) => (
                <tr key={c._id} className="hover:bg-gray-50">
                  <td className="px-5 py-4">
                    <div>
                      <p className="font-medium text-gray-900">{c.name}</p>
                      <p className="text-xs text-gray-400">{c.subject} · Khối {c.grade_level}</p>
                    </div>
                  </td>
                  <td className="px-5 py-4 text-sm text-gray-700">
                    {c.teacher ? c.teacher.full_name : <span className="text-gray-400">Chưa gán</span>}
                  </td>
                  <td className="px-5 py-4 text-sm text-gray-700">{c.student_count}</td>
                  <td className="px-5 py-4">
                    <span className="text-sm text-gray-700">{c.stats.total_assignments}</span>
                    {c.stats.active_assignments > 0 && (
                      <span className="text-xs text-gray-400 ml-1">({c.stats.active_assignments} active)</span>
                    )}
                  </td>
                  <td className="px-5 py-4">
                    <span className={`inline-flex items-center gap-1 text-xs font-medium ${c.is_active ? 'text-green-600' : 'text-red-500'}`}>
                      <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ backgroundColor: c.is_active ? '#16a34a' : '#ef4444' }} />
                      {c.is_active ? 'Hoạt động' : 'Đã khóa'}
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => openDetail(c._id)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-blue-600" title="Chi tiết">
                        <Eye className="w-4 h-4" />
                      </button>
                      <button onClick={() => openEdit(c)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-blue-600" title="Sửa">
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button onClick={() => handleToggle(c)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600" title={c.is_active ? 'Khóa' : 'Mở khóa'}>
                        {c.is_active ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
                      </button>
                      <button onClick={() => handleDelete(c)} className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500" title="Vô hiệu hóa">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Detail modal */}
      {(detail || detailLoading) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => { setDetail(null); setShowStudentPicker(false); }}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            {detailLoading ? (
              <div className="flex items-center justify-center py-20">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
              </div>
            ) : detail && (
              <>
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                  <div>
                    <h2 className="text-lg font-bold text-gray-900">{detail.name}</h2>
                    <p className="text-xs text-gray-400">{detail.subject} · Khối {detail.grade_level}{detail.teacher ? ` · GV: ${detail.teacher.full_name}` : ''} · Tạo {new Date(detail.createdAt).toLocaleDateString('vi-VN')}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`text-xs font-medium px-2 py-1 rounded-full ${detail.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
                      {detail.is_active ? 'Hoạt động' : 'Đã khóa'}
                    </span>
                    <button onClick={() => { setDetail(null); setShowStudentPicker(false); }} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
                  </div>
                </div>

                {/* Stats row */}
                <div className="grid grid-cols-5 gap-3 px-6 py-4 border-b border-gray-50">
                  <Stat label="Học sinh" value={detail.students.length} />
                  <Stat label="Bài tập" value={detail.assignments.length} />
                  <Stat label="Bài đang mở" value={detail.assignments.filter(a => a.status === 'active').length} />
                  <Stat label="Bài nộp" value={detail.assignments.reduce((s, a) => s + a.submissions.submitted, 0)} />
                  <Stat label="Đã chấm" value={detail.assignments.reduce((s, a) => s + a.submissions.graded, 0)} />
                </div>

                <div className="flex flex-col md:flex-row">
                  {/* Left: Students */}
                  <div className="flex-1 p-6 md:border-r border-b md:border-b-0 border-gray-100">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-semibold text-gray-900">Học sinh ({detail.students.length})</h3>
                      <button onClick={openStudentPicker} className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700">
                        <UserPlus className="w-3.5 h-3.5" />
                        Thêm học sinh
                      </button>
                    </div>

                    {/* Student picker */}
                    {showStudentPicker && (
                      <div className="mb-3 rounded-lg border border-blue-200 bg-blue-50/50 p-3">
                        <div className="relative mb-2">
                          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                          <input
                            type="text"
                            value={studentSearch}
                            onChange={(e) => setStudentSearch(e.target.value)}
                            placeholder="Tìm học sinh..."
                            className="w-full rounded-md border border-gray-200 pl-8 pr-3 py-1.5 text-xs outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                          />
                        </div>
                        <div className="max-h-40 overflow-y-auto space-y-1">
                          {availableStudents.length === 0 ? (
                            <p className="text-xs text-gray-400 text-center py-2">Không tìm thấy học sinh</p>
                          ) : (
                            availableStudents.slice(0, 20).map((s) => (
                              <button
                                key={s._id}
                                onClick={() => handleAddStudent(s._id)}
                                className="w-full flex items-center justify-between p-2 rounded-md hover:bg-white text-left"
                              >
                                <div>
                                  <p className="text-xs font-medium text-gray-900">{s.full_name}</p>
                                  <p className="text-xs text-gray-400">{s.email} · Khối {s.grade_level}</p>
                                </div>
                                <Plus className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />
                              </button>
                            ))
                          )}
                        </div>
                        <button onClick={() => setShowStudentPicker(false)} className="mt-2 text-xs text-gray-500 hover:text-gray-700">Đóng</button>
                      </div>
                    )}

                    {detail.students.length === 0 ? (
                      <p className="text-xs text-gray-400">Chưa có học sinh</p>
                    ) : (
                      <div className="space-y-2">
                        {detail.students.map((s) => (
                          <div key={s._id} className="flex items-center justify-between p-2.5 rounded-lg bg-gray-50">
                            <div>
                              <p className="text-sm font-medium text-gray-900">{s.full_name}</p>
                              <p className="text-xs text-gray-400">{s.email}</p>
                            </div>
                            <button onClick={() => handleRemoveStudent(s._id)} className="p-1 rounded-md hover:bg-red-50 text-gray-400 hover:text-red-500" title="Xóa khỏi lớp">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Right: Assignments */}
                  <div className="md:w-72 flex-shrink-0 p-6">
                    <h3 className="text-sm font-semibold text-gray-900 mb-3">Bài tập ({detail.assignments.length})</h3>
                    {detail.assignments.length === 0 ? (
                      <p className="text-xs text-gray-400">Chưa có bài tập</p>
                    ) : (
                      <div className="space-y-2">
                        {detail.assignments.map((a) => (
                          <div key={a._id} className="flex items-start justify-between p-2.5 rounded-lg bg-gray-50">
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-gray-900 truncate">{a.title}</p>
                              <p className="text-xs text-gray-400">
                                {assignmentTypes[a.type] || a.type} · {a.total_points} điểm
                                {a.due_date ? ` · ${new Date(a.due_date).toLocaleDateString('vi-VN')}` : ''}
                              </p>
                            </div>
                            <span className={`text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${
                              a.status === 'active' ? 'bg-green-100 text-green-700' :
                              a.status === 'draft' ? 'bg-gray-100 text-gray-500' :
                              a.status === 'grading' ? 'bg-amber-100 text-amber-700' :
                              'bg-gray-100 text-gray-500'
                            }`}>{statusLabels[a.status] || a.status}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex justify-end gap-2 px-6 py-4 border-t border-gray-100">
                  <button onClick={() => { setDetail(null); setShowStudentPicker(false); }} className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg">Đóng</button>
                  <a href={`/admin/classes/${detail._id}`} className="px-4 py-2 text-sm font-medium text-blue-600 border border-blue-200 hover:bg-blue-50 rounded-lg">Xem chi tiết</a>
                  <button onClick={() => { openEdit(detail as unknown as ClassItem); setDetail(null); setShowStudentPicker(false); }} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg">Chỉnh sửa</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Create/Edit modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowForm(false)}>
          <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-900">{editing ? 'Chỉnh sửa lớp học' : 'Thêm lớp học mới'}</h2>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>

            {error && <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-600 mb-3">{error}</div>}

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Tên lớp *</label>
                <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Toán nâng cao 10A1" className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Môn học *</label>
                <input type="text" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} placeholder="Toán học" className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Khối *</label>
                <input type="number" min={1} max={12} value={form.grade_level} onChange={(e) => setForm({ ...form, grade_level: e.target.value })} placeholder="10" className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Giáo viên *</label>
                <select value={form.teacher_id} onChange={(e) => setForm({ ...form, teacher_id: e.target.value })} className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20">
                  <option value="">Chọn giáo viên</option>
                  {teachers.map((t) => (
                    <option key={t._id} value={t._id}>{t.full_name} ({t.email})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Lịch học</label>
                <input type="text" value={form.schedule} onChange={(e) => setForm({ ...form, schedule: e.target.value })} placeholder="Thứ 2, 4, 6 - 8:00" className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Mô tả</label>
                <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Mô tả lớp học..." rows={3} className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 resize-none" />
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setShowForm(false)} className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg">Hủy</button>
              <button
                onClick={handleSave}
                disabled={saving || !form.name.trim() || !form.subject.trim() || !form.grade_level || !form.teacher_id}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50"
              >
                {saving ? 'Đang lưu...' : editing ? 'Cập nhật' : 'Tạo lớp'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="text-center">
      <p className="text-lg font-bold text-gray-900">{value}</p>
      <p className="text-xs text-gray-500">{label}</p>
    </div>
  );
}
