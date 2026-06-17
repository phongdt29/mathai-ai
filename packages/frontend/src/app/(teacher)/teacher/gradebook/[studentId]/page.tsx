'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { apiClient } from '@/lib/api';
import {
  ArrowLeft,
  BookOpen,
  Calendar,
  AlertTriangle,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  TrendingUp,
} from 'lucide-react';

interface AssignmentScore {
  assignment_id: string;
  title: string;
  type: string;
  total_points: number;
  score: number | null;
  is_late: boolean;
  submitted_at: string | null;
  graded_at: string | null;
  feedback: string | null;
}

interface AttendanceEntry {
  date: string;
  status: string;
  active_duration_seconds: number | null;
  focus_ratio: number | null;
}

interface RiskEntry {
  date: string;
  risk_score: number;
  risk_level: string;
}

interface StudentGradebookDetail {
  student: {
    id: string;
    full_name: string;
    email: string;
    grade_level: number | null;
    classes: Array<{ id: string; name: string }>;
  };
  assignment_scores: AssignmentScore[];
  attendance_history: AttendanceEntry[];
  risk_history: RiskEntry[];
}

function statusBadge(status: string) {
  switch (status) {
    case 'present':
      return <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700"><CheckCircle2 className="w-3 h-3" />Có mặt</span>;
    case 'partial':
      return <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700"><Clock className="w-3 h-3" />Một phần</span>;
    case 'absent_pending':
      return <span className="inline-flex items-center gap-1 rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-700"><AlertTriangle className="w-3 h-3" />Chờ xác nhận</span>;
    case 'absent':
      return <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700"><XCircle className="w-3 h-3" />Vắng</span>;
    default:
      return <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">{status}</span>;
  }
}

function riskLevelBadge(level: string) {
  switch (level) {
    case 'low':
      return <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">Thấp</span>;
    case 'medium':
      return <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">Trung bình</span>;
    case 'high':
      return <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">Cao</span>;
    default:
      return <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">{level}</span>;
  }
}

export default function TeacherGradebookStudentPage() {
  const params = useParams();
  const router = useRouter();
  const studentId = params.studentId as string;

  const [data, setData] = useState<StudentGradebookDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<'scores' | 'attendance' | 'risk'>('scores');

  useEffect(() => {
    if (!studentId) return;
    apiClient<{ success: boolean; data: StudentGradebookDetail }>(`/teacher/gradebook/students/${studentId}`)
      .then((res) => setData(res.data))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [studentId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-emerald-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center">
        <p className="text-red-600 font-medium">Lỗi: {error}</p>
      </div>
    );
  }

  if (!data) return null;

  const tabs = [
    { key: 'scores' as const, label: 'Điểm bài tập', icon: BookOpen },
    { key: 'attendance' as const, label: 'Điểm danh', icon: Calendar },
    { key: 'risk' as const, label: 'Rủi ro học tập', icon: AlertTriangle },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => router.back()}
          className="rounded-lg border border-gray-200 p-2 hover:bg-gray-50 transition-colors"
          aria-label="Quay lại"
        >
          <ArrowLeft className="w-4 h-4 text-gray-600" />
        </button>
        <div>
          <h1 className="text-xl font-bold text-gray-900">{data.student.full_name}</h1>
          <p className="text-sm text-gray-500">
            {data.student.email}
            {data.student.grade_level && ` · Lớp ${data.student.grade_level}`}
            {data.student.classes.length > 0 && ` · ${data.student.classes.map(c => c.name).join(', ')}`}
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-lg bg-gray-100 p-1">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'scores' && (
        <div className="rounded-xl border border-gray-200 bg-white">
          <div className="border-b border-gray-100 px-5 py-4">
            <h2 className="font-semibold text-gray-900">Điểm bài tập ({data.assignment_scores.length})</h2>
          </div>
          {data.assignment_scores.length === 0 ? (
            <div className="p-8 text-center text-sm text-gray-500">Chưa có bài nộp nào</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                  <tr>
                    <th className="px-5 py-3 text-left">Bài tập</th>
                    <th className="px-5 py-3 text-center">Loại</th>
                    <th className="px-5 py-3 text-center">Điểm</th>
                    <th className="px-5 py-3 text-center">Trạng thái</th>
                    <th className="px-5 py-3 text-center">Ngày nộp</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {data.assignment_scores.map((s, i) => (
                    <tr key={`${s.assignment_id}-${i}`} className="hover:bg-gray-50">
                      <td className="px-5 py-3 font-medium text-gray-900">{s.title}</td>
                      <td className="px-5 py-3 text-center text-gray-600 capitalize">{s.type}</td>
                      <td className="px-5 py-3 text-center">
                        {s.score !== null ? (
                          <span className={`font-semibold ${(s.score / s.total_points) >= 0.75 ? 'text-emerald-600' : (s.score / s.total_points) >= 0.5 ? 'text-amber-600' : 'text-red-500'}`}>
                            {s.score}/{s.total_points}
                          </span>
                        ) : (
                          <span className="text-gray-400">Chưa chấm</span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-center">
                        {s.is_late && (
                          <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">Nộp trễ</span>
                        )}
                        {!s.is_late && s.graded_at && (
                          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">Đã chấm</span>
                        )}
                        {!s.is_late && !s.graded_at && (
                          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">Đã nộp</span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-center text-gray-500 text-xs">
                        {s.submitted_at ? new Date(s.submitted_at).toLocaleDateString('vi-VN') : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === 'attendance' && (
        <div className="rounded-xl border border-gray-200 bg-white">
          <div className="border-b border-gray-100 px-5 py-4">
            <h2 className="font-semibold text-gray-900">Lịch sử điểm danh ({data.attendance_history.length} buổi gần nhất)</h2>
          </div>
          {data.attendance_history.length === 0 ? (
            <div className="p-8 text-center text-sm text-gray-500">Chưa có dữ liệu điểm danh</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                  <tr>
                    <th className="px-5 py-3 text-left">Ngày</th>
                    <th className="px-5 py-3 text-center">Trạng thái</th>
                    <th className="px-5 py-3 text-center">Thời gian học (phút)</th>
                    <th className="px-5 py-3 text-center">Tập trung</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {data.attendance_history.map((a, i) => (
                    <tr key={`${a.date}-${i}`} className="hover:bg-gray-50">
                      <td className="px-5 py-3 font-medium text-gray-900">{a.date}</td>
                      <td className="px-5 py-3 text-center">{statusBadge(a.status)}</td>
                      <td className="px-5 py-3 text-center text-gray-600">
                        {a.active_duration_seconds !== null ? Math.round(a.active_duration_seconds / 60) : '—'}
                      </td>
                      <td className="px-5 py-3 text-center text-gray-600">
                        {a.focus_ratio !== null ? `${Math.round(a.focus_ratio * 100)}%` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === 'risk' && (
        <div className="rounded-xl border border-gray-200 bg-white">
          <div className="border-b border-gray-100 px-5 py-4">
            <h2 className="font-semibold text-gray-900">Lịch sử rủi ro học tập</h2>
          </div>
          {data.risk_history.length === 0 ? (
            <div className="p-8 text-center text-sm text-gray-500">Chưa có dữ liệu rủi ro</div>
          ) : (
            <>
              {/* Simple bar visualization */}
              <div className="px-5 py-4">
                <div className="flex items-end gap-1 h-32">
                  {[...data.risk_history].reverse().map((r, i) => (
                    <div
                      key={`${r.date}-${i}`}
                      className="flex-1 flex flex-col items-center gap-1"
                      title={`${r.date}: ${r.risk_score}/100 (${r.risk_level})`}
                    >
                      <div
                        className={`w-full rounded-t transition-all ${
                          r.risk_level === 'high' ? 'bg-red-400' :
                          r.risk_level === 'medium' ? 'bg-amber-400' : 'bg-emerald-400'
                        }`}
                        style={{ height: `${Math.max(4, r.risk_score)}%` }}
                      />
                    </div>
                  ))}
                </div>
                <div className="flex justify-between mt-2 text-xs text-gray-400">
                  <span>{data.risk_history[data.risk_history.length - 1]?.date}</span>
                  <span>{data.risk_history[0]?.date}</span>
                </div>
              </div>
              {/* Table */}
              <div className="overflow-x-auto border-t border-gray-100">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                    <tr>
                      <th className="px-5 py-3 text-left">Ngày</th>
                      <th className="px-5 py-3 text-center">Điểm rủi ro</th>
                      <th className="px-5 py-3 text-center">Mức độ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {data.risk_history.map((r, i) => (
                      <tr key={`${r.date}-${i}`} className="hover:bg-gray-50">
                        <td className="px-5 py-3 font-medium text-gray-900">{r.date}</td>
                        <td className="px-5 py-3 text-center">
                          <span className={`font-semibold ${r.risk_score >= 70 ? 'text-red-600' : r.risk_score >= 40 ? 'text-amber-600' : 'text-emerald-600'}`}>
                            {r.risk_score}
                          </span>
                          <span className="text-gray-400">/100</span>
                        </td>
                        <td className="px-5 py-3 text-center">{riskLevelBadge(r.risk_level)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
