"use client";

import {
	AlertCircle,
	CheckCircle,
	Clock,
	Edit,
	Eye,
	FileText,
	Plus,
	Trash2,
	Users,
	X,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import {
	apiClient,
	getTeacherAssignment,
	type TeacherAssignmentDetail,
} from "@/lib/api";

interface Assignment {
	id: string;
	title: string;
	description: string | null;
	type: "homework" | "quiz" | "exam";
	status: "draft" | "active" | "grading" | "closed";
	due_date: string | null;
	total_points: number;
	class_id: string;
	class_name: string;
	total_students: number;
	submitted: number;
	graded: number;
	avg_score: number | null;
	createdAt: string;
}

interface ClassOption {
	_id: string;
	id: string;
	name: string;
}

const statusConfig: Record<
	string,
	{ label: string; color: string; icon: typeof Clock }
> = {
	draft: {
		label: "Bản nháp",
		color: "bg-gray-100 text-gray-600",
		icon: FileText,
	},
	active: {
		label: "Đang mở",
		color: "bg-emerald-50 text-emerald-600",
		icon: Clock,
	},
	grading: {
		label: "Đang chấm",
		color: "bg-amber-50 text-amber-600",
		icon: AlertCircle,
	},
	closed: {
		label: "Đã đóng",
		color: "bg-blue-50 text-blue-600",
		icon: CheckCircle,
	},
};

const typeLabels: Record<string, string> = {
	quiz: "Kiểm tra ngắn",
	homework: "Bài tập",
	exam: "Kiểm tra",
};

export default function TeacherAssignmentsPage() {
	const [assignments, setAssignments] = useState<Assignment[]>([]);
	const [classes, setClasses] = useState<ClassOption[]>([]);
	const [loading, setLoading] = useState(true);
	const [filterStatus, setFilterStatus] = useState("all");
	const [filterClass, setFilterClass] = useState("all");
	const [showCreate, setShowCreate] = useState(false);
	const [saving, setSaving] = useState(false);
	const [selectedAssignment, setSelectedAssignment] =
		useState<TeacherAssignmentDetail | null>(null);
	const [detailLoading, setDetailLoading] = useState(false);
	const [detailError, setDetailError] = useState("");
	const [form, setForm] = useState({
		class_id: "",
		title: "",
		type: "homework" as string,
		status: "draft" as string,
		due_date: "",
		total_points: 10,
		description: "",
	});

	const loadAssignments = useCallback(async () => {
		try {
			const params = new URLSearchParams();
			if (filterStatus !== "all") params.set("status", filterStatus);
			if (filterClass !== "all") params.set("class_id", filterClass);
			const res = await apiClient<{ success: boolean; data: Assignment[] }>(
				`/teacher/assignments?${params}`,
			);
			if (res.success) setAssignments(res.data);
		} catch {
			// ignore
		}
	}, [filterStatus, filterClass]);

	async function loadClasses() {
		try {
			const res = await apiClient<{ success: boolean; data: ClassOption[] }>(
				"/teacher/classes",
			);
			if (res.success) setClasses(res.data);
		} catch {
			// ignore
		}
	}

	useEffect(() => {
		void Promise.resolve().then(() => {
			void Promise.all([loadClasses()]).then(() => setLoading(false));
		});
	}, []);

	useEffect(() => {
		void Promise.resolve().then(loadAssignments);
	}, [loadAssignments]);

	async function handleCreate() {
		if (!form.title.trim() || !form.class_id) return;
		setSaving(true);
		try {
			const res = await apiClient<{ success: boolean }>(
				"/teacher/assignments",
				{
					method: "POST",
					body: JSON.stringify(form),
				},
			);
			if (res.success) {
				setShowCreate(false);
				setForm({
					class_id: "",
					title: "",
					type: "homework",
					status: "draft",
					due_date: "",
					total_points: 10,
					description: "",
				});
				loadAssignments();
			}
		} catch {
			// ignore
		} finally {
			setSaving(false);
		}
	}

	async function handleDelete(id: string) {
		if (!confirm("Bạn có chắc muốn xóa bài tập này?")) return;
		try {
			await apiClient(`/teacher/assignments/${id}`, { method: "DELETE" });
			setAssignments((prev) => prev.filter((a) => a.id !== id));
		} catch {
			// ignore
		}
	}

	async function handleViewDetail(id: string) {
		setDetailLoading(true);
		setDetailError("");
		try {
			const detail = await getTeacherAssignment(id);
			setSelectedAssignment(detail);
		} catch (error) {
			setDetailError(
				error instanceof Error
					? error.message
					: "Không thể tải chi tiết bài tập",
			);
		} finally {
			setDetailLoading(false);
		}
	}

	async function handleStatusChange(id: string, newStatus: string) {
		try {
			await apiClient(`/teacher/assignments/${id}`, {
				method: "PUT",
				body: JSON.stringify({ status: newStatus }),
			});
			loadAssignments();
		} catch {
			// ignore
		}
	}

	const counts = {
		all: assignments.length,
		active: assignments.filter((a) => a.status === "active").length,
		grading: assignments.filter((a) => a.status === "grading").length,
		draft: assignments.filter((a) => a.status === "draft").length,
		closed: assignments.filter((a) => a.status === "closed").length,
	};

	if (loading) {
		return (
			<div className="flex items-center justify-center py-20">
				<div className="h-8 w-8 animate-spin rounded-full border-4 border-emerald-600 border-t-transparent" />
			</div>
		);
	}

	return (
		<div className="space-y-6">
			<div className="flex items-center justify-between">
				<div>
					<h1 className="text-xl font-bold text-gray-900">
						Bài tập & Kiểm tra
					</h1>
					<p className="text-sm text-gray-500 mt-0.5">
						Quản lý bài tập và bài kiểm tra
					</p>
				</div>
				<button
					onClick={() => {
						if (classes.length > 0) {
							setForm({ ...form, class_id: classes[0]._id || classes[0].id });
						}
						setShowCreate(true);
					}}
					className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-700 transition-colors"
				>
					<Plus className="w-4 h-4" />
					Tạo bài mới
				</button>
			</div>

			{/* Create modal */}
			{showCreate && (
				<div
					className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
					onClick={() => setShowCreate(false)}
				>
					<div
						className="bg-white rounded-xl p-6 w-full max-w-lg shadow-xl"
						onClick={(e) => e.stopPropagation()}
					>
						<div className="flex items-center justify-between mb-4">
							<h2 className="text-lg font-bold text-gray-900">Tạo bài mới</h2>
							<button
								onClick={() => setShowCreate(false)}
								className="text-gray-400 hover:text-gray-600"
							>
								<X className="w-5 h-5" />
							</button>
						</div>
						<div className="space-y-3">
							<div>
								<label className="block text-sm font-medium text-gray-700 mb-1">
									Tiêu đề *
								</label>
								<input
									type="text"
									value={form.title}
									onChange={(e) => setForm({ ...form, title: e.target.value })}
									placeholder="VD: Bài tập về nhà chương 3"
									className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
								/>
							</div>
							<div className="grid grid-cols-2 gap-3">
								<div>
									<label className="block text-sm font-medium text-gray-700 mb-1">
										Lớp *
									</label>
									<select
										value={form.class_id}
										onChange={(e) =>
											setForm({ ...form, class_id: e.target.value })
										}
										className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-500"
									>
										{classes.map((c) => (
											<option key={c._id || c.id} value={c._id || c.id}>
												{c.name}
											</option>
										))}
									</select>
								</div>
								<div>
									<label className="block text-sm font-medium text-gray-700 mb-1">
										Loại
									</label>
									<select
										value={form.type}
										onChange={(e) => setForm({ ...form, type: e.target.value })}
										className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-500"
									>
										<option value="homework">Bài tập</option>
										<option value="quiz">Kiểm tra ngắn</option>
										<option value="exam">Kiểm tra</option>
									</select>
								</div>
							</div>
							<div className="grid grid-cols-2 gap-3">
								<div>
									<label className="block text-sm font-medium text-gray-700 mb-1">
										Hạn nộp
									</label>
									<input
										type="date"
										value={form.due_date}
										onChange={(e) =>
											setForm({ ...form, due_date: e.target.value })
										}
										className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
									/>
								</div>
								<div>
									<label className="block text-sm font-medium text-gray-700 mb-1">
										Tổng điểm
									</label>
									<input
										type="number"
										value={form.total_points}
										onChange={(e) =>
											setForm({ ...form, total_points: Number(e.target.value) })
										}
										className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
									/>
								</div>
							</div>
							<div>
								<label className="block text-sm font-medium text-gray-700 mb-1">
									Mô tả
								</label>
								<textarea
									value={form.description}
									onChange={(e) =>
										setForm({ ...form, description: e.target.value })
									}
									rows={2}
									className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 resize-none"
								/>
							</div>
							<div>
								<label className="block text-sm font-medium text-gray-700 mb-1">
									Trạng thái
								</label>
								<select
									value={form.status}
									onChange={(e) => setForm({ ...form, status: e.target.value })}
									className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-500"
								>
									<option value="draft">Bản nháp</option>
									<option value="active">Mở ngay</option>
								</select>
							</div>
						</div>
						<div className="flex justify-end gap-2 mt-5">
							<button
								onClick={() => setShowCreate(false)}
								className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg"
							>
								Hủy
							</button>
							<button
								onClick={handleCreate}
								disabled={saving || !form.title.trim() || !form.class_id}
								className="px-4 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg disabled:opacity-50"
							>
								{saving ? "Đang tạo..." : "Tạo bài"}
							</button>
						</div>
					</div>
				</div>
			)}

			{(selectedAssignment || detailLoading || detailError) && (
				<div
					className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
					onClick={() => {
						setSelectedAssignment(null);
						setDetailError("");
					}}
				>
					<div
						className="w-full max-w-2xl rounded-xl bg-white p-6 shadow-xl"
						onClick={(e) => e.stopPropagation()}
					>
						<div className="mb-4 flex items-center justify-between">
							<h2 className="text-lg font-bold text-gray-900">
								Chi tiết bài tập
							</h2>
							<button
								onClick={() => {
									setSelectedAssignment(null);
									setDetailError("");
								}}
								className="text-gray-400 hover:text-gray-600"
							>
								<X className="h-5 w-5" />
							</button>
						</div>

						{detailLoading && (
							<div className="flex items-center justify-center py-10">
								<div className="h-7 w-7 animate-spin rounded-full border-4 border-emerald-600 border-t-transparent" />
							</div>
						)}

						{detailError && !detailLoading && (
							<div className="rounded-lg bg-red-50 p-4 text-sm text-red-600">
								{detailError}
							</div>
						)}

						{selectedAssignment && !detailLoading && (
							<div className="space-y-5">
								<div>
									<div className="mb-2 flex flex-wrap items-center gap-2">
										<h3 className="text-xl font-semibold text-gray-900">
											{selectedAssignment.title}
										</h3>
										<span
											className={`rounded-full px-2 py-0.5 text-xs font-medium ${(statusConfig[selectedAssignment.status] || statusConfig.draft).color}`}
										>
											{
												(
													statusConfig[selectedAssignment.status] ||
													statusConfig.draft
												).label
											}
										</span>
									</div>
									<p className="text-sm text-gray-500">
										{selectedAssignment.description ||
											"Chưa có mô tả chi tiết."}
									</p>
								</div>

								<div className="grid gap-3 sm:grid-cols-2">
									<div className="rounded-lg bg-gray-50 p-3">
										<p className="text-xs font-medium uppercase tracking-wide text-gray-500">
											Lớp
										</p>
										<p className="mt-1 text-sm font-semibold text-gray-900">
											{selectedAssignment.class_name || "?"}
										</p>
									</div>
									<div className="rounded-lg bg-gray-50 p-3">
										<p className="text-xs font-medium uppercase tracking-wide text-gray-500">
											Loại bài
										</p>
										<p className="mt-1 text-sm font-semibold text-gray-900">
											{typeLabels[selectedAssignment.type] ||
												selectedAssignment.type}
										</p>
									</div>
									<div className="rounded-lg bg-gray-50 p-3">
										<p className="text-xs font-medium uppercase tracking-wide text-gray-500">
											Hạn nộp
										</p>
										<p className="mt-1 text-sm font-semibold text-gray-900">
											{selectedAssignment.due_date
												? new Date(
														selectedAssignment.due_date,
													).toLocaleDateString("vi-VN")
												: "Không giới hạn"}
										</p>
									</div>
									<div className="rounded-lg bg-gray-50 p-3">
										<p className="text-xs font-medium uppercase tracking-wide text-gray-500">
											Tổng điểm
										</p>
										<p className="mt-1 text-sm font-semibold text-gray-900">
											{selectedAssignment.total_points}
										</p>
									</div>
								</div>

								<div className="grid gap-3 sm:grid-cols-3">
									<div className="rounded-lg border border-gray-100 p-3 text-center">
										<p className="text-2xl font-bold text-gray-900">
											{selectedAssignment.submitted}/
											{selectedAssignment.total_students}
										</p>
										<p className="text-xs text-gray-500">Đã nộp</p>
									</div>
									<div className="rounded-lg border border-gray-100 p-3 text-center">
										<p className="text-2xl font-bold text-gray-900">
											{selectedAssignment.graded}
										</p>
										<p className="text-xs text-gray-500">Đã chấm</p>
									</div>
									<div className="rounded-lg border border-gray-100 p-3 text-center">
										<p className="text-2xl font-bold text-gray-900">
											{selectedAssignment.avg_score ?? "?"}
										</p>
										<p className="text-xs text-gray-500">Điểm trung bình</p>
									</div>
								</div>
							</div>
						)}
					</div>
				</div>
			)}

			{/* Status tabs */}
			<div className="flex items-center gap-2 border-b border-gray-200 pb-0">
				{(["all", "active", "grading", "draft", "closed"] as const).map(
					(status) => (
						<button
							key={status}
							onClick={() => setFilterStatus(status)}
							className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
								filterStatus === status
									? "border-emerald-600 text-emerald-600"
									: "border-transparent text-gray-500 hover:text-gray-700"
							}`}
						>
							{status === "all" ? "Tất cả" : statusConfig[status].label}
							<span className="ml-1.5 text-xs text-gray-400">
								({counts[status]})
							</span>
						</button>
					),
				)}
			</div>

			{/* Filter by class */}
			<div className="flex items-center gap-3">
				<select
					value={filterClass}
					onChange={(e) => setFilterClass(e.target.value)}
					className="rounded-lg border border-gray-200 py-2 px-3 text-sm text-gray-700 outline-none focus:border-emerald-500"
				>
					<option value="all">Tất cả lớp</option>
					{classes.map((c) => (
						<option key={c._id || c.id} value={c._id || c.id}>
							{c.name}
						</option>
					))}
				</select>
			</div>

			{/* Assignment cards */}
			<div className="space-y-3">
				{assignments.map((a) => {
					const sc = statusConfig[a.status] || statusConfig.draft;
					const StatusIcon = sc.icon;
					const progressPct =
						a.total_students > 0
							? Math.round((a.submitted / a.total_students) * 100)
							: 0;

					return (
						<div
							key={a.id}
							className="rounded-xl border border-gray-200 bg-white p-5 hover:shadow-sm transition-shadow"
						>
							<div className="flex items-start justify-between gap-4">
								<div className="flex-1 min-w-0">
									<div className="flex items-center gap-2 flex-wrap">
										<h3 className="text-base font-semibold text-gray-900">
											{a.title}
										</h3>
										<span
											className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${sc.color}`}
										>
											<StatusIcon className="w-3 h-3" />
											{sc.label}
										</span>
									</div>
									<div className="flex items-center gap-3 mt-1.5 text-sm text-gray-500">
										<span className="font-medium text-gray-700">
											{a.class_name}
										</span>
										<span>·</span>
										<span>{typeLabels[a.type] || a.type}</span>
										{a.due_date && (
											<>
												<span>·</span>
												<span>
													Hạn:{" "}
													{new Date(a.due_date).toLocaleDateString("vi-VN")}
												</span>
											</>
										)}
									</div>
								</div>

								<div className="flex items-center gap-1 flex-shrink-0">
									<button
										onClick={() => handleViewDetail(a.id)}
										className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400 hover:text-emerald-600"
										title="Xem chi tiết"
									>
										<Eye className="w-4 h-4" />
									</button>
									{a.status === "draft" && (
										<button
											onClick={() => handleStatusChange(a.id, "active")}
											className="text-xs px-2 py-1 rounded bg-emerald-50 text-emerald-600 hover:bg-emerald-100 font-medium"
											title="Mở bài"
										>
											Mở
										</button>
									)}
									{a.status === "active" && (
										<button
											onClick={() => handleStatusChange(a.id, "closed")}
											className="text-xs px-2 py-1 rounded bg-blue-50 text-blue-600 hover:bg-blue-100 font-medium"
											title="Đóng"
										>
											Đóng
										</button>
									)}
									<button
										onClick={() => handleDelete(a.id)}
										className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400 hover:text-red-500"
										title="Xóa"
									>
										<Trash2 className="w-4 h-4" />
									</button>
								</div>
							</div>

							<div className="flex items-center gap-6 mt-4">
								<div className="flex items-center gap-2">
									<Users className="w-4 h-4 text-gray-400" />
									<span className="text-sm text-gray-600">
										<span className="font-medium">{a.submitted}</span>/
										{a.total_students} đã nộp
									</span>
								</div>
								{(a.status === "grading" || a.graded > 0) && (
									<div className="flex items-center gap-2">
										<CheckCircle className="w-4 h-4 text-amber-500" />
										<span className="text-sm text-gray-600">
											<span className="font-medium">{a.graded}</span>/
											{a.submitted} đã chấm
										</span>
									</div>
								)}
								{a.avg_score !== null && (
									<div className="text-sm text-gray-600">
										ĐTB:{" "}
										<span
											className={`font-semibold ${a.avg_score >= 7 ? "text-emerald-600" : a.avg_score >= 5 ? "text-amber-600" : "text-red-500"}`}
										>
											{a.avg_score}
										</span>
									</div>
								)}
								<div className="flex-1" />
								<div className="flex items-center gap-2">
									<div className="w-24 h-1.5 rounded-full bg-gray-100 overflow-hidden">
										<div
											className={`h-full rounded-full transition-all ${progressPct === 100 ? "bg-emerald-500" : "bg-blue-500"}`}
											style={{ width: `${progressPct}%` }}
										/>
									</div>
									<span className="text-xs text-gray-400">{progressPct}%</span>
								</div>
							</div>
						</div>
					);
				})}
			</div>

			{assignments.length === 0 && (
				<div className="py-16 text-center">
					<FileText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
					<p className="text-sm text-gray-500">Không có bài tập nào</p>
				</div>
			)}
		</div>
	);
}
