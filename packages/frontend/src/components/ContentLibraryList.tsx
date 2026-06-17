"use client";

import {
	Archive,
	BookOpen,
	FileText,
	Pause,
	Play,
	Plus,
	RefreshCw,
	Search,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
	type ContentAssignment,
	type ContentAssignmentStatus,
	type ContentDifficultyLevel,
	type ContentTemplateStatus,
	type CurriculumTemplate,
	contentLibraryApi,
	getAssignmentId,
	getTemplateId,
	type LessonTemplate,
	type PaginationMeta,
} from "@/lib/content-library";

const statusLabels: Record<ContentTemplateStatus, string> = {
	draft: "Bản nháp",
	published: "Đã xuất bản",
	archived: "Lưu trữ",
};

const statusClasses: Record<ContentTemplateStatus, string> = {
	draft: "bg-amber-50 text-amber-700 border-amber-200",
	published: "bg-emerald-50 text-emerald-700 border-emerald-200",
	archived: "bg-gray-50 text-gray-700 border-gray-200",
};

const assignmentStatusLabels: Record<ContentAssignmentStatus, string> = {
	active: "Đang hoạt động",
	paused: "Tạm dừng",
	archived: "Lưu trữ",
};

const assignmentStatusClasses: Record<ContentAssignmentStatus, string> = {
	active: "bg-emerald-50 text-emerald-700 border-emerald-200",
	paused: "bg-amber-50 text-amber-700 border-amber-200",
	archived: "bg-gray-50 text-gray-700 border-gray-200",
};

const difficultyLabels: Record<ContentDifficultyLevel, string> = {
	easy: "Cơ bản",
	medium: "Trung bình",
	hard: "Nâng cao",
};

type ContentTab = "curricula" | "lessons";

function StatusBadge({ status }: { status: ContentTemplateStatus }) {
	return (
		<span
			className={`rounded-full border px-2 py-0.5 text-xs font-medium ${statusClasses[status]}`}
		>
			{statusLabels[status]}
		</span>
	);
}

function AssignmentStatusBadge({
	status,
}: {
	status: ContentAssignmentStatus;
}) {
	return (
		<span
			className={`rounded-full border px-2 py-0.5 text-xs font-medium ${assignmentStatusClasses[status]}`}
		>
			{assignmentStatusLabels[status]}
		</span>
	);
}

function EmptyState({ label }: { label: string }) {
	return (
		<div className="rounded-xl border border-dashed border-gray-200 bg-white p-8 text-center text-sm text-gray-500">
			{label}
		</div>
	);
}

function PaginationControls({
	meta,
	onPageChange,
}: {
	meta: PaginationMeta;
	onPageChange: (page: number) => void;
}) {
	const canPrev = meta.page > 1;
	const canNext = meta.page < meta.totalPages;

	return (
		<div className="flex flex-col gap-2 rounded-xl border border-gray-100 bg-white px-4 py-3 text-sm text-gray-600 md:flex-row md:items-center md:justify-between">
			<span>
				Trang <span className="font-semibold text-gray-900">{meta.page}</span>/
				{Math.max(meta.totalPages, 1)} · {meta.total} mục
			</span>
			<div className="flex gap-2">
				<button
					onClick={() => onPageChange(meta.page - 1)}
					disabled={!canPrev}
					className="rounded-lg bg-gray-100 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-50"
				>
					Trước
				</button>
				<button
					onClick={() => onPageChange(meta.page + 1)}
					disabled={!canNext}
					className="rounded-lg bg-gray-100 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-50"
				>
					Sau
				</button>
			</div>
		</div>
	);
}

function assignmentTitle(assignment: ContentAssignment): string {
	return (
		assignment.template_snapshot?.title ||
		assignment.template_snapshot?.lesson_title ||
		`${assignment.template_type === "curriculum_template" ? "Giáo trình" : "Bài học"} ${assignment.template_id}`
	);
}

function recipientCount(assignment: ContentAssignment): number | undefined {
	return (
		assignment.recipients_count ??
		assignment.recipient_mapping?.applied_student_ids?.length ??
		assignment.student_contents?.length
	);
}

export default function ContentLibraryList({
	basePath,
	roleLabel,
}: {
	basePath: "/admin/content-library" | "/teacher/content-library";
	roleLabel: string;
}) {
	const [curricula, setCurricula] = useState<CurriculumTemplate[]>([]);
	const [lessons, setLessons] = useState<LessonTemplate[]>([]);
	const [assignments, setAssignments] = useState<ContentAssignment[]>([]);
	const [curriculumMeta, setCurriculumMeta] = useState<PaginationMeta>({
		total: 0,
		page: 1,
		limit: 10,
		totalPages: 1,
	});
	const [lessonMeta, setLessonMeta] = useState<PaginationMeta>({
		total: 0,
		page: 1,
		limit: 10,
		totalPages: 1,
	});
	const [assignmentMeta, setAssignmentMeta] = useState<PaginationMeta>({
		total: 0,
		page: 1,
		limit: 5,
		totalPages: 1,
	});
	const [activeTab, setActiveTab] = useState<ContentTab>("curricula");
	const [status, setStatus] = useState<"all" | ContentTemplateStatus>("all");
	const [search, setSearch] = useState("");
	const [loading, setLoading] = useState(true);
	const [assignmentsLoading, setAssignmentsLoading] = useState(false);
	const [processingAssignment, setProcessingAssignment] = useState<
		string | null
	>(null);
	const [error, setError] = useState("");
	const [assignmentError, setAssignmentError] = useState("");

	const pageSize = 10;
	const assignmentPageSize = 5;
	const contentMeta = activeTab === "curricula" ? curriculumMeta : lessonMeta;
	const assignmentRouteBase =
		basePath === "/teacher/content-library"
			? "/teacher/content-library/assignments"
			: "/admin/assignments";

	const curriculumQuery = useMemo(
		() => ({
			limit: pageSize,
			page: curriculumMeta.page,
			status: status === "all" ? undefined : status,
			search: search.trim() || undefined,
		}),
		[curriculumMeta.page, status, search],
	);
	const lessonQuery = useMemo(
		() => ({
			limit: pageSize,
			page: lessonMeta.page,
			status: status === "all" ? undefined : status,
			search: search.trim() || undefined,
		}),
		[lessonMeta.page, status, search],
	);

	const load = useCallback(async () => {
		setLoading(true);
		setError("");
		try {
			const [curriculumRes, lessonRes] = await Promise.all([
				contentLibraryApi.listCurriculumTemplates(curriculumQuery),
				contentLibraryApi.listLessonTemplates(lessonQuery),
			]);
			setCurricula(curriculumRes.data);
			setLessons(lessonRes.data);
			setCurriculumMeta(curriculumRes.meta);
			setLessonMeta(lessonRes.meta);
		} catch (err) {
			setError(
				err instanceof Error ? err.message : "Không thể tải thư viện nội dung",
			);
		} finally {
			setLoading(false);
		}
	}, [curriculumQuery, lessonQuery]);

	const loadAssignments = useCallback(
		async (page: number) => {
			setAssignmentsLoading(true);
			setAssignmentError("");
			try {
				const res = await contentLibraryApi.listAssignments({
					page,
					limit: assignmentPageSize,
				});
				setAssignments(res.data);
				setAssignmentMeta(res.meta);
			} catch (err) {
				setAssignmentError(
					err instanceof Error
						? err.message
						: "Không thể tải danh sách assignment",
				);
			} finally {
				setAssignmentsLoading(false);
			}
		},
		[],
	);

	useEffect(() => {
		void Promise.resolve().then(load);
	}, [load]);

	useEffect(() => {
		void Promise.resolve().then(() => loadAssignments(1));
	}, [loadAssignments]);

	useEffect(() => {
		queueMicrotask(() => {
			setCurriculumMeta((prev) => ({ ...prev, page: 1 }));
			setLessonMeta((prev) => ({ ...prev, page: 1 }));
		});
	}, [status, search]);

	async function updateAssignmentStatus(
		id: string,
		action: "pause" | "activate" | "archive",
	) {
		setProcessingAssignment(id);
		setAssignmentError("");
		try {
			if (action === "pause") await contentLibraryApi.pauseAssignment(id);
			if (action === "activate") await contentLibraryApi.activateAssignment(id);
			if (action === "archive") await contentLibraryApi.archiveAssignment(id);
			await loadAssignments(assignmentMeta.page);
		} catch (err) {
			setAssignmentError(
				err instanceof Error ? err.message : "Không thể cập nhật assignment",
			);
		} finally {
			setProcessingAssignment(null);
		}
	}

	return (
		<div className="space-y-6">
			<div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
				<div>
					<p className="text-sm font-medium text-indigo-600">{roleLabel}</p>
					<h1 className="text-2xl font-bold text-gray-900">
						Thư viện giáo trình & bài học AI
					</h1>
					<p className="mt-1 text-sm text-gray-500">
						Tạo, xem trước và xuất bản template nội dung dùng lại cho lớp học.
					</p>
				</div>
				<div className="flex flex-wrap gap-2">
					<Link
						href={`${basePath}/curricula/new`}
						className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
					>
						<Plus className="h-4 w-4" /> Tạo giáo trình
					</Link>
					<Link
						href={`${basePath}/lessons/new`}
						className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
					>
						<Plus className="h-4 w-4" /> Tạo bài học
					</Link>
				</div>
			</div>

			<div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
				<div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
					<div className="relative md:w-80">
						<Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
						<input
							value={search}
							onChange={(event) => setSearch(event.target.value)}
							placeholder="Tìm theo tiêu đề/mục tiêu..."
							className="w-full rounded-lg border border-gray-200 py-2 pl-9 pr-3 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
						/>
					</div>
					<div className="flex flex-wrap gap-2">
						{(["all", "draft", "published", "archived"] as const).map(
							(item) => (
								<button
									key={item}
									onClick={() => setStatus(item)}
									className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${status === item ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
								>
									{item === "all" ? "Tất cả" : statusLabels[item]}
								</button>
							),
						)}
						<button
							onClick={load}
							className="inline-flex items-center gap-1 rounded-lg bg-gray-100 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-200"
						>
							<RefreshCw className="h-3.5 w-3.5" /> Tải lại
						</button>
					</div>
				</div>
			</div>

			<div className="flex rounded-xl border border-gray-200 bg-white p-1 shadow-sm">
				<button
					onClick={() => setActiveTab("curricula")}
					className={`flex-1 rounded-lg px-4 py-2 text-sm font-semibold ${activeTab === "curricula" ? "bg-indigo-600 text-white" : "text-gray-600 hover:bg-gray-50"}`}
				>
					Giáo trình ({curriculumMeta.total})
				</button>
				<button
					onClick={() => setActiveTab("lessons")}
					className={`flex-1 rounded-lg px-4 py-2 text-sm font-semibold ${activeTab === "lessons" ? "bg-emerald-600 text-white" : "text-gray-600 hover:bg-gray-50"}`}
				>
					Bài học ({lessonMeta.total})
				</button>
			</div>

			{error && (
				<div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
					{error}
				</div>
			)}

			{loading ? (
				<div className="flex items-center justify-center py-20">
					<div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent" />
				</div>
			) : (
				<section className="space-y-3">
					<div className="flex items-center gap-2">
						{activeTab === "curricula" ? (
							<BookOpen className="h-5 w-5 text-indigo-600" />
						) : (
							<FileText className="h-5 w-5 text-emerald-600" />
						)}
						<h2 className="text-lg font-bold text-gray-900">
							{activeTab === "curricula" ? "Giáo trình" : "Bài học"}
						</h2>
					</div>

					{activeTab === "curricula" &&
						(curricula.length === 0 ? (
							<EmptyState label="Chưa có giáo trình phù hợp bộ lọc." />
						) : (
							curricula.map((item) => (
								<Link
									key={getTemplateId(item)}
									href={`${basePath}/curricula/${getTemplateId(item)}`}
									className="block rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition hover:border-indigo-300 hover:shadow-md"
								>
									<div className="flex items-start justify-between gap-3">
										<div>
											<h3 className="font-semibold text-gray-900">
												{item.title}
											</h3>
											<p className="mt-1 line-clamp-2 text-sm text-gray-500">
												{item.description ||
													item.target_goal ||
													"Chưa có mô tả"}
											</p>
										</div>
										<StatusBadge status={item.status} />
									</div>
									<div className="mt-3 flex flex-wrap gap-2 text-xs text-gray-500">
										<span>Lớp {item.grade_level}</span>
										<span>•</span>
										<span>{difficultyLabels[item.difficulty_level]}</span>
										<span>•</span>
										<span>{item.estimated_total_sessions ?? 0} buổi</span>
									</div>
								</Link>
							))
						))}

					{activeTab === "lessons" &&
						(lessons.length === 0 ? (
							<EmptyState label="Chưa có bài học phù hợp bộ lọc." />
						) : (
							lessons.map((item) => (
								<Link
									key={getTemplateId(item)}
									href={`${basePath}/lessons/${getTemplateId(item)}`}
									className="block rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition hover:border-emerald-300 hover:shadow-md"
								>
									<div className="flex items-start justify-between gap-3">
										<div>
											<h3 className="font-semibold text-gray-900">
												{item.lesson_title}
											</h3>
											<p className="mt-1 line-clamp-2 text-sm text-gray-500">
												{item.lesson_objective ||
													item.topic ||
													"Chưa có mục tiêu"}
											</p>
										</div>
										<StatusBadge status={item.status} />
									</div>
									<div className="mt-3 flex flex-wrap gap-2 text-xs text-gray-500">
										<span>Lớp {item.grade_level}</span>
										<span>•</span>
										<span>{difficultyLabels[item.difficulty_level]}</span>
										<span>•</span>
										<span>{item.estimated_minutes ?? 0} phút</span>
									</div>
								</Link>
							))
						))}

					<PaginationControls
						meta={contentMeta}
						onPageChange={(page) =>
							activeTab === "curricula"
								? setCurriculumMeta((prev) => ({ ...prev, page }))
								: setLessonMeta((prev) => ({ ...prev, page }))
						}
					/>
				</section>
			)}

			<section className="space-y-3 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
				<div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
					<div>
						<h2 className="text-lg font-bold text-gray-900">
							Assignments nội dung
						</h2>
						<p className="text-sm text-gray-500">
							Theo dõi các nội dung đã gán và tạm dừng/kích hoạt/lưu trữ khi
							cần.
						</p>
					</div>
					<button
						onClick={() => loadAssignments(assignmentMeta.page)}
						className="inline-flex items-center gap-1 rounded-lg bg-gray-100 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-200"
					>
						<RefreshCw className="h-3.5 w-3.5" /> Tải lại assignments
					</button>
				</div>

				{assignmentError && (
					<div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
						{assignmentError}
					</div>
				)}
				{assignmentsLoading ? (
					<div className="flex justify-center py-8">
						<div className="h-6 w-6 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
					</div>
				) : assignments.length === 0 ? (
					<EmptyState label="Chưa có assignment nội dung nào." />
				) : (
					<div className="space-y-3">
						{assignments.map((assignment) => {
							const id = getAssignmentId(assignment);
							const count = recipientCount(assignment);
							return (
								<div
									key={id}
									className="rounded-xl border border-gray-100 bg-gray-50 p-4"
								>
									<div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
										<div>
											<div className="flex flex-wrap items-center gap-2">
												<h3 className="font-semibold text-gray-900">
													{assignmentTitle(assignment)}
												</h3>
												<AssignmentStatusBadge status={assignment.status} />
											</div>
											<div className="mt-2 flex flex-wrap gap-2 text-xs text-gray-500">
												<span>
													{assignment.template_type === "curriculum_template"
														? "Giáo trình"
														: "Bài học"}
												</span>
												<span>•</span>
												<span>
													{assignment.target_type === "class"
														? "Lớp"
														: "Học sinh"}
													:{" "}
													{typeof assignment.target_id === "string"
														? assignment.target_id
														: String(assignment.target_id)}
												</span>
												{typeof count === "number" && (
													<>
														<span>•</span>
														<span>{count} học sinh</span>
													</>
												)}
												<span>•</span>
												<span>
													{new Date(assignment.createdAt).toLocaleDateString(
														"vi-VN",
													)}
												</span>
											</div>
										</div>
										<div className="flex flex-wrap gap-2">
											<Link
												data-testid={`content-library-assignment-detail-link-${id}`}
												href={`${assignmentRouteBase}/${id}`}
												className="inline-flex items-center gap-1 rounded-lg bg-blue-100 px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-200"
											>
												Chi tiết
											</Link>
											<Link
												data-testid={`content-library-assignment-stats-link-${id}`}
												href={`${assignmentRouteBase}/${id}/stats`}
												className="inline-flex items-center gap-1 rounded-lg bg-indigo-100 px-3 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-200"
											>
												Thống kê
											</Link>
											<Link
												data-testid={`content-library-assignment-edit-link-${id}`}
												href={`${assignmentRouteBase}/${id}/edit`}
												className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-200"
											>
												Sửa
											</Link>
											{assignment.status === "active" && (
												<button
													onClick={() => updateAssignmentStatus(id, "pause")}
													disabled={processingAssignment === id}
													className="inline-flex items-center gap-1 rounded-lg bg-amber-100 px-3 py-1.5 text-xs font-semibold text-amber-700 hover:bg-amber-200 disabled:opacity-50"
												>
													<Pause className="h-3.5 w-3.5" /> Tạm dừng
												</button>
											)}
											{assignment.status === "paused" && (
												<button
													onClick={() => updateAssignmentStatus(id, "activate")}
													disabled={processingAssignment === id}
													className="inline-flex items-center gap-1 rounded-lg bg-emerald-100 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-200 disabled:opacity-50"
												>
													<Play className="h-3.5 w-3.5" /> Kích hoạt
												</button>
											)}
											{assignment.status !== "archived" && (
												<button
													onClick={() => updateAssignmentStatus(id, "archive")}
													disabled={processingAssignment === id}
													className="inline-flex items-center gap-1 rounded-lg bg-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-300 disabled:opacity-50"
												>
													<Archive className="h-3.5 w-3.5" /> Lưu trữ
												</button>
											)}
										</div>
									</div>
								</div>
							);
						})}
					</div>
				)}

				<PaginationControls
					meta={assignmentMeta}
					onPageChange={loadAssignments}
				/>
			</section>
		</div>
	);
}
