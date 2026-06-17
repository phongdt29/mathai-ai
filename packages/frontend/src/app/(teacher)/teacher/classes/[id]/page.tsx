'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Users,
  BookOpen,
  ClipboardList,
  BarChart3,
  CalendarCheck,
  Clock,
  TrendingUp,
} from 'lucide-react';
import { apiClient } from '@/lib/api';

// ── Types ──

interface ClassStudent {
  _id: string;
  user_id: {
    _id: string;
    full_name: string;
    email: string;
    is_active: boolean;
  } | null;
  grade_level?: number;
  classification?: string;
}

interface ClassAssignment {
  id: string;
  title: string;
  type: string;
  status: string;
  due_date: string | null;
  total_points?: number;
}

interface ClassDetail {
  _id: string;
  name: string;
  subject: string;
  grade_level: number;
  schedule: string;
  description: string | null;
  teacher_id: string;
  student_ids: ClassStudent[];
  assignments: ClassAssignment[];
}

interface GradebookStudent {
  student_id: string;
  earned_points: number;
  max_points: number;
  percentage: number;
  entries: number;
  by_source_type: Record<string, { earned_points: number; max_points: number; percentage: number; entries: number }>;
  gradebook_entries: Array<{
    title: string;
    earned_points: number;
    max_points: number;
    percentage: number;
    status: string;
    graded_at: string | null;
  }>;
}

interface GradebookData {
  earned_points: number;
  max_points: number;
  percentage: number;
  entries: number;
  students: GradebookStudent[];
}

interface AttendanceRecord {
  student_id: string;
  full_name: string;
  email: string;
  status: 'present' | 'absent' | 'partial' | 'absent_pending' | null;
}

// ── Tab definitions ──

type TabKey = 'overview' | 'students' | 'assignments' | 'gradebook' | 'attendance';

const tabs: { key: TabKey; label: string; icon: typeof Users }[] = [
  { key: 'overview', label: 'Tổng quan', icon: BarChart3 },
  { key: 'students', label: 'Học sinh', icon: Users },
  { key: 'assignments', label: 'Bài tập', icon: ClipboardList },
  { key: 'gradebook', label: 'Sổ điểm', icon: BookOpen },
  { key: 'attendance', label: 'Điểm danh', icon: CalendarCheck },
];

const classificationLabels: Record<string, string> = {
  gioi: 'Giỏi',
  kha: 'Khá',
  trung_binh: 'TB',
  yeu: 'Yếu',
};

const statusLabels: Record<string, string> = {
  draft: 'Bản nháp',
  active: 'Đang mở',
  grading: 'Đang chấm',
  closed: 'Đã đóng',
};

const typeLabels: Record<string, string> = {
  homework: 'Bài tập',
  quiz: 'Kiểm tra ngắn',
  exam: 'Kiểm tra',
};

const attendanceStatusLabels: Record<string, { label: string; color: string }> = {
  present: { label: 'Có mặt', color: 'bg-emerald-100 text-emerald-700' },
  partial: { label: 'Muộn', color: 'bg-amber-100 text-amber-700' },
  absent_pending: { label: 'Chờ xác nhận', color: 'bg-orange-100 text-orange-700' },
  absent: { label: 'Vắng', color: 'bg-red-100 text-red-700' },
};

export default function TeacherClassDetailPage() {
  const params = useParams();
  const router = useRouter();
  const classId = params.id as string;

  const [activeTab, setActiveTab] = useState<TabKey>('overview');
  const [classData, setClassData] = useState<ClassDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Gradebook state
  const [gradebook, setGradebook] = useState<GradebookData | null>(null);
  const [gradebookLoading, setGradebookLoading] = useState(false);

  // Attendance state
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [attendanceLoading, setAttendanceLoading] = useState(false);
  const [attendanceDate, setAttendanceDate] = useState(() => {
    return new Date().toISOString().split('T')[0];
  });

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await apiClient<{ success: boolean; data: ClassDetail }>(
          `/teacher/classes/${encodeURIComponent(classId)}`
        );
        if (!cancelled && res.success) setClassData(res.data);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Không thể tải thông tin lớp học');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [classId]);

  useEffect(() => {
    if (activeTab !== 'gradebook' || gradebook) return;
    let cancelled = false;
    async function load() {
      setGradebookLoading(true);
      try {
        const res = await apiClient<{ success: boolean; data: GradebookData }>(
          `/teacher/classes/${encodeURIComponent(classId)}/gradebook`
        );
        if (!cancelled && res.success) setGradebook(res.data);
      } catch {
        // ignore
      } finally {
        if (!cancelled) setGradebookLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [activeTab, gradebook, classId]);

  useEffect(() => {
    if (activeTab !== 'attendance') return;
    let cancelled = false;
    async function load() {
      setAttendanceLoading(true);
      try {
        const res = await apiClient<{ success: boolean; data: AttendanceRecord[] }>(
          `/admin/classes/${encodeURIComponent(classId)}/attendance?date=${encodeURIComponent(attendanceDate)}`
        );
        if (!cancelled && res.success) setAttendance(res.data);
      } catch {
        if (!cancelled) setAttendance([]);
      } finally {
        if (!cancelled) setAttendanceLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [activeTab, attendanceDate, classId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-emerald-600 border-t-transparent" />
      </div>
    );
  }

  if (error || !classData) {
    return (
      <div className="space-y-4">
        <button
          onClick={() => router.push('/teacher/classes')}
          className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700"
        >
          <ArrowLeft className="w-4 h-4" />
          Quay lại
        </button>
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error || 'Không tìm thấy lớp học'}
        </div>
      </div>
    );
  }

  const students = classData.student_ids || [];
  const assignments = classData.assignments || [];
  const studentCount = students.length;
  const assignmentCount = assignments.length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <button
            onClick={() => router.push('/teacher/classes')}
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Quay lại danh sách lớp
          </button>
          <h1 className="text-xl font-bold text-gray-900">{classData.name}</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {classData.subject} · Lớp {classData.grade_level}
            {classData.schedule && ` · ${classData.schedule}`}
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-gray-200">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.key
                  ? 'border-emerald-600 text-emerald-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <div>
        {activeTab === 'overview' && (
          <OverviewTab
            classData={classData}
            studentCount={studentCount}
            assignmentCount={assignmentCount}
          />
        )}
        {activeTab === 'students' && (
          <StudentsTab students={students} />
        )}
        {activeTab === 'assignments' && (
          <AssignmentsTab assignments={assignments} />
        )}
        {activeTab === 'gradebook' && (
          <GradebookTab
            gradebook={gradebook}
            loading={gradebookLoading}
            students={students}
          />
        )}
        {activeTab === 'attendance' && (
          <AttendanceTab
            attendance={attendance}
            loading={attendanceLoading}
            date={attendanceDate}
            onDateChange={setAttendanceDate}
            students={students}
          />
        )}
      </div>
    </div>
  );
}

// ── Tab Components ──

function OverviewTab({
  classData,
  studentCount,
  assignmentCount,
}: {
  classData: ClassDetail;
  studentCount: number;
  assignmentCount: number;
}) {
  const activeAssignments = classData.assignments.filter((a) => a.status === 'active').length;
  const closedAssignments = classData.assignments.filter((a) => a.status === 'closed').length;

  return (
    <div className="space-y-6">
      {/* Stats cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <Users className="w-5 h-5 text-emerald-600 mb-2" />
          <p className="text-2xl font-bold text-gray-900">{studentCount}</p>
          <p className="text-sm text-gray-500">Học sinh</p>
        </div>
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
          <ClipboardList className="w-5 h-5 text-blue-600 mb-2" />
          <p className="text-2xl font-bold text-gray-900">{assignmentCount}</p>
          <p className="text-sm text-gray-500">Bài tập</p>
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <Clock className="w-5 h-5 text-amber-600 mb-2" />
          <p className="text-2xl font-bold text-gray-900">{activeAssignments}</p>
          <p className="text-sm text-gray-500">Đang mở</p>
        </div>
        <div className="rounded-xl border border-purple-200 bg-purple-50 p-4">
          <TrendingUp className="w-5 h-5 text-purple-600 mb-2" />
          <p className="text-2xl font-bold text-gray-900">{closedAssignments}</p>
          <p className="text-sm text-gray-500">Đã hoàn thành</p>
        </div>
      </div>

      {/* Class info */}
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <h3 className="text-base font-semibold text-gray-900 mb-3">Thông tin lớp</h3>
        <div className="grid sm:grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-gray-500">Tên lớp:</span>
            <span className="ml-2 font-medium text-gray-900">{classData.name}</span>
          </div>
          <div>
            <span className="text-gray-500">Môn học:</span>
            <span className="ml-2 font-medium text-gray-900">{classData.subject}</span>
          </div>
          <div>
            <span className="text-gray-500">Khối lớp:</span>
            <span className="ml-2 font-medium text-gray-900">Lớp {classData.grade_level}</span>
          </div>
          <div>
            <span className="text-gray-500">Lịch học:</span>
            <span className="ml-2 font-medium text-gray-900">{classData.schedule || '—'}</span>
          </div>
          {classData.description && (
            <div className="sm:col-span-2">
              <span className="text-gray-500">Mô tả:</span>
              <span className="ml-2 text-gray-900">{classData.description}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StudentsTab({ students }: { students: ClassStudent[] }) {
  if (students.length === 0) {
    return (
      <div className="py-16 text-center">
        <Users className="w-12 h-12 text-gray-300 mx-auto mb-3" />
        <p className="text-sm text-gray-500">Chưa có học sinh nào trong lớp</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100 bg-gray-50">
            <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase">STT</th>
            <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase">Họ tên</th>
            <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase">Email</th>
            <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase">Xếp loại</th>
            <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase">Trạng thái</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {students.map((s, idx) => (
            <tr key={s._id} className="hover:bg-gray-50">
              <td className="py-3 px-4 text-gray-500">{idx + 1}</td>
              <td className="py-3 px-4 font-medium text-gray-900">
                {s.user_id?.full_name || '—'}
              </td>
              <td className="py-3 px-4 text-gray-500">
                {s.user_id?.email || '—'}
              </td>
              <td className="py-3 px-4">
                <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                  {classificationLabels[s.classification || ''] || s.classification || '—'}
                </span>
              </td>
              <td className="py-3 px-4">
                {s.user_id?.is_active !== false ? (
                  <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                    Hoạt động
                  </span>
                ) : (
                  <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
                    Không hoạt động
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AssignmentsTab({ assignments }: { assignments: ClassAssignment[] }) {
  if (assignments.length === 0) {
    return (
      <div className="py-16 text-center">
        <ClipboardList className="w-12 h-12 text-gray-300 mx-auto mb-3" />
        <p className="text-sm text-gray-500">Chưa có bài tập nào</p>
        <Link
          href="/teacher/assignments"
          className="mt-3 inline-block text-sm font-medium text-emerald-600 hover:text-emerald-700"
        >
          Tạo bài tập mới
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {assignments.map((a) => (
        <div
          key={a.id}
          className="rounded-xl border border-gray-200 bg-white p-4 hover:shadow-sm transition-shadow"
        >
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-sm font-semibold text-gray-900">{a.title}</h4>
              <div className="flex items-center gap-2 mt-1 text-xs text-gray-500">
                <span>{typeLabels[a.type] || a.type}</span>
                {a.due_date && (
                  <>
                    <span>·</span>
                    <span>Hạn: {new Date(a.due_date).toLocaleDateString('vi-VN')}</span>
                  </>
                )}
                {a.total_points != null && (
                  <>
                    <span>·</span>
                    <span>{a.total_points} điểm</span>
                  </>
                )}
              </div>
            </div>
            <span
              className={`text-xs font-medium px-2.5 py-1 rounded-full ${
                a.status === 'active'
                  ? 'bg-emerald-50 text-emerald-600'
                  : a.status === 'grading'
                    ? 'bg-amber-50 text-amber-600'
                    : a.status === 'closed'
                      ? 'bg-blue-50 text-blue-600'
                      : 'bg-gray-100 text-gray-600'
              }`}
            >
              {statusLabels[a.status] || a.status}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

function GradebookTab({
  gradebook,
  loading,
  students,
}: {
  gradebook: GradebookData | null;
  loading: boolean;
  students: ClassStudent[];
}) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-7 w-7 animate-spin rounded-full border-4 border-emerald-600 border-t-transparent" />
      </div>
    );
  }

  if (!gradebook || !gradebook.students || gradebook.students.length === 0) {
    return (
      <div className="py-16 text-center">
        <BookOpen className="w-12 h-12 text-gray-300 mx-auto mb-3" />
        <p className="text-sm text-gray-500">Chưa có dữ liệu sổ điểm</p>
      </div>
    );
  }

  // Map student_id to name
  const studentNameMap: Record<string, string> = {};
  for (const s of students) {
    if (s.user_id) {
      studentNameMap[s._id] = s.user_id.full_name;
    }
  }

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <p className="text-2xl font-bold text-gray-900">{gradebook.percentage?.toFixed(1) ?? '—'}%</p>
            <p className="text-xs text-gray-500">Điểm trung bình lớp</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-gray-900">{gradebook.entries}</p>
            <p className="text-xs text-gray-500">Tổng bài đã chấm</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-gray-900">{gradebook.students.length}</p>
            <p className="text-xs text-gray-500">Học sinh có điểm</p>
          </div>
        </div>
      </div>

      {/* Per-student table */}
      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase">Học sinh</th>
              <th className="text-center py-3 px-4 text-xs font-medium text-gray-500 uppercase">Số bài</th>
              <th className="text-center py-3 px-4 text-xs font-medium text-gray-500 uppercase">Điểm đạt</th>
              <th className="text-center py-3 px-4 text-xs font-medium text-gray-500 uppercase">Tổng điểm</th>
              <th className="text-center py-3 px-4 text-xs font-medium text-gray-500 uppercase">Tỉ lệ %</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {gradebook.students.map((gs) => (
              <tr key={gs.student_id} className="hover:bg-gray-50">
                <td className="py-3 px-4 font-medium text-gray-900">
                  {studentNameMap[gs.student_id] || gs.student_id}
                </td>
                <td className="py-3 px-4 text-center text-gray-600">{gs.entries}</td>
                <td className="py-3 px-4 text-center text-gray-600">{gs.earned_points}</td>
                <td className="py-3 px-4 text-center text-gray-600">{gs.max_points}</td>
                <td className="py-3 px-4 text-center">
                  <span
                    className={`font-semibold ${
                      gs.percentage >= 70
                        ? 'text-emerald-600'
                        : gs.percentage >= 50
                          ? 'text-amber-600'
                          : 'text-red-500'
                    }`}
                  >
                    {gs.percentage?.toFixed(1)}%
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AttendanceTab({
  attendance,
  loading,
  date,
  onDateChange,
  students,
}: {
  attendance: AttendanceRecord[];
  loading: boolean;
  date: string;
  onDateChange: (d: string) => void;
  students: ClassStudent[];
}) {
  // Build display list from students + attendance records
  const displayList = students.map((s) => {
    const record = attendance.find(
      (a) => a.student_id === s._id || a.student_id === s.user_id?._id
    );
    return {
      student_id: s._id,
      full_name: record?.full_name || s.user_id?.full_name || '—',
      email: record?.email || s.user_id?.email || '—',
      status: record?.status || null,
    };
  });

  return (
    <div className="space-y-4">
      {/* Date picker */}
      <div className="flex items-center gap-3">
        <label className="text-sm font-medium text-gray-700">Ngày:</label>
        <input
          type="date"
          value={date}
          onChange={(e) => onDateChange(e.target.value)}
          className="rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="h-7 w-7 animate-spin rounded-full border-4 border-emerald-600 border-t-transparent" />
        </div>
      ) : displayList.length === 0 ? (
        <div className="py-16 text-center">
          <CalendarCheck className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-sm text-gray-500">Chưa có dữ liệu điểm danh</p>
        </div>
      ) : (
        <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase">STT</th>
                <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase">Họ tên</th>
                <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase">Email</th>
                <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase">Trạng thái</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {displayList.map((row, idx) => {
                const statusInfo = row.status
                  ? attendanceStatusLabels[row.status]
                  : null;
                return (
                  <tr key={row.student_id} className="hover:bg-gray-50">
                    <td className="py-3 px-4 text-gray-500">{idx + 1}</td>
                    <td className="py-3 px-4 font-medium text-gray-900">{row.full_name}</td>
                    <td className="py-3 px-4 text-gray-500">{row.email}</td>
                    <td className="py-3 px-4">
                      {statusInfo ? (
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusInfo.color}`}>
                          {statusInfo.label}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400">Chưa điểm danh</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
