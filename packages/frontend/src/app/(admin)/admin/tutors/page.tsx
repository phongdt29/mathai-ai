'use client';
/* eslint-disable @next/next/no-img-element */

import { useEffect, useState, useRef } from 'react';
import { Plus, Bot, Pencil, Trash2, X, ToggleLeft, ToggleRight, Upload, Image as ImageIcon } from 'lucide-react';
import { API_URL } from '@/lib/api';

function getToken() {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('token');
}

async function apiFetch<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = { ...(options.headers as Record<string, string> || {}) };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  // Don't set Content-Type for FormData — browser sets it with boundary
  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }
  const res = await fetch(`${API_URL}${endpoint}`, { ...options, headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: 'Lỗi kết nối mạng' }));
    throw new Error(err.message || 'Có lỗi xảy ra');
  }
  return res.json();
}

interface AITutor {
  _id: string;
  code: string;
  name: string;
  display_name: string;
  avatar_url: string | null;
  gender_style: 'nam' | 'nu' | null;
  tone_style: string | null;
  teaching_style: string | null;
  personality: string | null;
  description: string | null;
  system_prompt: string | null;
  is_active: boolean;
  createdAt: string;
}

const emptyForm = {
  name: '',
  display_name: '',
  gender_style: '',
  tone_style: '',
  teaching_style: '',
  personality: '',
  description: '',
  system_prompt: '',
};

export default function TutorsPage() {
  const [tutors, setTutors] = useState<AITutor[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<AITutor | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [detail, setDetail] = useState<AITutor | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function load() {
    try {
      const res = await apiFetch<{ success: boolean; data: AITutor[] }>('/admin/ai-tutors');
      if (res.success) setTutors(res.data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void Promise.resolve().then(load);
  }, []);

  function avatarSrc(tutor: AITutor) {
    if (!tutor.avatar_url) return null;
    if (tutor.avatar_url.startsWith('http')) return tutor.avatar_url;
    const apiOrigin = API_URL.replace(/\/api\/?$/, '');
    return `${apiOrigin}${tutor.avatar_url}`;
  }

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setAvatarFile(null);
    setAvatarPreview(null);
    setShowForm(true);
  }

  function openEdit(tutor: AITutor) {
    setEditing(tutor);
    setForm({
      name: tutor.name,
      display_name: tutor.display_name,
      gender_style: tutor.gender_style || '',
      tone_style: tutor.tone_style || '',
      teaching_style: tutor.teaching_style || '',
      personality: tutor.personality || '',
      description: tutor.description || '',
      system_prompt: tutor.system_prompt || '',
    });
    setAvatarFile(null);
    setAvatarPreview(tutor.avatar_url ? avatarSrc(tutor) : null);
    setShowForm(true);
    setDetail(null);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
  }

  async function handleSave() {
    if (!form.name.trim() || !form.display_name.trim()) return;
    setSaving(true);
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => { if (v) fd.append(k, v); });
      if (avatarFile) fd.append('avatar', avatarFile);

      if (editing) {
        const res = await apiFetch<{ success: boolean; data: AITutor }>(`/admin/ai-tutors/${editing._id}`, {
          method: 'PUT',
          body: fd,
        });
        if (res.success) {
          setTutors((prev) => prev.map((t) => (t._id === editing._id ? res.data : t)));
          setShowForm(false);
        }
      } else {
        const res = await apiFetch<{ success: boolean; data: AITutor }>('/admin/ai-tutors', {
          method: 'POST',
          body: fd,
        });
        if (res.success) {
          setTutors((prev) => [res.data, ...prev]);
          setShowForm(false);
        }
      }
    } catch {
      // ignore
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Bạn có chắc muốn xóa AI Tutor này?')) return;
    try {
      await apiFetch(`/admin/ai-tutors/${id}`, { method: 'DELETE' });
      setTutors((prev) => prev.filter((t) => t._id !== id));
      if (detail?._id === id) setDetail(null);
    } catch {
      // ignore
    }
  }

  async function handleToggle(tutor: AITutor) {
    try {
      const res = await apiFetch<{ success: boolean; data: AITutor }>(`/admin/ai-tutors/${tutor._id}/toggle`, { method: 'PUT' });
      if (res.success) {
        setTutors((prev) => prev.map((t) => (t._id === tutor._id ? res.data : t)));
        if (detail?._id === tutor._id) setDetail(res.data);
      }
    } catch {
      // ignore
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Trợ lý AI</h1>
          <p className="text-sm text-gray-500 mt-0.5">Quản lý các trợ lý AI dạy học</p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Thêm Tutor
        </button>
      </div>

      {/* Tutor grid */}
      {tutors.length === 0 ? (
        <div className="text-center py-16">
          <Bot className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-sm text-gray-500">Chưa có AI Tutor nào</p>
          <button onClick={openCreate} className="mt-3 text-sm font-medium text-blue-600 hover:text-blue-700">Tạo tutor đầu tiên</button>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {tutors.map((t) => (
            <div
              key={t._id}
              className="rounded-xl border border-gray-200 bg-white hover:shadow-md transition-shadow cursor-pointer"
              onClick={() => setDetail(t)}
            >
              <div className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="h-12 w-12 rounded-full bg-gray-100 flex items-center justify-center overflow-hidden flex-shrink-0">
                    {avatarSrc(t) ? (
                      <img src={avatarSrc(t)!} alt={t.display_name} className="h-full w-full object-cover" />
                    ) : (
                      <Bot className="w-6 h-6 text-gray-400" />
                    )}
                  </div>
                  <span className={`text-xs font-medium px-2 py-1 rounded-full ${t.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                    {t.is_active ? 'Hoạt động' : 'Tắt'}
                  </span>
                </div>
                <h3 className="font-bold text-gray-900">{t.display_name}</h3>
                <p className="text-xs text-gray-400 font-mono mb-1">{t.code}</p>
                <p className="text-sm text-gray-500 line-clamp-2">{t.description || 'Chưa có mô tả'}</p>

                <div className="mt-3 flex flex-wrap gap-1.5">
                  {t.tone_style && <span className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full">{t.tone_style}</span>}
                  {t.teaching_style && <span className="text-xs bg-purple-50 text-purple-600 px-2 py-0.5 rounded-full">{t.teaching_style}</span>}
                  {t.personality && <span className="text-xs bg-amber-50 text-amber-600 px-2 py-0.5 rounded-full">{t.personality}</span>}
                </div>
              </div>

              <div className="border-t border-gray-100 px-5 py-3 flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                <button onClick={() => handleToggle(t)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600" title={t.is_active ? 'Tắt' : 'Bật'}>
                  {t.is_active ? <ToggleRight className="w-5 h-5 text-green-600" /> : <ToggleLeft className="w-5 h-5" />}
                </button>
                <button onClick={() => openEdit(t)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-blue-600" title="Chỉnh sửa">
                  <Pencil className="w-4 h-4" />
                </button>
                <button onClick={() => handleDelete(t._id)} className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500" title="Xóa">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Detail modal */}
      {detail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setDetail(null)}>
          <div className="bg-white rounded-xl p-6 w-full max-w-lg shadow-xl max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="h-14 w-14 rounded-full bg-gray-100 flex items-center justify-center overflow-hidden flex-shrink-0">
                  {avatarSrc(detail) ? (
                    <img src={avatarSrc(detail)!} alt={detail.display_name} className="h-full w-full object-cover" />
                  ) : (
                    <Bot className="w-7 h-7 text-gray-400" />
                  )}
                </div>
                <div>
                  <h2 className="text-lg font-bold text-gray-900">{detail.display_name}</h2>
                  <p className="text-xs text-gray-400 font-mono">{detail.code}</p>
                </div>
              </div>
              <button onClick={() => setDetail(null)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>

            <div className="space-y-3 text-sm">
              <DetailField label="Tên nội bộ" value={detail.name} />
              <DetailField label="Giới tính" value={detail.gender_style === 'nam' ? 'Nam' : detail.gender_style === 'nu' ? 'Nữ' : null} />
              <DetailField label="Giọng điệu" value={detail.tone_style} />
              <DetailField label="Phong cách dạy" value={detail.teaching_style} />
              <DetailField label="Tính cách" value={detail.personality} />
              <DetailField label="Mô tả" value={detail.description} />
              {detail.system_prompt && (
                <div>
                  <p className="text-xs font-medium text-gray-500 mb-1">Prompt hệ thống</p>
                  <pre className="text-xs bg-gray-50 rounded-lg p-3 whitespace-pre-wrap text-gray-700 max-h-48 overflow-y-auto">{detail.system_prompt}</pre>
                </div>
              )}
              <div className="flex items-center justify-between pt-2">
                <span className={`text-xs font-medium px-2 py-1 rounded-full ${detail.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                  {detail.is_active ? 'Đang hoạt động' : 'Đã tắt'}
                </span>
                <p className="text-xs text-gray-400">Tạo: {new Date(detail.createdAt).toLocaleDateString('vi-VN')}</p>
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setDetail(null)} className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg">Đóng</button>
              <button onClick={() => openEdit(detail)} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg">Chỉnh sửa</button>
            </div>
          </div>
        </div>
      )}

      {/* Create/Edit modal — horizontal layout */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowForm(false)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="text-lg font-bold text-gray-900">{editing ? 'Chỉnh sửa AI Tutor' : 'Tạo AI Tutor mới'}</h2>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>

            <div className="flex flex-col md:flex-row">
              {/* Left: avatar upload */}
              <div className="md:w-64 flex-shrink-0 p-6 md:border-r border-b md:border-b-0 border-gray-100 flex flex-col items-center justify-start gap-4">
                <div className="h-32 w-32 rounded-2xl bg-gray-50 border-2 border-dashed border-gray-200 flex items-center justify-center overflow-hidden">
                  {avatarPreview ? (
                    <img src={avatarPreview} alt="Avatar" className="h-full w-full object-cover rounded-2xl" />
                  ) : (
                    <ImageIcon className="w-10 h-10 text-gray-300" />
                  )}
                </div>
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="flex items-center gap-2 px-4 py-2 text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
                >
                  <Upload className="w-3.5 h-3.5" />
                  {avatarPreview ? 'Đổi ảnh' : 'Tải ảnh lên'}
                </button>
                {avatarPreview && (
                  <button
                    type="button"
                    onClick={() => { setAvatarFile(null); setAvatarPreview(null); }}
                    className="text-xs text-red-500 hover:text-red-600"
                  >
                    Xóa ảnh
                  </button>
                )}
                <p className="text-xs text-gray-400 text-center">JPG, PNG, WebP, SVG. Tối đa 5MB</p>
              </div>

              {/* Right: form fields */}
              <div className="flex-1 p-6 space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <FormInput label="Tên nội bộ *" value={form.name} onChange={(v) => setForm({ ...form, name: v })} placeholder="MathBot Basic" />
                  <FormInput label="Tên hiển thị *" value={form.display_name} onChange={(v) => setForm({ ...form, display_name: v })} placeholder="Thầy Toán AI" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Giới tính</label>
                    <select
                      value={form.gender_style}
                      onChange={(e) => setForm({ ...form, gender_style: e.target.value })}
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 bg-white"
                    >
                      <option value="">-- Chọn --</option>
                      <option value="nam">Nam</option>
                      <option value="nu">Nữ</option>
                    </select>
                  </div>
                  <FormInput label="Giọng điệu" value={form.tone_style} onChange={(v) => setForm({ ...form, tone_style: v })} placeholder="Thân thiện, vui vẻ" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <FormInput label="Phong cách dạy" value={form.teaching_style} onChange={(v) => setForm({ ...form, teaching_style: v })} placeholder="Hướng dẫn từng bước" />
                  <FormInput label="Tính cách" value={form.personality} onChange={(v) => setForm({ ...form, personality: v })} placeholder="Kiên nhẫn, động viên" />
                </div>
                <FormTextArea label="Mô tả" value={form.description} onChange={(v) => setForm({ ...form, description: v })} rows={2} placeholder="Mô tả ngắn về trợ lý..." />
                <FormTextArea label="Prompt hệ thống" value={form.system_prompt} onChange={(v) => setForm({ ...form, system_prompt: v })} rows={4} placeholder="Bạn là một giáo viên toán học..." />
              </div>
            </div>

            <div className="flex justify-end gap-2 px-6 py-4 border-t border-gray-100">
              <button onClick={() => setShowForm(false)} className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg">Hủy</button>
              <button
                onClick={handleSave}
                disabled={saving || !form.name.trim() || !form.display_name.trim()}
                className="px-5 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50 transition-colors"
              >
                {saving ? 'Đang lưu...' : editing ? 'Cập nhật' : 'Tạo mới'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DetailField({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div>
      <p className="text-xs font-medium text-gray-500 mb-0.5">{label}</p>
      <p className="text-sm text-gray-900">{value}</p>
    </div>
  );
}

function FormInput({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-700 mb-1">{label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
      />
    </div>
  );
}

function FormTextArea({ label, value, onChange, rows, placeholder }: { label: string; value: string; onChange: (v: string) => void; rows?: number; placeholder?: string }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-700 mb-1">{label}</label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows || 3}
        placeholder={placeholder}
        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 resize-none"
      />
    </div>
  );
}
