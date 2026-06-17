'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiClient } from '@/lib/api';

// ── Types ───────────────────────────────────────────────────────────────

type TabKey = 'users' | 'revenue' | 'cohorts' | 'engagement';

interface UserActivityRecord {
  date: string;
  role: string;
  active_users: number;
  new_users: number;
  returning_users: number;
}

interface RevenueRecord {
  date: string;
  gross_revenue_vnd: number;
  refunds_vnd: number;
  mrr_vnd: number;
  new_subs: number;
  churned_subs: number;
}

interface CohortRetentionRecord {
  cohort_week: string;
  week_offset: number;
  retained_users: number;
}

interface EngagementRecord {
  date: string;
  lesson_id: string;
  student_count: number;
  avg_active_minutes: number;
  avg_focus_ratio: number;
}

interface ApiResponse<T> {
  success: boolean;
  data: T;
}

// ── Helpers ─────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('vi-VN', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

function formatVND(amount: number): string {
  return amount.toLocaleString('vi-VN') + ' ₫';
}

function getDefaultDateRange(): { from: string; to: string } {
  const now = new Date();
  const to = now.toISOString().slice(0, 10);
  const from30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const from = from30.toISOString().slice(0, 10);
  return { from, to };
}

// ── Tab Button ──────────────────────────────────────────────────────────

function TabButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
        active
          ? 'bg-blue-600 text-white shadow-sm'
          : 'text-gray-600 hover:bg-gray-100'
      }`}
      aria-pressed={active}
    >
      {label}
    </button>
  );
}

// ── Simple Line Chart (SVG) ─────────────────────────────────────────────

interface LineChartProps {
  lines: { label: string; color: string; data: number[] }[];
  labels: string[];
  height?: number;
}

function SimpleLineChart({ lines, labels, height = 200 }: LineChartProps) {
  if (lines.length === 0 || lines[0].data.length === 0) {
    return <div className="flex items-center justify-center h-48 text-gray-400 text-sm">Không có dữ liệu</div>;
  }

  const allValues = lines.flatMap((l) => l.data);
  const maxVal = Math.max(...allValues, 1);
  const minVal = Math.min(...allValues, 0);
  const range = maxVal - minVal || 1;

  const width = 700;
  const padding = { top: 20, right: 20, bottom: 30, left: 60 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  function getX(i: number): number {
    const count = lines[0].data.length;
    if (count <= 1) return padding.left + chartWidth / 2;
    return padding.left + (i / (count - 1)) * chartWidth;
  }

  function getY(val: number): number {
    return padding.top + chartHeight - ((val - minVal) / range) * chartHeight;
  }

  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full max-w-[700px] h-auto" role="img" aria-label="Line chart">
        {/* Y-axis grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map((frac) => {
          const y = padding.top + chartHeight * (1 - frac);
          const val = minVal + range * frac;
          return (
            <g key={frac}>
              <line x1={padding.left} y1={y} x2={width - padding.right} y2={y} stroke="#e5e7eb" strokeWidth="1" />
              <text x={padding.left - 8} y={y + 4} textAnchor="end" className="text-[10px] fill-gray-400">
                {val >= 1000000 ? `${(val / 1000000).toFixed(1)}M` : val >= 1000 ? `${(val / 1000).toFixed(0)}K` : Math.round(val)}
              </text>
            </g>
          );
        })}

        {/* Lines */}
        {lines.map((line) => {
          const points = line.data.map((val, i) => `${getX(i)},${getY(val)}`).join(' ');
          return (
            <polyline
              key={line.label}
              points={points}
              fill="none"
              stroke={line.color}
              strokeWidth="2"
              strokeLinejoin="round"
            />
          );
        })}

        {/* X-axis labels (show max 8) */}
        {labels.filter((_, i) => {
          const step = Math.max(1, Math.floor(labels.length / 8));
          return i % step === 0 || i === labels.length - 1;
        }).map((label) => {
          const idx = labels.indexOf(label);
          return (
            <text key={label + idx} x={getX(idx)} y={height - 5} textAnchor="middle" className="text-[9px] fill-gray-400">
              {label.slice(5)}
            </text>
          );
        })}

        {/* Legend */}
        {lines.map((line, i) => (
          <g key={line.label + 'legend'}>
            <rect x={padding.left + i * 120} y={2} width={12} height={12} rx={2} fill={line.color} />
            <text x={padding.left + i * 120 + 16} y={12} className="text-[10px] fill-gray-600">{line.label}</text>
          </g>
        ))}
      </svg>
    </div>
  );
}

// ── Cohort Heatmap ──────────────────────────────────────────────────────

function CohortHeatmap({ data }: { data: CohortRetentionRecord[] }) {
  if (data.length === 0) {
    return <div className="flex items-center justify-center h-48 text-gray-400 text-sm">Không có dữ liệu cohort</div>;
  }

  // Build matrix: rows = cohort_week, columns = week_offset
  const cohortWeeks = Array.from(new Set(data.map((d) => d.cohort_week))).sort();
  const maxOffset = Math.max(...data.map((d) => d.week_offset));

  const matrix: Record<string, Record<number, number>> = {};
  for (const row of data) {
    if (!matrix[row.cohort_week]) matrix[row.cohort_week] = {};
    matrix[row.cohort_week][row.week_offset] = row.retained_users;
  }

  const allRetained = data.map((d) => d.retained_users);
  const maxRetained = Math.max(...allRetained, 1);

  function getCellColor(value: number | undefined): string {
    if (value === undefined) return 'bg-gray-50';
    const intensity = value / maxRetained;
    if (intensity >= 0.8) return 'bg-green-600 text-white';
    if (intensity >= 0.6) return 'bg-green-400 text-white';
    if (intensity >= 0.4) return 'bg-green-300 text-gray-800';
    if (intensity >= 0.2) return 'bg-green-200 text-gray-700';
    if (intensity > 0) return 'bg-green-100 text-gray-600';
    return 'bg-gray-50 text-gray-400';
  }

  return (
    <div className="overflow-x-auto">
      <table className="text-xs border-collapse">
        <thead>
          <tr>
            <th className="px-2 py-1 text-left text-gray-500 font-medium sticky left-0 bg-white">Cohort</th>
            {Array.from({ length: maxOffset + 1 }, (_, i) => (
              <th key={i} className="px-2 py-1 text-center text-gray-500 font-medium min-w-[48px]">W{i}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {cohortWeeks.map((week) => (
            <tr key={week}>
              <td className="px-2 py-1 font-medium text-gray-700 whitespace-nowrap sticky left-0 bg-white">{week}</td>
              {Array.from({ length: maxOffset + 1 }, (_, offset) => {
                const val = matrix[week]?.[offset];
                return (
                  <td key={offset} className={`px-2 py-1 text-center rounded ${getCellColor(val)}`}>
                    {val !== undefined ? val : '—'}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── User Activity Tab ───────────────────────────────────────────────────

function UserActivityTab({ from, to }: { from: string; to: string }) {
  const [data, setData] = useState<UserActivityRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);

  const requestKey = `${from}|${to}`;
  const loading = loadedKey !== requestKey;

  useEffect(() => {
    let active = true;
    apiClient<ApiResponse<UserActivityRecord[]>>(
      `/admin/analytics/users?from=${from}&to=${to}`,
    )
      .then((res) => {
        if (!active) return;
        setData(res.data);
        setError(null);
      })
      .catch((err: unknown) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : 'Không thể tải dữ liệu');
      })
      .finally(() => {
        if (active) setLoadedKey(`${from}|${to}`);
      });
    return () => {
      active = false;
    };
  }, [from, to]);

  if (loading) return <div className="text-center text-sm text-blue-500 py-8">Đang tải...</div>;
  if (error) return <div className="rounded-xl bg-red-50 p-4 text-red-600 text-sm">{error}</div>;

  // Build chart data: aggregate DAU per date per role
  const dates = Array.from(new Set(data.map((d) => d.date))).sort();
  const roles = Array.from(new Set(data.map((d) => d.role)));
  const roleColors: Record<string, string> = {
    student: '#3b82f6',
    parent: '#10b981',
    teacher: '#f59e0b',
    admin: '#8b5cf6',
    staff: '#6b7280',
  };

  const lines = roles.map((role) => ({
    label: role,
    color: roleColors[role] || '#6b7280',
    data: dates.map((date) => {
      const record = data.find((d) => d.date === date && d.role === role);
      return record?.active_users ?? 0;
    }),
  }));

  return (
    <div className="space-y-6">
      {/* Chart */}
      <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-100">
        <h3 className="text-sm font-medium text-gray-700 mb-3">DAU theo vai trò</h3>
        <SimpleLineChart lines={lines} labels={dates} />
      </div>

      {/* Table */}
      <div className="rounded-2xl bg-white shadow-sm ring-1 ring-gray-100 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              <th className="px-4 py-3">Ngày</th>
              <th className="px-4 py-3">Vai trò</th>
              <th className="px-4 py-3 text-right">Active</th>
              <th className="px-4 py-3 text-right">Mới</th>
              <th className="px-4 py-3 text-right">Quay lại</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {data.map((row, i) => (
              <tr key={`${row.date}-${row.role}-${i}`} className="hover:bg-gray-50">
                <td className="px-4 py-2 text-xs text-gray-600 whitespace-nowrap">{formatDate(row.date)}</td>
                <td className="px-4 py-2">
                  <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium" style={{ backgroundColor: `${roleColors[row.role] || '#6b7280'}20`, color: roleColors[row.role] || '#6b7280' }}>
                    {row.role}
                  </span>
                </td>
                <td className="px-4 py-2 text-right font-medium text-gray-900">{row.active_users}</td>
                <td className="px-4 py-2 text-right text-gray-600">{row.new_users}</td>
                <td className="px-4 py-2 text-right text-gray-600">{row.returning_users}</td>
              </tr>
            ))}
            {data.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-10 text-center text-gray-400">Không có dữ liệu</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Revenue Tab ─────────────────────────────────────────────────────────

function RevenueTab({ from, to }: { from: string; to: string }) {
  const [data, setData] = useState<RevenueRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);

  const requestKey = `${from}|${to}`;
  const loading = loadedKey !== requestKey;

  useEffect(() => {
    let active = true;
    apiClient<ApiResponse<RevenueRecord[]>>(
      `/admin/analytics/revenue?from=${from}&to=${to}`,
    )
      .then((res) => {
        if (!active) return;
        setData(res.data);
        setError(null);
      })
      .catch((err: unknown) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : 'Không thể tải dữ liệu');
      })
      .finally(() => {
        if (active) setLoadedKey(`${from}|${to}`);
      });
    return () => {
      active = false;
    };
  }, [from, to]);

  if (loading) return <div className="text-center text-sm text-blue-500 py-8">Đang tải...</div>;
  if (error) return <div className="rounded-xl bg-red-50 p-4 text-red-600 text-sm">{error}</div>;

  const dates = data.map((d) => d.date);
  const lines = [
    { label: 'Doanh thu gộp', color: '#3b82f6', data: data.map((d) => d.gross_revenue_vnd) },
    { label: 'MRR', color: '#10b981', data: data.map((d) => d.mrr_vnd) },
  ];

  return (
    <div className="space-y-6">
      {/* Chart */}
      <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-100">
        <h3 className="text-sm font-medium text-gray-700 mb-3">Doanh thu & MRR</h3>
        <SimpleLineChart lines={lines} labels={dates} />
      </div>

      {/* Table */}
      <div className="rounded-2xl bg-white shadow-sm ring-1 ring-gray-100 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              <th className="px-4 py-3">Ngày</th>
              <th className="px-4 py-3 text-right">Doanh thu gộp</th>
              <th className="px-4 py-3 text-right">Hoàn tiền</th>
              <th className="px-4 py-3 text-right">MRR</th>
              <th className="px-4 py-3 text-right">Đăng ký mới</th>
              <th className="px-4 py-3 text-right">Hủy đăng ký</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {data.map((row) => (
              <tr key={row.date} className="hover:bg-gray-50">
                <td className="px-4 py-2 text-xs text-gray-600 whitespace-nowrap">{formatDate(row.date)}</td>
                <td className="px-4 py-2 text-right font-medium text-gray-900">{formatVND(row.gross_revenue_vnd)}</td>
                <td className="px-4 py-2 text-right text-red-600">{formatVND(row.refunds_vnd)}</td>
                <td className="px-4 py-2 text-right text-green-700">{formatVND(row.mrr_vnd)}</td>
                <td className="px-4 py-2 text-right text-gray-600">{row.new_subs}</td>
                <td className="px-4 py-2 text-right text-gray-600">{row.churned_subs}</td>
              </tr>
            ))}
            {data.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-gray-400">Không có dữ liệu</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Cohort Retention Tab ────────────────────────────────────────────────

function CohortRetentionTab() {
  const [data, setData] = useState<CohortRetentionRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const loading = !loaded;

  useEffect(() => {
    let active = true;
    apiClient<ApiResponse<CohortRetentionRecord[]>>('/admin/analytics/cohorts')
      .then((res) => {
        if (!active) return;
        setData(res.data);
        setError(null);
      })
      .catch((err: unknown) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : 'Không thể tải dữ liệu');
      })
      .finally(() => {
        if (active) setLoaded(true);
      });
    return () => {
      active = false;
    };
  }, []);

  if (loading) return <div className="text-center text-sm text-blue-500 py-8">Đang tải...</div>;
  if (error) return <div className="rounded-xl bg-red-50 p-4 text-red-600 text-sm">{error}</div>;

  return (
    <div className="space-y-6">
      <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-100">
        <h3 className="text-sm font-medium text-gray-700 mb-3">Cohort Retention Matrix (12 tuần)</h3>
        <p className="text-xs text-gray-400 mb-4">Số user còn active theo tuần kể từ khi đăng ký (W0 = tuần đăng ký)</p>
        <CohortHeatmap data={data} />
      </div>

      {/* Raw table */}
      <div className="rounded-2xl bg-white shadow-sm ring-1 ring-gray-100 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              <th className="px-4 py-3">Cohort Week</th>
              <th className="px-4 py-3 text-right">Week Offset</th>
              <th className="px-4 py-3 text-right">Retained Users</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {data.map((row, i) => (
              <tr key={`${row.cohort_week}-${row.week_offset}-${i}`} className="hover:bg-gray-50">
                <td className="px-4 py-2 text-gray-700 font-medium">{row.cohort_week}</td>
                <td className="px-4 py-2 text-right text-gray-600">{row.week_offset}</td>
                <td className="px-4 py-2 text-right font-medium text-gray-900">{row.retained_users}</td>
              </tr>
            ))}
            {data.length === 0 && (
              <tr><td colSpan={3} className="px-4 py-10 text-center text-gray-400">Không có dữ liệu</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Lesson Engagement Tab ───────────────────────────────────────────────

function LessonEngagementTab({ from, to }: { from: string; to: string }) {
  const [data, setData] = useState<EngagementRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);

  const requestKey = `${from}|${to}`;
  const loading = loadedKey !== requestKey;

  useEffect(() => {
    let active = true;
    apiClient<ApiResponse<EngagementRecord[]>>(
      `/admin/analytics/engagement?from=${from}&to=${to}`,
    )
      .then((res) => {
        if (!active) return;
        setData(res.data);
        setError(null);
      })
      .catch((err: unknown) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : 'Không thể tải dữ liệu');
      })
      .finally(() => {
        if (active) setLoadedKey(`${from}|${to}`);
      });
    return () => {
      active = false;
    };
  }, [from, to]);

  if (loading) return <div className="text-center text-sm text-blue-500 py-8">Đang tải...</div>;
  if (error) return <div className="rounded-xl bg-red-50 p-4 text-red-600 text-sm">{error}</div>;

  return (
    <div className="space-y-6">
      <div className="rounded-2xl bg-white shadow-sm ring-1 ring-gray-100 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              <th className="px-4 py-3">Ngày</th>
              <th className="px-4 py-3">Lesson ID</th>
              <th className="px-4 py-3 text-right">Số học sinh</th>
              <th className="px-4 py-3 text-right">Avg Active (phút)</th>
              <th className="px-4 py-3 text-right">Avg Focus Ratio</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {data.map((row, i) => (
              <tr key={`${row.date}-${row.lesson_id}-${i}`} className="hover:bg-gray-50">
                <td className="px-4 py-2 text-xs text-gray-600 whitespace-nowrap">{formatDate(row.date)}</td>
                <td className="px-4 py-2 font-mono text-xs text-gray-600">
                  {row.lesson_id.length > 12 ? row.lesson_id.slice(0, 12) + '…' : row.lesson_id}
                </td>
                <td className="px-4 py-2 text-right font-medium text-gray-900">{row.student_count}</td>
                <td className="px-4 py-2 text-right text-gray-700">{row.avg_active_minutes.toFixed(1)}</td>
                <td className="px-4 py-2 text-right text-gray-700">{(row.avg_focus_ratio * 100).toFixed(1)}%</td>
              </tr>
            ))}
            {data.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-10 text-center text-gray-400">Không có dữ liệu</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Main Page ───────────────────────────────────────────────────────────

export default function AdminAnalyticsPage() {
  const [activeTab, setActiveTab] = useState<TabKey>('users');
  const defaults = getDefaultDateRange();
  const [from, setFrom] = useState(defaults.from);
  const [to, setTo] = useState(defaults.to);

  const tabs: { key: TabKey; label: string }[] = [
    { key: 'users', label: 'Hoạt động người dùng' },
    { key: 'revenue', label: 'Doanh thu' },
    { key: 'cohorts', label: 'Giữ chân Cohort' },
    { key: 'engagement', label: 'Tương tác bài học' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold text-gray-900">Phân tích 📊</h1>

        {/* Date range filter (not for cohorts tab) */}
        {activeTab !== 'cohorts' && (
          <div className="flex items-center gap-2 text-sm">
            <label htmlFor="analytics-from" className="text-gray-500">Từ</label>
            <input
              id="analytics-from"
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
            />
            <label htmlFor="analytics-to" className="text-gray-500">đến</label>
            <input
              id="analytics-to"
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
            />
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-xl bg-gray-50 p-1 ring-1 ring-gray-100" role="tablist">
        {tabs.map((tab) => (
          <TabButton
            key={tab.key}
            label={tab.label}
            active={activeTab === tab.key}
            onClick={() => setActiveTab(tab.key)}
          />
        ))}
      </div>

      {/* Tab Content */}
      <div role="tabpanel">
        {activeTab === 'users' && <UserActivityTab from={from} to={to} />}
        {activeTab === 'revenue' && <RevenueTab from={from} to={to} />}
        {activeTab === 'cohorts' && <CohortRetentionTab />}
        {activeTab === 'engagement' && <LessonEngagementTab from={from} to={to} />}
      </div>
    </div>
  );
}
