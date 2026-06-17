'use client';

import { useEffect, useState } from 'react';
import { Clock, CheckCircle, XCircle, FileText, BookOpen } from 'lucide-react';
import { apiClient } from '@/lib/api';

type ProposalType = 'create_class' | 'add_student' | 'publish_curriculum_template' | 'publish_lesson_template';

interface Proposal {
  _id: string;
  type: ProposalType;
  status: 'pending' | 'approved' | 'rejected';
  data: Record<string, any>;
  rejection_reason: string | null;
  createdAt: string;
  reviewed_at: string | null;
}

const statusConfig = {
  pending: { label: 'Chờ duyệt', icon: Clock, color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-200' },
  approved: { label: 'Đã duyệt', icon: CheckCircle, color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-200' },
  rejected: { label: 'Từ chối', icon: XCircle, color: 'text-red-600', bg: 'bg-red-50', border: 'border-red-200' },
};

const typeLabels: Record<ProposalType, string> = {
  create_class: 'Tạo lớp học',
  add_student: 'Thêm học sinh',
  publish_curriculum_template: 'Xuất bản giáo trình',
  publish_lesson_template: 'Xuất bản bài học',
};

function renderProposalSummary(proposal: Proposal): string {
  if (proposal.type === 'create_class') return `Lớp: ${proposal.data.name} · ${proposal.data.subject} · Khối ${proposal.data.grade_level}`;
  if (proposal.type === 'add_student') return `HS: ${proposal.data.student_name} (${proposal.data.student_email}) → ${proposal.data.class_name}`;
  if (proposal.type === 'publish_curriculum_template') return `Giáo trình: ${proposal.data.title || proposal.data.template_id} · Khối ${proposal.data.grade_level || 'N/A'}`;
  if (proposal.type === 'publish_lesson_template') return `Bài học: ${proposal.data.title || proposal.data.template_id}${proposal.data.topic ? ` · Chủ đề ${proposal.data.topic}` : ''}`;
  return '';
}

export default function TeacherProposalsPage() {
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');

  useEffect(() => {
    async function load() {
      try {
        const params = filter !== 'all' ? `?status=${filter}` : '';
        const res = await apiClient<{ success: boolean; data: Proposal[] }>(`/teacher/proposals${params}`);
        if (res.success) setProposals(res.data);
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [filter]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-emerald-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Đề xuất của tôi</h1>
        <p className="text-sm text-gray-500 mt-0.5">Theo dõi trạng thái các đề xuất gửi quản trị viên</p>
      </div>

      <div className="flex gap-2">
        {['all', 'pending', 'approved', 'rejected'].map((s) => (
          <button
            key={s}
            onClick={() => { setFilter(s); setLoading(true); }}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
              filter === s
                ? 'bg-emerald-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {s === 'all' ? 'Tất cả' : statusConfig[s as keyof typeof statusConfig].label}
          </button>
        ))}
      </div>

      {proposals.length === 0 ? (
        <div className="text-center py-16">
          <FileText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-sm text-gray-500">Chưa có đề xuất nào</p>
        </div>
      ) : (
        <div className="space-y-3">
          {proposals.map((p) => {
            const cfg = statusConfig[p.status];
            const Icon = p.type.startsWith('publish_') ? BookOpen : cfg.icon;
            return (
              <div key={p._id} className={`rounded-xl border ${cfg.border} ${cfg.bg} p-4`}>
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <Icon className={`w-5 h-5 ${cfg.color} mt-0.5`} />
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{typeLabels[p.type] || p.type}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{renderProposalSummary(p)}</p>
                      {p.rejection_reason && (
                        <p className="text-xs text-red-600 mt-1">Lý do: {p.rejection_reason}</p>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <span className={`text-xs font-medium ${cfg.color}`}>{cfg.label}</span>
                    <p className="text-xs text-gray-400 mt-0.5">{new Date(p.createdAt).toLocaleDateString('vi-VN')}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
