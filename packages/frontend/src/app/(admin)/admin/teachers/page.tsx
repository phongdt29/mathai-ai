"use client";

import {
	BookOpen,
	CheckCircle,
	ClipboardList,
	Clock,
	Eye,
	GraduationCap,
	Lock,
	Pencil,
	Plus,
	ToggleLeft,
	ToggleRight,
	Trash2,
	Unlock,
	Users,
	X,
	XCircle,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { apiClient } from "@/lib/api";

interface TeacherStats {
	total_classes: number;
	total_students: number;
	total_assignments: number;
	pending_proposals: number;
}

interface Teacher {
	_id: string;
	email: string;
	full_name: string;
	is_active: boolean;
	createdAt: string;
	stats: TeacherStats;
}

interface TeacherClass {
	_id: string;
	name: string;
	subject: string;
	grade_level: number;
	schedule: string;
	student_count: number;
}

interface TeacherAssignment {
	_id: string;
	title: string;
	type: string;
	status: string;
	due_date: string | null;
	createdAt: string;
}

interface Proposal {
	_id: string;
	type: string;
	status: string;
	data: Record<string, any>;
	rejection_reason: string | null;
	createdAt: string;
}

interface TeacherDetail {
	_id: string;
	email: string;
	full_name: string;
	is_active: boolean;
	createdAt: string;
	stats: TeacherStats & {
		total_submissions: number;
		graded_submissions: number;
	};
	classes: TeacherClass[];
	recent_assignments: TeacherAssignment[];
	proposals: Proposal[];
}

const emptyForm = { full_name: "", email: "", password: "" };

const typeLabels: Record<string, string> = {
	create_class: "Tạo lớp",
	add_student: "Thêm HS",
};
const statusLabels: Record<string, string> = {
	pending: "Chờ duyệt",
	approved: "Đã duyệt",
	rejected: "Từ chối",
	draft: "Nháp",
	active: "Đang mở",
	grading: "Đang chấm",
	closed: "Đóng",
};
const assignmentTypes: Record<string, string> = {
	homework: "Bài tập",
	quiz: "Kiểm tra ngắn",
	exam: "Kiểm tra",
};

export default function AdminTeachersPage() {
	const { user } = useAuth(["admin", "staff"]);
	const [teachers, setTeachers] = useState<Teacher[]>([]);
	const [loading, setLoading] = useState(true);
	const [showForm, setShowForm] = useState(false);
	const [editing, setEditing] = useState<Teacher | null>(null);
	const [form, setForm] = useState(emptyForm);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState("");
	const [detail, setDetail] = useState<TeacherDetail | null>(null);
	const [detailLoading, setDetailLoading] = useState(false);

	async function load() {
		try {
			const res = await apiClient<{ success: boolean; data: Teacher[] }>(
				"/admin/teachers",
			);
			if (res.success) setTeachers(res.data);
		} catch {
			// ignore
		} finally {
			setLoading(false);
		}
	}

	useEffect(() => {
		void Promise.resolve().then(load);
	}, []);

	function openCreate() {
		setEditing(null);
		setForm(emptyForm);
		setError("");
		setShowForm(true);
	}

	function openEdit(t: Teacher) {
		setEditing(t);
		setForm({ full_name: t.full_name, email: t.email, password: "" });
		setError("");
		setShowForm(true);
	}

	async function openDetail(id: string) {
		setDetailLoading(true);
		try {
			const res = await apiClient<{ success: boolean; data: TeacherDetail }>(
				`/admin/teachers/${id}`,
			);
			if (res.success) setDetail(res.data);
		} catch {
			// ignore
		} finally {
			setDetailLoading(false);
		}
	}

	async function handleSave() {
		if (!form.full_name.trim() || !form.email.trim()) return;
		if (!editing && (!form.password || form.password.length < 6)) {
			setError("Mật khẩu phải có ít nhất 6 ký tự");
			return;
		}
		setSaving(true);
		setError("");
		try {
			const body: any = { full_name: form.full_name, email: form.email };
			if (form.password) body.password = form.password;

			if (editing) {
				const res = await apiClient<{ success: boolean; data: any }>(
					`/admin/teachers/${editing._id}`,
					{
						method: "PUT",
						body: JSON.stringify(body),
					},
				);
				if (res.success) {
					load();
					setShowForm(false);
				}
			} else {
				body.password = form.password;
				const res = await apiClient<{ success: boolean; data: any }>(
					"/admin/teachers",
					{
						method: "POST",
						body: JSON.stringify(body),
					},
				);
				if (res.success) {
					load();
					setShowForm(false);
				}
			}
		} catch (e: any) {
			setError(e.message || "Có lỗi xảy ra");
		} finally {
			setSaving(false);
		}
	}

	async function handleToggle(t: Teacher) {
		try {
			const res = await apiClient<{ success: boolean; data: any }>(
				`/admin/teachers/${t._id}/toggle`,
				{ method: "PUT" },
			);
			if (res.success) {
				setTeachers((prev) =>
					prev.map((x) =>
						x._id === t._id ? { ...x, is_active: !x.is_active } : x,
					),
				);
			}
		} catch {
			// ignore
		}
	}

	async function handleDelete(t: Teacher) {
		if (
			!confirm(
				`Vô hiệu hóa giáo viên "${t.full_name}" và tất cả lớp học? Hành động này không thể hoàn tác.`,
			)
		)
			return;
		try {
			await apiClient(`/admin/teachers/${t._id}`, { method: "DELETE" });
			setTeachers((prev) =>
				prev.map((x) => (x._id === t._id ? { ...x, is_active: false } : x)),
			);
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

	const activeCount = teachers.filter((t) => t.is_active).length;
	const totalClasses = teachers.reduce((s, t) => s + t.stats.total_classes, 0);
	const totalStudents = teachers.reduce(
		(s, t) => s + t.stats.total_students,
		0,
	);
	const canManageTeacherLifecycle = user?.role === "admin";

	return (
		<div className="space-y-6">
			{/* Header */}
			<div className="flex items-center justify-between">
				<div>
					<h1 className="text-xl font-bold text-gray-900">Quản lý Giáo viên</h1>
					<p className="text-sm text-gray-500 mt-0.5">
						Tạo, chỉnh sửa, quản lý tài khoản và theo dõi hoạt động
					</p>
				</div>
				{canManageTeacherLifecycle && (
					<button
						onClick={openCreate}
						className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
					>
						<Plus className="w-4 h-4" />
						Thêm giáo viên
					</button>
				)}
			</div>

			{/* Summary cards */}
			<div className="grid grid-cols-3 gap-4">
				<div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
					<GraduationCap className="w-5 h-5 text-blue-600 mb-2" />
					<p className="text-2xl font-bold text-gray-900">
						{activeCount}
						<span className="text-sm font-normal text-gray-400">
							/{teachers.length}
						</span>
					</p>
					<p className="text-sm text-gray-500">Giáo viên hoạt động</p>
				</div>
				<div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
					<BookOpen className="w-5 h-5 text-emerald-600 mb-2" />
					<p className="text-2xl font-bold text-gray-900">{totalClasses}</p>
					<p className="text-sm text-gray-500">Tổng lớp học</p>
				</div>
				<div className="rounded-xl border border-purple-200 bg-purple-50 p-4">
					<Users className="w-5 h-5 text-purple-600 mb-2" />
					<p className="text-2xl font-bold text-gray-900">{totalStudents}</p>
					<p className="text-sm text-gray-500">Tổng học sinh</p>
				</div>
			</div>

			{/* Teacher table */}
			{teachers.length === 0 ? (
				<div className="text-center py-16">
					<GraduationCap className="w-12 h-12 text-gray-300 mx-auto mb-3" />
					<p className="text-sm text-gray-500">Chưa có giáo viên nào</p>
					{canManageTeacherLifecycle && (
						<button
							onClick={openCreate}
							className="mt-3 text-sm font-medium text-blue-600 hover:text-blue-700"
						>
							Thêm giáo viên đầu tiên
						</button>
					)}
				</div>
			) : (
				<div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
					<table className="w-full text-left">
						<thead className="bg-gray-50 text-xs uppercase text-gray-500">
							<tr>
								<th className="px-5 py-3">Giáo viên</th>
								<th className="px-5 py-3">Lớp</th>
								<th className="px-5 py-3">Học sinh</th>
								<th className="px-5 py-3">Bài tập</th>
								<th className="px-5 py-3">Đề xuất</th>
								<th className="px-5 py-3">Trạng thái</th>
								<th className="px-5 py-3 text-right">Thao tác</th>
							</tr>
						</thead>
						<tbody className="divide-y divide-gray-50">
							{teachers.map((t) => (
								<tr key={t._id} className="hover:bg-gray-50">
									<td className="px-5 py-4">
										<div>
											<p className="font-medium text-gray-900">{t.full_name}</p>
											<p className="text-xs text-gray-400">{t.email}</p>
										</div>
									</td>
									<td className="px-5 py-4 text-sm text-gray-700">
										{t.stats.total_classes}
									</td>
									<td className="px-5 py-4 text-sm text-gray-700">
										{t.stats.total_students}
									</td>
									<td className="px-5 py-4 text-sm text-gray-700">
										{t.stats.total_assignments}
									</td>
									<td className="px-5 py-4">
										{t.stats.pending_proposals > 0 ? (
											<span className="text-xs font-medium px-2 py-1 rounded-full bg-amber-100 text-amber-700">
												{t.stats.pending_proposals} chờ
											</span>
										) : (
											<span className="text-xs text-gray-400">0</span>
										)}
									</td>
									<td className="px-5 py-4">
										<span
											className={`inline-flex items-center gap-1 text-xs font-medium ${t.is_active ? "text-green-600" : "text-red-500"}`}
										>
											<span
												className="w-1.5 h-1.5 rounded-full inline-block"
												style={{
													backgroundColor: t.is_active ? "#16a34a" : "#ef4444",
												}}
											/>
											{t.is_active ? "Hoạt động" : "Đã khóa"}
										</span>
									</td>
									<td className="px-5 py-4">
										<div className="flex items-center justify-end gap-1">
											<button
												onClick={() => openDetail(t._id)}
												className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-blue-600"
												title="Chi tiết"
											>
												<Eye className="w-4 h-4" />
											</button>
											{canManageTeacherLifecycle && (
												<>
													<button
														onClick={() => openEdit(t)}
														className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-blue-600"
														title="Sửa"
													>
														<Pencil className="w-4 h-4" />
													</button>
													<button
														onClick={() => handleToggle(t)}
														className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600"
														title={t.is_active ? "Khóa" : "Mở khóa"}
													>
														{t.is_active ? (
															<Lock className="w-4 h-4" />
														) : (
															<Unlock className="w-4 h-4" />
														)}
													</button>
													<button
														onClick={() => handleDelete(t)}
														className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500"
														title="Vô hiệu hóa"
													>
														<Trash2 className="w-4 h-4" />
													</button>
												</>
											)}
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
				<div
					className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
					onClick={() => setDetail(null)}
				>
					<div
						className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[85vh] overflow-y-auto"
						onClick={(e) => e.stopPropagation()}
					>
						{detailLoading ? (
							<div className="flex items-center justify-center py-20">
								<div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
							</div>
						) : (
							detail && (
								<>
									<div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
										<div>
											<h2 className="text-lg font-bold text-gray-900">
												{detail.full_name}
											</h2>
											<p className="text-xs text-gray-400">
												{detail.email} · Tham gia{" "}
												{new Date(detail.createdAt).toLocaleDateString("vi-VN")}
											</p>
										</div>
										<div className="flex items-center gap-3">
											<span
												className={`text-xs font-medium px-2 py-1 rounded-full ${detail.is_active ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"}`}
											>
												{detail.is_active ? "Hoạt động" : "Đã khóa"}
											</span>
											<button
												onClick={() => setDetail(null)}
												className="text-gray-400 hover:text-gray-600"
											>
												<X className="w-5 h-5" />
											</button>
										</div>
									</div>

									{/* Stats row */}
									<div className="grid grid-cols-5 gap-3 px-6 py-4 border-b border-gray-50">
										<Stat label="Lớp học" value={detail.stats.total_classes} />
										<Stat
											label="Học sinh"
											value={detail.stats.total_students}
										/>
										<Stat
											label="Bài tập"
											value={detail.stats.total_assignments}
										/>
										<Stat
											label="Bài nộp"
											value={detail.stats.total_submissions}
										/>
										<Stat
											label="Đã chấm"
											value={detail.stats.graded_submissions}
										/>
									</div>

									<div className="flex flex-col md:flex-row">
										{/* Left: classes */}
										<div className="flex-1 p-6 md:border-r border-b md:border-b-0 border-gray-100">
											<h3 className="text-sm font-semibold text-gray-900 mb-3">
												Lớp học ({detail.classes.length})
											</h3>
											{detail.classes.length === 0 ? (
												<p className="text-xs text-gray-400">Chưa có lớp học</p>
											) : (
												<div className="space-y-2">
													{detail.classes.map((c) => (
														<div
															key={c._id}
															className="flex items-center justify-between p-2.5 rounded-lg bg-gray-50"
														>
															<div>
																<p className="text-sm font-medium text-gray-900">
																	{c.name}
																</p>
																<p className="text-xs text-gray-400">
																	{c.subject} · Khối {c.grade_level}
																</p>
															</div>
															<span className="text-xs text-gray-500">
																{c.student_count} HS
															</span>
														</div>
													))}
												</div>
											)}

											<h3 className="text-sm font-semibold text-gray-900 mt-5 mb-3">
												Bài tập gần đây
											</h3>
											{detail.recent_assignments.length === 0 ? (
												<p className="text-xs text-gray-400">Chưa có bài tập</p>
											) : (
												<div className="space-y-2">
													{detail.recent_assignments.slice(0, 8).map((a) => (
														<div
															key={a._id}
															className="flex items-center justify-between p-2.5 rounded-lg bg-gray-50"
														>
															<div>
																<p className="text-sm font-medium text-gray-900">
																	{a.title}
																</p>
																<p className="text-xs text-gray-400">
																	{assignmentTypes[a.type] || a.type}
																</p>
															</div>
															<span
																className={`text-xs font-medium px-2 py-0.5 rounded-full ${
																	a.status === "active"
																		? "bg-green-100 text-green-700"
																		: a.status === "draft"
																			? "bg-gray-100 text-gray-500"
																			: a.status === "grading"
																				? "bg-amber-100 text-amber-700"
																				: "bg-gray-100 text-gray-500"
																}`}
															>
																{statusLabels[a.status] || a.status}
															</span>
														</div>
													))}
												</div>
											)}
										</div>

										{/* Right: proposals */}
										<div className="md:w-72 flex-shrink-0 p-6">
											<h3 className="text-sm font-semibold text-gray-900 mb-3">
												Đề xuất ({detail.proposals.length})
											</h3>
											{detail.proposals.length === 0 ? (
												<p className="text-xs text-gray-400">Chưa có đề xuất</p>
											) : (
												<div className="space-y-2">
													{detail.proposals.slice(0, 10).map((p) => {
														const icon =
															p.status === "approved" ? (
																<CheckCircle className="w-3.5 h-3.5 text-green-500" />
															) : p.status === "rejected" ? (
																<XCircle className="w-3.5 h-3.5 text-red-500" />
															) : (
																<Clock className="w-3.5 h-3.5 text-amber-500" />
															);
														return (
															<div
																key={p._id}
																className="flex items-start gap-2 p-2 rounded-lg bg-gray-50"
															>
																<div className="mt-0.5">{icon}</div>
																<div className="min-w-0">
																	<p className="text-xs font-medium text-gray-900">
																		{typeLabels[p.type] || p.type}
																	</p>
																	<p className="text-xs text-gray-400 truncate">
																		{p.data.name || p.data.student_name || ""}
																	</p>
																	{p.rejection_reason && (
																		<p className="text-xs text-red-500 truncate">
																			{p.rejection_reason}
																		</p>
																	)}
																</div>
																<span className="text-xs text-gray-300 flex-shrink-0">
																	{new Date(p.createdAt).toLocaleDateString(
																		"vi-VN",
																	)}
																</span>
															</div>
														);
													})}
												</div>
											)}
										</div>
									</div>

									<div className="flex justify-end gap-2 px-6 py-4 border-t border-gray-100">
										<button
											onClick={() => setDetail(null)}
											className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg"
										>
											Đóng
										</button>
										{canManageTeacherLifecycle && (
											<button
												onClick={() => {
													openEdit({
														_id: detail._id,
														email: detail.email,
														full_name: detail.full_name,
														is_active: detail.is_active,
														createdAt: detail.createdAt,
														stats: detail.stats,
													});
													setDetail(null);
												}}
												className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg"
											>
												Chỉnh sửa
											</button>
										)}
									</div>
								</>
							)
						)}
					</div>
				</div>
			)}

			{/* Create/Edit modal */}
			{showForm && (
				<div
					className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
					onClick={() => setShowForm(false)}
				>
					<div
						className="bg-white rounded-xl p-6 w-full max-w-md shadow-xl"
						onClick={(e) => e.stopPropagation()}
					>
						<div className="flex items-center justify-between mb-4">
							<h2 className="text-lg font-bold text-gray-900">
								{editing ? "Chỉnh sửa giáo viên" : "Thêm giáo viên mới"}
							</h2>
							<button
								onClick={() => setShowForm(false)}
								className="text-gray-400 hover:text-gray-600"
							>
								<X className="w-5 h-5" />
							</button>
						</div>

						{error && (
							<div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-600 mb-3">
								{error}
							</div>
						)}

						<div className="space-y-3">
							<div>
								<label className="block text-xs font-medium text-gray-700 mb-1">
									Họ tên *
								</label>
								<input
									type="text"
									value={form.full_name}
									onChange={(e) =>
										setForm({ ...form, full_name: e.target.value })
									}
									placeholder="Nguyễn Văn A"
									className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
								/>
							</div>
							<div>
								<label className="block text-xs font-medium text-gray-700 mb-1">
									Email *
								</label>
								<input
									type="email"
									value={form.email}
									onChange={(e) => setForm({ ...form, email: e.target.value })}
									placeholder="teacher@mathai.vn"
									className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
								/>
							</div>
							<div>
								<label className="block text-xs font-medium text-gray-700 mb-1">
									Mật khẩu {editing ? "(để trống nếu không đổi)" : "*"}
								</label>
								<input
									type="password"
									value={form.password}
									onChange={(e) =>
										setForm({ ...form, password: e.target.value })
									}
									placeholder={editing ? "••••••" : "Tối thiểu 6 ký tự"}
									className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
								/>
							</div>
						</div>

						<div className="flex justify-end gap-2 mt-5">
							<button
								onClick={() => setShowForm(false)}
								className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg"
							>
								Hủy
							</button>
							<button
								onClick={handleSave}
								disabled={
									saving || !form.full_name.trim() || !form.email.trim()
								}
								className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50"
							>
								{saving
									? "Đang lưu..."
									: editing
										? "Cập nhật"
										: "Tạo tài khoản"}
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
