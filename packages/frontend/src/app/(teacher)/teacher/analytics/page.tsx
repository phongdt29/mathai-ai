'use client';

import { useState, useEffect } from 'react';
import { apiClient } from '@/lib/api';
import {
  BarChart3,
  TrendingUp,
  TrendingDown,
  Users,
  Target,
  BookOpen,
  Loader2,
  PieChart,
  AlertTriangle,
} from 'lucide-react';

interface WeeklyScore {
  week: string;
  avg_score: number;
  count: number;
}

interface WeeklyAttendance {
  week: string;
  rate: number;
  total: number;
}

interface StudentProgress {
  id: string;
  full_name: string;
  class_names: string[];
  avg_score: number;
}

interface AnalyticsData {
  overall: {
    total_students: number;
    total_classes: number;
    total_assignments: number;
    avg_class_score: number | null;
    avg_attendance_rate: number | null;
  };
  trends: {
    weekly_avg_scores: WeeklyScore[];
    weekly_attendance_rate: WeeklyAttendance[];
  };
  risk_distribution: {
    low: number;
    medium: number;
    high: number;
  };
  top_progress: StudentProgress[];
  attention_needed: StudentProgress[];
}

function SimpleLineChart({ data, valueKey, label, color, maxValue }: {
  data: Array<{ week: string; [key: string]: any }>;
  valueKey: string;
  label: string;
  color: string;
  maxValue?: number;
}) {
  if (data.length === 0) {
    return <p className="text-sm text-gray-500 text-center py-8">Chưa có dữ liệu</p>;
  }

  const max = maxValue || Math.max(...data.map(d => d[valueKey] || 0), 1);
  const chartHeight = 120;

  return (
    <div>
      <div className="flex items-end gap-1" style={{ height: chartHeight }}>
        {data.map((d, i) => {
          const value = d[valueKey] || 0;
          const height = (value / max) * chartHeight;
          return (
            <div
              key={d.week}
              className="flex-1 flex flex-col items-center justify-end"
              title={`${d.week}: ${value}${maxValue === 100 ? '%' : ''}`}
            >
              <span className="text-[10px] text-gray-500 mb-1">
                {value}{maxValue === 100 ? '%' : ''}
              </span>
              <div
                className={`w-full rounded-t ${color}`}
                style={{ height: Math.max(2, height) }}
              />
            </div>
          );
        })}
      </div>
      <div className="flex justify-between mt-2 text-[10px] text-gray-400">
        <span>{data[0]?.week}</span>
        <span>{data[data.length - 1]?.week}</span>
      </div>
    </div>
  );
}

function PieChartSimple({ distribution }: { distribution: { low: number; medium: number; high: number } }) {
  const total = distribution.low + distribution.medium + distribution.high;
  if (total === 0) {
    return <p className="text-sm text-gray-500 text-center py-8">Chưa có dữ liệu</p>;
  }

  const segments = [
    { label: 'Thấp', value: distribution.low, color: 'bg-emerald-500', textColor: 'text-emerald-600' },
    { label: 'Trung bình', value: distribution.medium, color: 'bg-amber-500', textColor: 'text-amber-600' },
    { label: 'Cao', value: distribution.high, color: 'bg-red-500', textColor: 'text-red-600' },
  ];

  // Simple horizontal stacked bar as pie chart alternative
  return (
    <div className="space-y-4">
      <div className="flex h-6 rounded-full overflow-hidden bg-gray-100">
        {segments.map((seg) => {
          const pct = (seg.value / total) * 100;
          if (pct === 0) return null;
          return (
            <div
              key={seg.label}
              className={`${seg.color} transition-all`}
              style={{ width: `${pct}%` }}
              title={`${seg.label}: ${seg.value} (${Math.round(pct)}%)`}
            />
          );
        })}
      </div>
      <div className="flex justify-center gap-6">
        {segments.map((seg) => (
          <div key={seg.label} className="flex items-center gap-2">
            <div className={`w-3 h-3 rounded-full ${seg.color}`} />
            <span className="text-xs text-gray-600">{seg.label}</span>
            <span className={`text-xs font-semibold ${seg.textColor}`}>{seg.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function TeacherAnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    apiClient<{ success: boolean; data: AnalyticsData }>('/teacher/analytics')
      .then((res) => setData(res.data))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

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
        <p className="text-red-600 font-medium">Lỗi tải dữ liệu: {error}</p>
      </div>
    );
  }

  if (!data) return null;

  const overviewStats = [
    { label: 'Học sinh tổng', value: data.overall.total_students, icon: Users },
    { label: 'Tổng lớp học', value: data.overall.total_classes, icon: BookOpen },
    { label: 'Tổng bài tập', value: data.overall.total_assignments, icon: BarChart3 },
    { label: 'ĐTB chung', value: data.overall.avg_class_score ?? '—', icon: Target },
    { label: 'Tỷ lệ chuyên cần', value: data.overall.avg_attendance_rate !== null ? `${data.overall.avg_attendance_rate}%` : '—', icon: TrendingUp },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Thống kê & Phân tích</h1>
        <p className="text-sm text-gray-500 mt-0.5">Tổng quan hiệu suất giảng dạy và học tập</p>
      </div>

      {/* Overview Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {overviewStats.map((stat) => (
          <div key={stat.label} className="rounded-xl border border-gray-200 bg-white p-4">
            <div className="flex items-center gap-2 mb-2">
              <stat.icon className="w-4 h-4 text-emerald-600" />
              <span className="text-xs text-gray-500">{stat.label}</span>
            </div>
            <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Charts Row */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Weekly Avg Scores Line Chart */}
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="w-4 h-4 text-blue-600" />
            <h2 className="text-base font-semibold text-gray-900">Điểm trung bình theo tuần</h2>
          </div>
          <SimpleLineChart
            data={data.trends.weekly_avg_scores}
            valueKey="avg_score"
            label="ĐTB"
            color="bg-blue-500"
            maxValue={10}
          />
        </div>

        {/* Weekly Attendance Rate Line Chart */}
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 className="w-4 h-4 text-emerald-600" />
            <h2 className="text-base font-semibold text-gray-900">Tỷ lệ chuyên cần theo tuần</h2>
          </div>
          <SimpleLineChart
            data={data.trends.weekly_attendance_rate}
            valueKey="rate"
            label="Tỷ lệ"
            color="bg-emerald-500"
            maxValue={100}
          />
        </div>
      </div>

      {/* Risk Distribution */}
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <div className="flex items-center gap-2 mb-4">
          <PieChart className="w-4 h-4 text-purple-600" />
          <h2 className="text-base font-semibold text-gray-900">Phân bố rủi ro học tập</h2>
        </div>
        <PieChartSimple distribution={data.risk_distribution} />
      </div>

      {/* Tables Row */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Top Progress */}
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="w-4 h-4 text-emerald-600" />
            <h2 className="text-base font-semibold text-gray-900">Top tiến bộ</h2>
          </div>
          {data.top_progress.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-4">Chưa có dữ liệu</p>
          ) : (
            <div className="space-y-3">
              {data.top_progress.map((s, i) => (
                <div key={s.id} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="flex items-center justify-center w-6 h-6 rounded-full bg-emerald-100 text-xs font-bold text-emerald-700">
                      {i + 1}
                    </span>
                    <div>
                      <p className="text-sm font-medium text-gray-900">{s.full_name}</p>
                      <p className="text-xs text-gray-500">{s.class_names.join(', ')}</p>
                    </div>
                  </div>
                  <span className="text-sm font-semibold text-emerald-600">{s.avg_score}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Attention Needed */}
        <div className="rounded-xl border border-red-200 bg-red-50/30 p-5">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle className="w-4 h-4 text-red-600" />
            <h2 className="text-base font-semibold text-red-800">Cần chú ý</h2>
            <span className="text-xs text-red-600/70">(ĐTB &lt; 5.0)</span>
          </div>
          {data.attention_needed.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-4">Không có học sinh nào cần chú ý</p>
          ) : (
            <div className="space-y-3">
              {data.attention_needed.map((s) => (
                <div key={s.id} className="flex items-center justify-between rounded-lg bg-white border border-red-100 p-3">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{s.full_name}</p>
                    <p className="text-xs text-gray-500">{s.class_names.join(', ')}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-red-600">{s.avg_score}</span>
                    <TrendingDown className="w-3.5 h-3.5 text-red-400" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
