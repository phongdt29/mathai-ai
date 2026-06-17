"use client";

import {
	ArrowLeft,
	Award,
	BookOpen,
	Calendar,
	ChevronDown,
	ChevronLeft,
	ChevronRight,
	ChevronUp,
	ClipboardList,
	Search,
	Trash2,
	UserPlus,
	Users,
	X,
} from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiClient } from "@/lib/api";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ClassFullDetail {
	_id: string;
	name: string;
	subject: string;
	grade_level: number;
	schedule: string;
	description: string | null;
	is_active: boolean;
	createdAt: string;
	teacher: { _id: string; full_name: string; email: string } | null;
	students?: StudentDetail[];
	assignments?: AssignmentDetail[];
	stats?: {
		student_count: number;
		total_assignments: number;
		active_assignments: number;
		total_submissions: number;
		graded_submissions: number;
		class_avg_score: number | null;
		attendance_rate: number | null;
	};
}

interface ApiResponse<T> {
	success: boolean;
	data: T;
	message?: string;
}

const emptyStats = {
	student_count: 0,
	total_assignments: 0,
	active_assignments: 0,
	total_submissions: 0,
	graded_submissions: 0,
	class_avg_score: null,
	attendance_rate: null,
};

interface StudentDetail {
	_id: string;
	full_name: string;
	email: string;
	is_active: boolean;
	submissions: { total: number; graded: number; avg_score: number | null };
	attendance: {
		total: number;
		present: number;
		absent: number;
		partial: number;
		rate: number | null;
	};
}

interface AssignmentDetail {
	_id: string;
	title: string;
	description: string | null;
	type: "homework" | "quiz" | "exam";
	status: "draft" | "active" | "grading" | "closed";
	due_date: string | null;
	total_points: number;
	createdAt: string;
	submissions: {
		submitted: number;
		graded: number;
		avg_score: number | null;
		details: {
			student_id: string;
			score: number | null;
			feedback: string | null;
			submitted_at: string;
			graded_at: string | null;
		}[];
	};
}

interface AttendanceEntry {
	student_id: string;
	full_name: string;
	email: string;
	status: "present" | "absent" | "partial" | "unmarked";
	status_reason: string | null;
}

interface AvailableStudent {
	_id: string;
	full_name: string;
	email: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const typeLabels: Record<string, string> = {
	homework: "Bài tập",
	quiz: "Kiểm tra ngắn",
	exam: "Kiểm tra",
};
const statusLabels: Record<string, string> = {
	draft: "Nháp",
	active: "Đang mở",
	grading: "Đang chấm",
	closed: "Đóng",
};
const attendanceLabels: Record<string, string> = {
	present: "Có mặt",
	absent: "Vắng",
	partial: "Muộn",
	unmarked: "Chưa điểm danh",
};

const typeBadge: Record<string, string> = {
	homework: "bg-blue-100 text-blue-700",
	quiz: "bg-purple-100 text-purple-700",
	exam: "bg-red-100 text-red-700",
};

const statusBadge: Record<string, string> = {
	draft: "bg-gray-100 text-gray-600",
	active: "bg-green-100 text-green-700",
	grading: "bg-yellow-100 text-yellow-700",
	closed: "bg-red-100 text-red-600",
};

type Tab = "students" | "assignments" | "attendance" | "grades";

const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
	{ key: "students", label: "Học sinh", icon: <Users className="h-4 w-4" /> },
	{
		key: "assignments",
		label: "Bài tập",
		icon: <BookOpen className="h-4 w-4" />,
	},
	{
		key: "attendance",
		label: "Điểm danh",
		icon: <Calendar className="h-4 w-4" />,
	},
	{ key: "grades", label: "Bảng điểm", icon: <Award className="h-4 w-4" /> },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtDate(iso: string) {
	const d = new Date(iso);
	return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

function toISODate(d: Date) {
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function scoreColor(score: number | null | undefined): string {
	if (score == null) return "text-gray-400";
	if (score >= 8) return "text-green-600 font-semibold";
	if (score >= 5) return "text-amber-600 font-semibold";
	return "text-red-600 font-semibold";
}

// ---------------------------------------------------------------------------
// Main Page Component
// ---------------------------------------------------------------------------

export default function AdminClassDetailPage() {
	const params = useParams();
	const classId = params.id as string;

	const [data, setData] = useState<ClassFullDetail | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");
	const [activeTab, setActiveTab] = useState<Tab>("students");

	// Student picker modal
	const [showStudentPicker, setShowStudentPicker] = useState(false);
	const [availableStudents, setAvailableStudents] = useState<
		AvailableStudent[]
	>([]);
	const [studentSearch, setStudentSearch] = useState("");
	const [addingStudent, setAddingStudent] = useState<string | null>(null);

	// Attendance state
	const [attendanceDate, setAttendanceDate] = useState<Date>(new Date());
	const [attendanceRecords, setAttendanceRecords] = useState<AttendanceEntry[]>(
		[],
	);
	const [attendanceLoading, setAttendanceLoading] = useState(false);
	const [attendanceSaving, setAttendanceSaving] = useState(false);
	const [attendanceMsg, setAttendanceMsg] = useState("");

	// Assignment expand
	const [expandedAssignment, setExpandedAssignment] = useState<string | null>(
		null,
	);

	// Confirm remove student
	const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
	const [removing, setRemoving] = useState(false);

	// ------ Data fetching ------

	const fetchData = useCallback(async () => {
		setLoading(true);
		setError("");
		try {
			const res = await apiClient<ApiResponse<ClassFullDetail>>(
				`/admin/classes/${classId}/full-detail`,
			);
			setData(res.data);
		} catch {
			setError("Không thể tải dữ liệu lớp học.");
		} finally {
			setLoading(false);
		}
	}, [classId]);

	useEffect(() => {
		let isActive = true;

		queueMicrotask(() => {
			if (isActive) {
				void fetchData();
			}
		});

		return () => {
			isActive = false;
		};
	}, [fetchData]);

	const fetchAttendance = useCallback(
		async (date: Date) => {
			setAttendanceLoading(true);
			setAttendanceMsg("");
			try {
				const res = await apiClient<ApiResponse<AttendanceEntry[]>>(
					`/admin/classes/${classId}/attendance?date=${toISODate(date)}`,
				);
				setAttendanceRecords(res.data ?? []);
			} catch {
				setAttendanceRecords([]);
			} finally {
				setAttendanceLoading(false);
			}
		},
		[classId],
	);

	useEffect(() => {
		let isActive = true;

		queueMicrotask(() => {
			if (isActive && activeTab === "attendance") {
				void fetchAttendance(attendanceDate);
			}
		});

		return () => {
			isActive = false;
		};
	}, [activeTab, attendanceDate, fetchAttendance]);

	// ------ Handlers ------

	async function handleAddStudent(studentId: string) {
		setAddingStudent(studentId);
		try {
			await apiClient(`/admin/classes/${classId}/students`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ student_id: studentId }),
			});
			setShowStudentPicker(false);
			setStudentSearch("");
			await fetchData();
		} catch {
			/* silently fail */
		} finally {
			setAddingStudent(null);
		}
	}

	async function handleRemoveStudent(studentId: string) {
		setRemoving(true);
		try {
			await apiClient(`/admin/classes/${classId}/students/${studentId}`, {
				method: "DELETE",
			});
			setConfirmRemove(null);
			await fetchData();
		} catch {
			/* silently fail */
		} finally {
			setRemoving(false);
		}
	}

	async function openStudentPicker() {
		setShowStudentPicker(true);
		try {
			const res = await apiClient<ApiResponse<AvailableStudent[]>>("/admin/students-list");
			setAvailableStudents(res.data ?? []);
		} catch {
			setAvailableStudents([]);
		}
	}

	function updateAttendanceStatus(
		studentId: string,
		status: AttendanceEntry["status"],
	) {
		setAttendanceRecords((prev) =>
			prev.map((r) => (r.student_id === studentId ? { ...r, status } : r)),
		);
	}

	function updateAttendanceReason(studentId: string, reason: string) {
		setAttendanceRecords((prev) =>
			prev.map((r) =>
				r.student_id === studentId
					? { ...r, status_reason: reason || null }
					: r,
			),
		);
	}

	async function saveAttendance() {
		setAttendanceSaving(true);
		setAttendanceMsg("");
		try {
			await apiClient(`/admin/classes/${classId}/attendance`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					date: toISODate(attendanceDate),
					records: attendanceRecords.map((r) => ({
						student_id: r.student_id,
						status: r.status,
						status_reason: r.status_reason,
					})),
				}),
			});
			setAttendanceMsg("Đã lưu điểm danh thành công!");
		} catch {
			setAttendanceMsg("Lưu điểm danh thất bại.");
		} finally {
			setAttendanceSaving(false);
		}
	}

	function shiftDate(days: number) {
		setAttendanceDate((prev) => {
			const next = new Date(prev);
			next.setDate(next.getDate() + days);
			return next;
		});
	}

	// ------ Filtered students for picker ------

	const students = useMemo(() => data?.students ?? [], [data?.students]);
	const assignments = useMemo(() => data?.assignments ?? [], [data?.assignments]);
	const stats = data?.stats ?? emptyStats;

	const enrolledIds = useMemo(
		() => new Set(students.map((s) => s._id)),
		[students],
	);

	const filteredPickerStudents = useMemo(() => {
		const q = studentSearch.toLowerCase();
		return availableStudents
			.filter((s) => !enrolledIds.has(s._id))
			.filter(
				(s) =>
					s.full_name.toLowerCase().includes(q) ||
					s.email.toLowerCase().includes(q),
			);
	}, [availableStudents, enrolledIds, studentSearch]);

	// ------ Grade sheet data ------

	type GradeRow = {
		student: StudentDetail;
		scores: (number | null | "ungraded")[];
		avg: number | null;
	};
	type GradeSheetData = {
		assignments: AssignmentDetail[];
		rows: GradeRow[];
		assignmentAvgs: (number | null)[];
	};

	const gradeSheet = useMemo<GradeSheetData>(() => {
		if (!data) return { assignments: [], rows: [], assignmentAvgs: [] };
		const rows = students.map((student) => {
			const scores: (number | null | "ungraded")[] = assignments.map((a) => {
				const sub = a.submissions.details.find(
					(d) => d.student_id === student._id,
				);
				if (!sub) return null;
				if (sub.score == null) return "ungraded";
				return sub.score;
			});
			const numericScores = scores.filter(
				(s): s is number => typeof s === "number",
			);
			const avg =
				numericScores.length > 0
					? numericScores.reduce((a, b) => a + b, 0) / numericScores.length
					: null;
			return { student, scores, avg };
		});
		const assignmentAvgs = assignments.map((a) => a.submissions.avg_score);
		return { assignments, rows, assignmentAvgs };
	}, [data, assignments, students]);

	// ------ Render ------

	if (loading) {
		return (
			<div className="flex min-h-[60vh] items-center justify-center">
				<div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
			</div>
		);
	}

	if (error || !data) {
		return (
			<div className="p-8">
				<Link
					href="/admin/classes"
					className="mb-4 inline-flex items-center gap-1 text-sm text-blue-600 hover:underline"
				>
					<ArrowLeft className="h-4 w-4" /> Quản lý lớp học
				</Link>
				<p className="mt-4 text-red-600">
					{error || "Không tìm thấy lớp học."}
				</p>
			</div>
		);
	}

	return (
		<div className="space-y-6 p-4 md:p-8">
			{/* ============ HEADER ============ */}
			<div>
				<Link
					href="/admin/classes"
					className="mb-3 inline-flex items-center gap-1 text-sm text-blue-600 hover:underline"
				>
					<ArrowLeft className="h-4 w-4" /> Quản lý lớp học
				</Link>

				<div className="flex flex-wrap items-start justify-between gap-4">
					<div>
						<h1 className="text-2xl font-bold text-gray-900">{data.name}</h1>
						<p className="mt-1 text-sm text-gray-500">
							{data.subject} · Khối {data.grade_level}
							{data.teacher ? ` · GV: ${data.teacher.full_name}` : ""}
							{" · Tạo "}
							{fmtDate(data.createdAt)}
						</p>
					</div>
					<span
						className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${
							data.is_active
								? "bg-green-100 text-green-700"
								: "bg-red-100 text-red-700"
						}`}
					>
						<span
							className={`h-2 w-2 rounded-full ${data.is_active ? "bg-green-500" : "bg-red-500"}`}
						/>
						{data.is_active ? "Hoạt động" : "Đã khóa"}
					</span>
				</div>
			</div>

			{/* ============ STAT CARDS ============ */}
			<div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-7">
				<StatCard
					icon={<Users className="h-5 w-5 text-blue-600" />}
					label="Học sinh"
					value={stats.student_count}
				/>
				<StatCard
					icon={<BookOpen className="h-5 w-5 text-indigo-600" />}
					label="Bài tập"
					value={stats.total_assignments}
				/>
				<StatCard
					icon={<ClipboardList className="h-5 w-5 text-green-600" />}
					label="Bài đang mở"
					value={stats.active_assignments}
				/>
				<StatCard
					icon={<ClipboardList className="h-5 w-5 text-cyan-600" />}
					label="Bài nộp"
					value={stats.total_submissions}
				/>
				<StatCard
					icon={<Award className="h-5 w-5 text-purple-600" />}
					label="Đã chấm"
					value={stats.graded_submissions}
				/>
				<StatCard
					icon={<Award className="h-5 w-5 text-amber-600" />}
					label="ĐTB lớp"
					value={
						stats.class_avg_score != null
							? stats.class_avg_score.toFixed(1)
							: "—"
					}
				/>
				<StatCard
					icon={<Calendar className="h-5 w-5 text-teal-600" />}
					label="Tỷ lệ đi học"
					value={
						stats.attendance_rate != null
							? `${stats.attendance_rate.toFixed(0)}%`
							: "—"
					}
				/>
			</div>

			{/* ============ TABS ============ */}
			<div className="rounded-xl border border-gray-200 bg-white">
				<div className="flex border-b border-gray-200">
					{tabs.map((t) => (
						<button
							key={t.key}
							onClick={() => setActiveTab(t.key)}
							className={`inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium transition-colors ${
								activeTab === t.key
									? "border-b-2 border-blue-600 text-blue-600"
									: "text-gray-500 hover:text-gray-700"
							}`}
						>
							{t.icon}
							{t.label}
						</button>
					))}
				</div>

				<div className="p-4 md:p-6">
					{activeTab === "students" && (
						<StudentsTab
							students={students}
							totalStudents={stats.student_count}
							onAdd={openStudentPicker}
							onRemove={(id) => setConfirmRemove(id)}
						/>
					)}
					{activeTab === "assignments" && (
						<AssignmentsTab
							assignments={assignments}
							students={students}
							expandedId={expandedAssignment}
							onToggle={(id) =>
								setExpandedAssignment(expandedAssignment === id ? null : id)
							}
						/>
					)}
					{activeTab === "attendance" && (
						<AttendanceTab
							date={attendanceDate}
							records={attendanceRecords}
							loading={attendanceLoading}
							saving={attendanceSaving}
							message={attendanceMsg}
							onShiftDate={shiftDate}
							onChangeStatus={updateAttendanceStatus}
							onChangeReason={updateAttendanceReason}
							onSave={saveAttendance}
						/>
					)}
					{activeTab === "grades" && (
						<GradeSheet
							assignments={gradeSheet.assignments}
							rows={gradeSheet.rows}
							assignmentAvgs={gradeSheet.assignmentAvgs}
						/>
					)}
				</div>
			</div>

			{/* ============ STUDENT PICKER MODAL ============ */}
			{showStudentPicker && (
				<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
					<div className="mx-4 w-full max-w-lg rounded-xl bg-white shadow-xl">
						<div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
							<h3 className="text-lg font-semibold text-gray-900">
								Thêm học sinh
							</h3>
							<button
								onClick={() => {
									setShowStudentPicker(false);
									setStudentSearch("");
								}}
								className="text-gray-400 hover:text-gray-600"
							>
								<X className="h-5 w-5" />
							</button>
						</div>
						<div className="px-6 py-3">
							<div className="relative">
								<Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
								<input
									type="text"
									placeholder="Tìm theo tên hoặc email..."
									value={studentSearch}
									onChange={(e) => setStudentSearch(e.target.value)}
									className="w-full rounded-lg border border-gray-200 py-2 pl-10 pr-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
								/>
							</div>
						</div>
						<div className="max-h-72 overflow-y-auto px-6 pb-4">
							{filteredPickerStudents.length === 0 ? (
								<p className="py-4 text-center text-sm text-gray-500">
									Không tìm thấy học sinh phù hợp.
								</p>
							) : (
								<ul className="divide-y divide-gray-100">
									{filteredPickerStudents.map((s) => (
										<li
											key={s._id}
											className="flex items-center justify-between py-2.5"
										>
											<div>
												<p className="text-sm font-medium text-gray-900">
													{s.full_name}
												</p>
												<p className="text-xs text-gray-500">{s.email}</p>
											</div>
											<button
												onClick={() => handleAddStudent(s._id)}
												disabled={addingStudent === s._id}
												className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
											>
												{addingStudent === s._id ? "Đang thêm..." : "Thêm"}
											</button>
										</li>
									))}
								</ul>
							)}
						</div>
					</div>
				</div>
			)}

			{/* ============ CONFIRM REMOVE MODAL ============ */}
			{confirmRemove && (
				<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
					<div className="mx-4 w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">
						<h3 className="text-lg font-semibold text-gray-900">
							Xác nhận xóa
						</h3>
						<p className="mt-2 text-sm text-gray-600">
							Bạn có chắc muốn xóa học sinh này khỏi lớp?
						</p>
						<div className="mt-4 flex justify-end gap-3">
							<button
								onClick={() => setConfirmRemove(null)}
								className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
							>
								Hủy
							</button>
							<button
								onClick={() => handleRemoveStudent(confirmRemove)}
								disabled={removing}
								className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
							>
								{removing ? "Đang xóa..." : "Xóa"}
							</button>
						</div>
					</div>
				</div>
			)}
		</div>
	);
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatCard({
	icon,
	label,
	value,
}: {
	icon: React.ReactNode;
	label: string;
	value: string | number;
}) {
	return (
		<div className="rounded-xl border border-gray-200 bg-white p-4 text-center">
			<div className="mb-1 flex justify-center">{icon}</div>
			<p className="text-lg font-bold text-gray-900">{value}</p>
			<p className="text-xs text-gray-500">{label}</p>
		</div>
	);
}

// ---------------------------------------------------------------------------
// Tab 1: Students
// ---------------------------------------------------------------------------

function StudentsTab({
	students,
	totalStudents,
	onAdd,
	onRemove,
}: {
	students: StudentDetail[];
	totalStudents: number;
	onAdd: () => void;
	onRemove: (id: string) => void;
}) {
	return (
		<div>
			<div className="mb-4 flex items-center justify-between">
				<h2 className="text-sm font-semibold text-gray-900">
					Danh sách học sinh ({totalStudents})
				</h2>
				<button
					onClick={onAdd}
					className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
				>
					<UserPlus className="h-4 w-4" />
					Thêm học sinh
				</button>
			</div>
			{students.length === 0 ? (
				<p className="py-8 text-center text-sm text-gray-500">
					Chưa có học sinh nào trong lớp.
				</p>
			) : (
				<div className="overflow-x-auto">
					<table className="w-full text-sm">
						<thead>
							<tr className="bg-gray-50 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
								<th className="px-4 py-3">STT</th>
								<th className="px-4 py-3">Họ tên</th>
								<th className="px-4 py-3">Email</th>
								<th className="px-4 py-3 text-center">Bài nộp</th>
								<th className="px-4 py-3 text-center">Đã chấm</th>
								<th className="px-4 py-3 text-center">ĐTB</th>
								<th className="px-4 py-3 text-center">Đi học (%)</th>
								<th className="px-4 py-3 text-center">Thao tác</th>
							</tr>
						</thead>
						<tbody className="divide-y divide-gray-50">
							{students.map((s, i) => (
								<tr key={s._id} className="hover:bg-gray-50">
									<td className="px-4 py-3 text-gray-500">{i + 1}</td>
									<td className="px-4 py-3 font-medium text-gray-900">
										{s.full_name}
									</td>
									<td className="px-4 py-3 text-gray-500">{s.email}</td>
									<td className="px-4 py-3 text-center text-gray-700">
										{s.submissions.total}
									</td>
									<td className="px-4 py-3 text-center text-gray-700">
										{s.submissions.graded}
									</td>
									<td
										className={`px-4 py-3 text-center ${scoreColor(s.submissions.avg_score)}`}
									>
										{s.submissions.avg_score != null
											? s.submissions.avg_score.toFixed(1)
											: "—"}
									</td>
									<td className="px-4 py-3 text-center text-gray-700">
										{s.attendance.rate != null
											? `${s.attendance.rate.toFixed(0)}%`
											: "—"}
									</td>
									<td className="px-4 py-3 text-center">
										<div className="flex items-center justify-center gap-1">
											<Link
												href={`/admin/students/${s._id}/points`}
												className="rounded px-2 py-1 text-xs font-medium text-amber-700 hover:bg-amber-50"
												title="Điểm thưởng"
											>
												Điểm thưởng
											</Link>
											<button
												onClick={() => onRemove(s._id)}
												className="rounded p-1 text-red-500 hover:bg-red-50 hover:text-red-700"
												title="Xóa khỏi lớp"
											>
												<Trash2 className="h-4 w-4" />
											</button>
										</div>
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			)}
		</div>
	);
}

// ---------------------------------------------------------------------------
// Tab 2: Assignments
// ---------------------------------------------------------------------------

function AssignmentsTab({
	assignments,
	students,
	expandedId,
	onToggle,
}: {
	assignments: AssignmentDetail[];
	students: StudentDetail[];
	expandedId: string | null;
	onToggle: (id: string) => void;
}) {
	const studentMap = useMemo(() => {
		const m = new Map<string, string>();
		for (const s of students) m.set(s._id, s.full_name);
		return m;
	}, [students]);

	if (assignments.length === 0) {
		return (
			<p className="py-8 text-center text-sm text-gray-500">
				Chưa có bài tập nào.
			</p>
		);
	}

	return (
		<div className="overflow-x-auto">
			<table className="w-full text-sm">
				<thead>
					<tr className="bg-gray-50 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
						<th className="px-4 py-3 w-8" />
						<th className="px-4 py-3">Tiêu đề</th>
						<th className="px-4 py-3">Loại</th>
						<th className="px-4 py-3">Trạng thái</th>
						<th className="px-4 py-3 text-center">Tổng điểm</th>
						<th className="px-4 py-3 text-center">Đã nộp</th>
						<th className="px-4 py-3 text-center">Đã chấm</th>
						<th className="px-4 py-3 text-center">ĐTB</th>
						<th className="px-4 py-3">Hạn nộp</th>
					</tr>
				</thead>
				<tbody className="divide-y divide-gray-50">
					{assignments.map((a) => (
						<AssignmentRow
							key={a._id}
							assignment={a}
							studentMap={studentMap}
							totalStudents={students.length}
							isExpanded={expandedId === a._id}
							onToggle={() => onToggle(a._id)}
						/>
					))}
				</tbody>
			</table>
		</div>
	);
}

function AssignmentRow({
	assignment: a,
	studentMap,
	totalStudents,
	isExpanded,
	onToggle,
}: {
	assignment: AssignmentDetail;
	studentMap: Map<string, string>;
	totalStudents: number;
	isExpanded: boolean;
	onToggle: () => void;
}) {
	return (
		<>
			<tr className="cursor-pointer hover:bg-gray-50" onClick={onToggle}>
				<td className="px-4 py-3 text-gray-400">
					{isExpanded ? (
						<ChevronUp className="h-4 w-4" />
					) : (
						<ChevronDown className="h-4 w-4" />
					)}
				</td>
				<td className="px-4 py-3 font-medium text-gray-900">{a.title}</td>
				<td className="px-4 py-3">
					<span
						className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${typeBadge[a.type]}`}
					>
						{typeLabels[a.type]}
					</span>
				</td>
				<td className="px-4 py-3">
					<span
						className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${statusBadge[a.status]}`}
					>
						{statusLabels[a.status]}
					</span>
				</td>
				<td className="px-4 py-3 text-center text-gray-700">
					{a.total_points}
				</td>
				<td className="px-4 py-3 text-center text-gray-700">
					{a.submissions.submitted}/{totalStudents}
				</td>
				<td className="px-4 py-3 text-center text-gray-700">
					{a.submissions.graded}
				</td>
				<td
					className={`px-4 py-3 text-center ${scoreColor(a.submissions.avg_score)}`}
				>
					{a.submissions.avg_score != null
						? a.submissions.avg_score.toFixed(1)
						: "—"}
				</td>
				<td className="px-4 py-3 text-gray-500">
					{a.due_date ? fmtDate(a.due_date) : "—"}
				</td>
			</tr>
			{isExpanded && (
				<tr>
					<td colSpan={9} className="bg-gray-50/50 px-4 py-3">
						{a.submissions.details.length === 0 ? (
							<p className="py-2 text-center text-xs text-gray-500">
								Chưa có bài nộp.
							</p>
						) : (
							<table className="w-full text-xs">
								<thead>
									<tr className="text-left text-gray-500">
										<th className="px-3 py-2">Học sinh</th>
										<th className="px-3 py-2 text-center">Điểm</th>
										<th className="px-3 py-2">Nhận xét</th>
										<th className="px-3 py-2">Ngày nộp</th>
										<th className="px-3 py-2">Ngày chấm</th>
									</tr>
								</thead>
								<tbody className="divide-y divide-gray-100">
									{a.submissions.details.map((d) => (
										<tr key={d.student_id}>
											<td className="px-3 py-2 text-gray-900">
												{studentMap.get(d.student_id) ?? d.student_id}
											</td>
											<td
												className={`px-3 py-2 text-center ${scoreColor(d.score)}`}
											>
												{d.score != null ? d.score : "—"}
											</td>
											<td className="px-3 py-2 text-gray-600">
												{d.feedback ?? "—"}
											</td>
											<td className="px-3 py-2 text-gray-500">
												{fmtDate(d.submitted_at)}
											</td>
											<td className="px-3 py-2 text-gray-500">
												{d.graded_at ? fmtDate(d.graded_at) : "—"}
											</td>
										</tr>
									))}
								</tbody>
							</table>
						)}
					</td>
				</tr>
			)}
		</>
	);
}

// ---------------------------------------------------------------------------
// Tab 3: Attendance
// ---------------------------------------------------------------------------

function AttendanceTab({
	date,
	records,
	loading,
	saving,
	message,
	onShiftDate,
	onChangeStatus,
	onChangeReason,
	onSave,
}: {
	date: Date;
	records: AttendanceEntry[];
	loading: boolean;
	saving: boolean;
	message: string;
	onShiftDate: (days: number) => void;
	onChangeStatus: (
		studentId: string,
		status: AttendanceEntry["status"],
	) => void;
	onChangeReason: (studentId: string, reason: string) => void;
	onSave: () => void;
}) {
	return (
		<div>
			{/* Date picker row */}
			<div className="mb-4 flex items-center gap-3">
				<button
					onClick={() => onShiftDate(-1)}
					className="rounded-lg border border-gray-200 p-2 hover:bg-gray-50"
				>
					<ChevronLeft className="h-4 w-4 text-gray-600" />
				</button>
				<span className="min-w-[120px] text-center text-sm font-semibold text-gray-900">
					{fmtDate(date.toISOString())}
				</span>
				<button
					onClick={() => onShiftDate(1)}
					className="rounded-lg border border-gray-200 p-2 hover:bg-gray-50"
				>
					<ChevronRight className="h-4 w-4 text-gray-600" />
				</button>
			</div>

			{loading ? (
				<div className="flex justify-center py-8">
					<div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
				</div>
			) : records.length === 0 ? (
				<p className="py-8 text-center text-sm text-gray-500">
					Không có dữ liệu điểm danh.
				</p>
			) : (
				<>
					<div className="overflow-x-auto">
						<table className="w-full text-sm">
							<thead>
								<tr className="bg-gray-50 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
									<th className="px-4 py-3">STT</th>
									<th className="px-4 py-3">Họ tên</th>
									<th className="px-4 py-3">Trạng thái</th>
									<th className="px-4 py-3">Ghi chú</th>
								</tr>
							</thead>
							<tbody className="divide-y divide-gray-50">
								{records.map((r, i) => (
									<tr key={r.student_id} className="hover:bg-gray-50">
										<td className="px-4 py-3 text-gray-500">{i + 1}</td>
										<td className="px-4 py-3 font-medium text-gray-900">
											{r.full_name}
										</td>
										<td className="px-4 py-3">
											<select
												value={r.status}
												onChange={(e) =>
													onChangeStatus(
														r.student_id,
														e.target.value as AttendanceEntry["status"],
													)
												}
												className={`rounded-lg border border-gray-200 px-2 py-1 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 ${
													r.status === "present"
														? "text-green-700"
														: r.status === "absent"
															? "text-red-600"
															: r.status === "partial"
																? "text-amber-600"
																: "text-gray-500"
												}`}
											>
												<option value="present">
													{attendanceLabels.present}
												</option>
												<option value="absent">
													{attendanceLabels.absent}
												</option>
												<option value="partial">
													{attendanceLabels.partial}
												</option>
												<option value="unmarked">
													{attendanceLabels.unmarked}
												</option>
											</select>
										</td>
										<td className="px-4 py-3">
											<input
												type="text"
												value={r.status_reason ?? ""}
												onChange={(e) =>
													onChangeReason(r.student_id, e.target.value)
												}
												placeholder="Ghi chú..."
												className="w-full rounded-lg border border-gray-200 px-2 py-1 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
											/>
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
					<div className="mt-4 flex items-center gap-3">
						<button
							onClick={onSave}
							disabled={saving}
							className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
						>
							{saving ? "Đang lưu..." : "Lưu điểm danh"}
						</button>
						{message && (
							<span
								className={`text-sm font-medium ${message.includes("thành công") ? "text-green-600" : "text-red-600"}`}
							>
								{message}
							</span>
						)}
					</div>
				</>
			)}
		</div>
	);
}

// ---------------------------------------------------------------------------
// Tab 4: Grade Sheet
// ---------------------------------------------------------------------------

function GradeSheet({
	assignments,
	rows,
	assignmentAvgs,
}: {
	assignments: AssignmentDetail[];
	rows: {
		student: StudentDetail;
		scores: (number | null | "ungraded")[];
		avg: number | null;
	}[];
	assignmentAvgs: (number | null)[];
}) {
	if (assignments.length === 0 || rows.length === 0) {
		return (
			<p className="py-8 text-center text-sm text-gray-500">
				Chưa có dữ liệu bảng điểm.
			</p>
		);
	}

	function cellDisplay(val: number | null | "ungraded") {
		if (val === null) return { text: "-", className: "text-gray-400" };
		if (val === "ungraded")
			return { text: "?", className: "text-gray-400 italic" };
		return { text: val.toFixed(1), className: scoreColor(val) };
	}

	return (
		<div className="overflow-x-auto">
			<table className="w-full text-sm">
				<thead>
					<tr className="bg-gray-50 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
						<th className="sticky left-0 z-10 bg-gray-50 px-4 py-3">Họ tên</th>
						{assignments.map((a) => (
							<th key={a._id} className="px-3 py-3 text-center" title={a.title}>
								<div className="max-w-[100px] truncate">{a.title}</div>
							</th>
						))}
						<th className="px-4 py-3 text-center">ĐTB</th>
					</tr>
				</thead>
				<tbody className="divide-y divide-gray-50">
					{rows.map((row) => (
						<tr key={row.student._id} className="hover:bg-gray-50">
							<td className="sticky left-0 z-10 bg-white px-4 py-3 font-medium text-gray-900">
								{row.student.full_name}
							</td>
							{row.scores.map((s, j) => {
								const cell = cellDisplay(s);
								return (
									<td
										key={assignments[j]._id}
										className={`px-3 py-3 text-center ${cell.className}`}
									>
										{cell.text}
									</td>
								);
							})}
							<td
								className={`px-4 py-3 text-center font-bold ${scoreColor(row.avg)}`}
							>
								{row.avg != null ? row.avg.toFixed(1) : "—"}
							</td>
						</tr>
					))}
					{/* Assignment averages row */}
					<tr className="border-t-2 border-gray-200 bg-gray-50 font-semibold">
						<td className="sticky left-0 z-10 bg-gray-50 px-4 py-3 text-gray-700">
							ĐTB bài tập
						</td>
						{assignmentAvgs.map((avg, j) => (
							<td
								key={assignments[j]._id}
								className={`px-3 py-3 text-center ${scoreColor(avg)}`}
							>
								{avg != null ? avg.toFixed(1) : "—"}
							</td>
						))}
						<td className="px-4 py-3" />
					</tr>
				</tbody>
			</table>
		</div>
	);
}
