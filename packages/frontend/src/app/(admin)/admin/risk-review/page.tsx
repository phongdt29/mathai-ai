'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiClient, type ApiResponse } from '@/lib/api';

interface FraudSignal {
  _id: string;
  student_id: string;
  actor: {
    userId: string | null;
    role: string | null;
    ipAddress: string | null;
    userAgent: string | null;
  } | null;
  source_type: string;
  source_id: string | null;
  signal_type: string;
  risk_level: 'informational' | 'low' | 'medium' | 'high';
  severity: string;
  confidence: number;
  evidence: Record<string, unknown>;
  explanation: string;
  status: 'pending_review' | 'reviewed' | 'dismissed' | 'resolved';
  reviewed_by: string | null;
  reviewed_at: string | null;
  createdAt: string;
  updatedAt: string;
}

interface Filters {
  status: string;
  signal_type: string;
  source_type: string;
}

type ReviewDecision = 'reviewed' | 'dismissed' | 'resolved';

const SIGNAL_TYPE_LABELS: Record<string, string> = {
  rapid_repeated_solver_requests: 'Yêu cầu solver lặp nhanh',
  high_full_solution_dependency: 'Phụ thuộc lời giải đầy đủ cao',
  solver_usage_near_assessment: 'Dùng solver gần bài kiểm tra',
  repeated_flagged_safety_events: 'Vi phạm an toàn lặp lại',
  rapid_assessment_submission: 'Nộp bài kiểm tra quá nhanh',
  abnormal_score_jump: 'Điểm tăng bất thường',
  duplicate_answer_pattern: 'Mẫu đáp án trùng lặp',
  excessive_answer_changes: 'Thay đổi đáp án quá nhiều',
  other_risk_signal: 'Tín hiệu rủi ro khác',
};

const SOURCE_TYPE_LABELS: Record<string, string> = {
  solver: 'Solver',
  chat: 'Chat',
  ai_log: 'AI Log',
  assessment: 'Bài kiểm tra',
  manual: 'Thủ công',
  system: 'Hệ thống',
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('vi-VN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function RiskLevelBadge({ level }: { level: string }) {
  switch (level) {
    case 'high':
      return <span className="inline-flex items-center rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">🔴 Cao</span>;
    case 'medium':
      return <span className="inline-flex items-center rounded-full bg-orange-50 px-2 py-0.5 text-xs font-medium text-orange-700">🟠 Trung bình</span>;
    case 'low':
      return <span className="inline-flex items-center rounded-full bg-yellow-50 px-2 py-0.5 text-xs font-medium text-yellow-700">🟡 Thấp</span>;
    default:
      return <span className="inline-flex items-center rounded-full bg-gray-50 px-2 py-0.5 text-xs font-medium text-gray-600">ℹ️ Thông tin</span>;
  }
}

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case 'pending_review':
      return <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">⏳ Chờ xem xét</span>;
    case 'reviewed':
      return <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">✓ Đã xem xét</span>;
    case 'dismissed':
      return <span className="inline-flex items-center rounded-full bg-gray-50 px-2 py-0.5 text-xs font-medium text-gray-500">✗ Bỏ qua</span>;
    case 'resolved':
      return <span className="inline-flex items-center rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">✓ Đã giải quyết</span>;
    default:
      return <span className="inline-flex items-center rounded-full bg-gray-50 px-2 py-0.5 text-xs font-medium text-gray-500">{status}</span>;
  }
}

function ConfidenceBar({ confidence }: { confidence: number }) {
  const percent = Math.round(confidence * 100);
  const color = percent >= 80 ? 'bg-red-500' : percent >= 50 ? 'bg-orange-400' : 'bg-yellow-400';
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-16 rounded-full bg-gray-100">
        <div className={`h-1.5 rounded-full ${color}`} style={{ width: `${percent}%` }} />
      </div>
      <span className="text-xs text-gray-500">{percent}%</span>
    </div>
  );
}

export default function RiskReviewPage() {
  const [signals, setSignals] = useState<FraudSignal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [reviewNote, setReviewNote] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>({
    status: 'pending_review',
    signal_type: '',
    source_type: '',
  });

  const fetchSignals = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (filters.status) params.set('status', filters.status);
      if (filters.signal_type) params.set('signal_type', filters.signal_type);
      if (filters.source_type) params.set('source_type', filters.source_type);
      params.set('limit', '100');

      const res = await apiClient<ApiResponse<FraudSignal[]>>(`/risk-review/signals?${params.toString()}`);
      setSignals(res.data ?? []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Không thể tải dữ liệu');
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    let active = true;
    // Defer to a microtask so the loading state update does not run synchronously
    // inside the effect (react-hooks/set-state-in-effect).
    Promise.resolve().then(() => {
      if (active) void fetchSignals();
    });
    return () => {
      active = false;
    };
  }, [fetchSignals]);

  async function handleReviewAction(signalId: string, decision: ReviewDecision) {
    setActionLoading(signalId);
    try {
      await apiClient<ApiResponse<FraudSignal>>(`/risk-review/signals/${signalId}/review`, {
        method: 'POST',
        body: JSON.stringify({ decision, note: reviewNote || undefined }),
      });
      setReviewingId(null);
      setReviewNote('');
      await fetchSignals();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Không thể thực hiện hành động');
    } finally {
      setActionLoading(null);
    }
  }

  function handleFilterChange(key: keyof Filters, value: string) {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }

  function handleResetFilters() {
    setFilters({ status: 'pending_review', signal_type: '', source_type: '' });
  }

  // Filter to show only high risk signals by default in the displayed list
  const highRiskSignals = signals.filter((s) => s.risk_level === 'high');
  const displaySignals = highRiskSignals.length > 0 || filters.status ? highRiskSignals : signals;

  if (error && signals.length === 0) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-gray-900">Risk Review — Học sinh rủi ro cao 🚨</h1>
        <div className="rounded-2xl bg-red-50 p-6 text-center text-red-600">{error}</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Risk Review — Học sinh rủi ro cao 🚨</h1>
        <span className="rounded-full bg-red-100 px-3 py-1 text-sm font-medium text-red-700">
          {displaySignals.length} tín hiệu
        </span>
      </div>

      {/* Filters */}
      <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-100">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label htmlFor="filter-status" className="block text-xs font-medium text-gray-500 mb-1">Trạng thái</label>
            <select
              id="filter-status"
              value={filters.status}
              onChange={(e) => handleFilterChange('status', e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-1.5 text-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
            >
              <option value="">Tất cả</option>
              <option value="pending_review">Chờ xem xét</option>
              <option value="reviewed">Đã xem xét</option>
              <option value="dismissed">Bỏ qua</option>
              <option value="resolved">Đã giải quyết</option>
            </select>
          </div>
          <div>
            <label htmlFor="filter-signal-type" className="block text-xs font-medium text-gray-500 mb-1">Loại tín hiệu</label>
            <select
              id="filter-signal-type"
              value={filters.signal_type}
              onChange={(e) => handleFilterChange('signal_type', e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-1.5 text-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
            >
              <option value="">Tất cả</option>
              {Object.entries(SIGNAL_TYPE_LABELS).map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="filter-source-type" className="block text-xs font-medium text-gray-500 mb-1">Nguồn</label>
            <select
              id="filter-source-type"
              value={filters.source_type}
              onChange={(e) => handleFilterChange('source_type', e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-1.5 text-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
            >
              <option value="">Tất cả</option>
              {Object.entries(SOURCE_TYPE_LABELS).map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <button
              type="button"
              onClick={handleResetFilters}
              className="rounded-lg border border-gray-200 px-4 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
            >
              Xóa bộ lọc
            </button>
          </div>
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="text-center text-sm text-blue-500 py-4">Đang tải...</div>
      )}

      {/* Signals list */}
      {!loading && displaySignals.length === 0 && (
        <div className="rounded-2xl bg-green-50 p-8 text-center">
          <p className="text-green-700 font-medium">Không có tín hiệu rủi ro cao nào cần xem xét 🎉</p>
          <p className="text-green-600 text-sm mt-1">Tất cả học sinh đang trong trạng thái an toàn.</p>
        </div>
      )}

      {!loading && displaySignals.length > 0 && (
        <div className="space-y-3">
          {displaySignals.map((signal) => (
            <div
              key={signal._id}
              className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-100 hover:ring-gray-200 transition-all"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                {/* Left: Signal info */}
                <div className="flex-1 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <RiskLevelBadge level={signal.risk_level} />
                    <StatusBadge status={signal.status} />
                    <span className="text-xs text-gray-400">{formatDate(signal.createdAt)}</span>
                  </div>

                  <div className="space-y-1">
                    <p className="text-sm font-medium text-gray-800">
                      {SIGNAL_TYPE_LABELS[signal.signal_type] ?? signal.signal_type}
                    </p>
                    <p className="text-sm text-gray-600">{signal.explanation}</p>
                  </div>

                  <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500">
                    <span>
                      <span className="font-medium">Học sinh:</span>{' '}
                      <span className="font-mono">{signal.student_id.slice(0, 8)}…</span>
                    </span>
                    <span>
                      <span className="font-medium">Nguồn:</span>{' '}
                      {SOURCE_TYPE_LABELS[signal.source_type] ?? signal.source_type}
                    </span>
                    <span>
                      <span className="font-medium">Độ tin cậy:</span>{' '}
                      <ConfidenceBar confidence={signal.confidence} />
                    </span>
                  </div>
                </div>

                {/* Right: Actions */}
                <div className="flex flex-col gap-2 sm:items-end">
                  {signal.status === 'pending_review' && (
                    <>
                      {reviewingId === signal._id ? (
                        <div className="space-y-2">
                          <textarea
                            value={reviewNote}
                            onChange={(e) => setReviewNote(e.target.value)}
                            placeholder="Ghi chú (tùy chọn)..."
                            className="w-full rounded-lg border border-gray-200 px-3 py-1.5 text-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400 resize-none"
                            rows={2}
                            maxLength={500}
                          />
                          <div className="flex gap-1.5">
                            <button
                              onClick={() => handleReviewAction(signal._id, 'reviewed')}
                              disabled={actionLoading === signal._id}
                              className="rounded-lg bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
                            >
                              Xác nhận
                            </button>
                            <button
                              onClick={() => handleReviewAction(signal._id, 'dismissed')}
                              disabled={actionLoading === signal._id}
                              className="rounded-lg bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-200 disabled:opacity-50 transition-colors"
                            >
                              Bỏ qua
                            </button>
                            <button
                              onClick={() => handleReviewAction(signal._id, 'resolved')}
                              disabled={actionLoading === signal._id}
                              className="rounded-lg bg-green-600 px-3 py-1 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50 transition-colors"
                            >
                              Giải quyết
                            </button>
                            <button
                              onClick={() => { setReviewingId(null); setReviewNote(''); }}
                              className="rounded-lg border border-gray-200 px-3 py-1 text-xs font-medium text-gray-500 hover:bg-gray-50 transition-colors"
                            >
                              Hủy
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          onClick={() => setReviewingId(signal._id)}
                          className="rounded-lg bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-100 transition-colors"
                        >
                          Xem xét
                        </button>
                      )}
                    </>
                  )}
                  {signal.status !== 'pending_review' && signal.reviewed_at && (
                    <span className="text-xs text-gray-400">
                      Đã xem xét: {formatDate(signal.reviewed_at)}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Error toast */}
      {error && signals.length > 0 && (
        <div className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-600">{error}</div>
      )}
    </div>
  );
}
