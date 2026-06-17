'use client';

import { useCallback, useEffect, useState } from 'react';
import { Clock, CheckCircle, XCircle, FileText, BookOpen, Users } from 'lucide-react';
import { apiClient } from '@/lib/api';

type ProposalType = 'create_class' | 'add_student' | 'publish_curriculum_template' | 'publish_lesson_template';

interface Proposal {
  _id: string;
  type: ProposalType;
  status: 'pending' | 'approved' | 'rejected';
  data: Record<string, any>;
  requester_id: { _id: string; full_name: string; email: string } | null;
  reviewed_by: { _id: string; full_name: string } | null;
  rejection_reason: string | null;
  createdAt: string;
  reviewed_at: string | null;
}

const statusConfig = {
  pending: { label: 'Chờ duyệt', icon: Clock, color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-200' },
  approved: { label: 'Đã duyệt', icon: CheckCircle, color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-200' },
  rejected: { label: 'Từ chối', icon: XCircle, color: 'text-red-600', bg: 'bg-red-50', border: 'border-red-200' },
};

const typeConfig: Record<ProposalType, { label: string; icon: typeof BookOpen }> = {
  create_class: { label: 'Tạo lớp học', icon: BookOpen },
  add_student: { label: 'Thêm học sinh', icon: Users },
  publish_curriculum_template: { label: 'Xuất bản giáo trình', icon: BookOpen },
  publish_lesson_template: { label: 'Xuất bản bài học', icon: FileText },
};

export default function AdminProposalsPage() {
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('pending');
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [processing, setProcessing] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const params = filter !== 'all' ? `?status=${filter}` : '';
      const res = await apiClient<{ success: boolean; data: Proposal[] }>(`/admin/proposals${params}`);
      if (res.success) setProposals(res.data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    queueMicrotask(() => {
      setLoading(true);
      void load();
    });
  }, [load]);

  async function handleApprove(id: string) {
    setProcessing(id);
    try {
      const res = await apiClient<{ success: boolean }>(`/admin/proposals/${id}/approve`, { method: 'PUT' });
      if (res.success) {
        setProposals((prev) => prev.filter((p) => p._id !== id));
      }
    } catch {
      // ignore
    } finally {
      setProcessing(null);
    }
  }

  async function handleReject(id: string) {
    setProcessing(id);
    try {
      const res = await apiClient<{ success: boolean }>(`/admin/proposals/${id}/reject`, {
        method: 'PUT',
        body: JSON.stringify({ reason: rejectReason }),
      });
      if (res.success) {
        setProposals((prev) => prev.filter((p) => p._id !== id));
        setRejectingId(null);
        setRejectReason('');
      }
    } catch {
      // ignore
    } finally {
      setProcessing(null);
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
      <div>
        <h1 className="text-xl font-bold text-gray-900">Duyệt đề xuất</h1>
        <p className="text-sm text-gray-500 mt-0.5">Xem và xử lý đề xuất từ giáo viên</p>
      </div>

      <div className="flex gap-2">
        {['pending', 'approved', 'rejected', 'all'].map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
              filter === s ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {s === 'all' ? 'Tất cả' : statusConfig[s as keyof typeof statusConfig].label}
          </button>
        ))}
      </div>

      {proposals.length === 0 ? (
        <div className="text-center py-16">
          <FileText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-sm text-gray-500">
            {filter === 'pending' ? 'Không có đề xuất nào chờ duyệt' : 'Không có đề xuất nào'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {proposals.map((p) => {
            const sCfg = statusConfig[p.status];
            const tCfg = typeConfig[p.type] || { label: p.type, icon: FileText };
            const TypeIcon = tCfg.icon;
            const isPending = p.status === 'pending';

            return (
              <div key={p._id} className="rounded-xl border border-gray-200 bg-white p-5">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50">
                      <TypeIcon className="w-5 h-5 text-blue-600" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{tCfg.label}</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        Giáo viên: {p.requester_id?.full_name || 'N/A'} ({p.requester_id?.email || ''})
                      </p>
                      <div className="mt-2 text-xs text-gray-600 space-y-0.5">
                        {p.type === 'create_class' && (
                          <>
                            <p>Tên lớp: <span className="font-medium">{p.data.name}</span></p>
                            <p>Môn: {p.data.subject} · Khối {p.data.grade_level}</p>
                            {p.data.schedule && <p>Lịch: {p.data.schedule}</p>}
                            {p.data.description && <p>Mô tả: {p.data.description}</p>}
                          </>
                        )}
                        {p.type === 'add_student' && (
                          <>
                            <p>Học sinh: <span className="font-medium">{p.data.student_name}</span> ({p.data.student_email})</p>
                            <p>Lớp: <span className="font-medium">{p.data.class_name}</span></p>
                          </>
                        )}
                        {p.type === 'publish_curriculum_template' && (
                          <>
                            <p>Giáo trình: <span className="font-medium">{p.data.title || p.data.template_id}</span></p>
                            <p>Khối {p.data.grade_level || 'N/A'} · Độ khó {p.data.difficulty_level || 'N/A'}</p>
                            <p>Template ID: <span className="font-mono">{p.data.template_id}</span></p>
                          </>
                        )}
                        {p.type === 'publish_lesson_template' && (
                          <>
                            <p>Bài học: <span className="font-medium">{p.data.title || p.data.template_id}</span></p>
                            <p>Khối {p.data.grade_level || 'N/A'} · Độ khó {p.data.difficulty_level || 'N/A'}{p.data.topic ? ` · Chủ đề ${p.data.topic}` : ''}</p>
                            <p>Template ID: <span className="font-mono">{p.data.template_id}</span></p>
                          </>
                        )}
                      </div>
                      {p.rejection_reason && (
                        <p className="text-xs text-red-600 mt-1">Lý do từ chối: {p.rejection_reason}</p>
                      )}
                    </div>
                  </div>

                  <div className="text-right flex-shrink-0">
                    <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full ${sCfg.bg} ${sCfg.color} ${sCfg.border} border`}>
                      <sCfg.icon className="w-3 h-3" />
                      {sCfg.label}
                    </span>
                    <p className="text-xs text-gray-400 mt-1">{new Date(p.createdAt).toLocaleDateString('vi-VN')}</p>
                  </div>
                </div>

                {isPending && (
                  <div className="mt-4 pt-3 border-t border-gray-100 flex items-center gap-2">
                    <button
                      onClick={() => handleApprove(p._id)}
                      disabled={processing === p._id}
                      className="px-4 py-2 text-xs font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg disabled:opacity-50 transition-colors"
                    >
                      {processing === p._id ? 'Đang xử lý...' : 'Duyệt'}
                    </button>

                    {rejectingId === p._id ? (
                      <div className="flex items-center gap-2 flex-1">
                        <input
                          type="text"
                          value={rejectReason}
                          onChange={(e) => setRejectReason(e.target.value)}
                          placeholder="Lý do từ chối (tùy chọn)"
                          className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-xs outline-none focus:border-red-400"
                        />
                        <button
                          onClick={() => handleReject(p._id)}
                          disabled={processing === p._id}
                          className="px-3 py-2 text-xs font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg disabled:opacity-50"
                        >
                          Xác nhận
                        </button>
                        <button
                          onClick={() => { setRejectingId(null); setRejectReason(''); }}
                          className="px-3 py-2 text-xs font-medium text-gray-600 hover:bg-gray-100 rounded-lg"
                        >
                          Hủy
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setRejectingId(p._id)}
                        className="px-4 py-2 text-xs font-medium text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      >
                        Từ chối
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
