"use client";

import { Archive, Loader2, Pause, Play, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
	type ContentAssignment,
	type ContentAssignmentStatus,
	contentLibraryApi,
	getAssignmentId,
	type PaginationMeta,
} from "@/lib/content-library";

const statusLabels: Record<ContentAssignmentStatus, string> = {
	active: "Đang hoạt động",
	paused: "Tạm dừng",
	archived: "Lưu trữ",
};

const statusClasses: Record<ContentAssignmentStatus, string> = {
	active: "bg-emerald-50 text-emerald-700 border-emerald-200",
	paused: "bg-amber-50 text-amber-700 border-amber-200",
	archived: "bg-gray-50 text-gray-700 border-gray-200",
};

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
				{Math.max(meta.totalPages, 1)} · {meta.total} assignment
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

export default function AssignmentList({
	basePath,
	roleLabel,
}: {
	basePath:
		| "/admin/assignments"
		| "/teacher/assignments"
		| "/teacher/content-library/assignments";
	roleLabel: string;
}) {
	const [assignments, setAssignments] = useState<ContentAssignment[]>([]);
	const [meta, setMeta] = useState<PaginationMeta>({
		total: 0,
		page: 1,
		limit: 10,
		totalPages: 1,
	});
	const [status, setStatus] = useState<"all" | ContentAssignmentStatus>("all");
	const [loading, setLoading] = useState(true);
	const [processing, setProcessing] = useState<string | null>(null);
	const [error, setError] = useState("");

	const load = useCallback(
		async (page: number) => {
			setLoading(true);
			setError("");
			try {
				const res = await contentLibraryApi.listAssignments({
					page,
					limit: meta.limit,
					status: status === "all" ? undefined : status,
				});
				setAssignments(res.data);
				setMeta(res.meta);
			} catch (err) {
				setError(
					err instanceof Error
						? err.message
						: "Không thể tải danh sách assignment",
				);
			} finally {
				setLoading(false);
			}
		},
		[meta.limit, status],
	);

	useEffect(() => {
		void Promise.resolve().then(() => load(1));
	}, [load]);

	async function updateAssignmentStatus(
		id: string,
		action: "pause" | "activate" | "archive",
	) {
		setProcessing(id);
		setError("");
		try {
			if (action === "pause") await contentLibraryApi.pauseAssignment(id);
			if (action === "activate") await contentLibraryApi.activateAssignment(id);
			if (action === "archive") await contentLibraryApi.archiveAssignment(id);
			await load(meta.page);
		} catch (err) {
			setError(
				err instanceof Error ? err.message : "Không thể cập nhật assignment",
			);
		} finally {
			setProcessing(null);
		}
	}

	return (
		<div data-testid="assignment-list" className="space-y-6">
			<header className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
				<div>
					<p className="text-sm font-medium text-blue-600">{roleLabel}</p>
					<h1 className="text-2xl font-bold text-gray-900">
						Kiểm tra & assignments
					</h1>
					<p className="mt-1 text-sm text-gray-500">
						Dùng assignment content-library hiện có để quản lý nội dung “kiểm
						tra” khi chưa có thư viện assessment-template riêng.
					</p>
				</div>
				<button
					onClick={() => load(meta.page)}
					className="inline-flex items-center gap-2 rounded-lg bg-gray-100 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-200"
				>
					<RefreshCw className="h-4 w-4" /> Tải lại
				</button>
			</header>

			<div
				role="tablist"
				aria-label="Lọc trạng thái assignment"
				className="flex flex-wrap gap-2 border-b border-gray-200 pb-3"
			>
				{(["all", "active", "paused", "archived"] as const).map((item) => (
					<button
						key={item}
						role="tab"
						aria-selected={status === item}
						onClick={() => setStatus(item)}
						className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${status === item ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
					>
						{item === "all" ? "Tất cả" : statusLabels[item]}
					</button>
				))}
			</div>

			{error && (
				<div
					role="alert"
					className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"
				>
					{error}
				</div>
			)}

			{loading ? (
				<div className="flex justify-center py-20">
					<Loader2 className="h-8 w-8 animate-spin text-blue-600" />
				</div>
			) : assignments.length === 0 ? (
				<div className="rounded-xl border border-dashed border-gray-200 bg-white p-10 text-center text-sm text-gray-500">
					Chưa có assignment/kiểm tra phù hợp bộ lọc.
				</div>
			) : (
				<section className="space-y-3" aria-label="Danh sách assignments">
					{assignments.map((assignment) => {
						const id = getAssignmentId(assignment);
						const count = recipientCount(assignment);
						return (
							<article
								key={id}
								className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"
							>
								<div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
									<Link href={`${basePath}/${id}`} className="min-w-0 flex-1">
										<div className="flex flex-wrap items-center gap-2">
											<h2 className="font-semibold text-gray-900">
												{assignmentTitle(assignment)}
											</h2>
											<span
												className={`rounded-full border px-2 py-0.5 text-xs font-medium ${statusClasses[assignment.status]}`}
											>
												{statusLabels[assignment.status]}
											</span>
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
												: {String(assignment.target_id)}
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
									</Link>
									<div className="flex flex-wrap gap-2">
										{assignment.status === "active" && (
											<button
												onClick={() => updateAssignmentStatus(id, "pause")}
												disabled={processing === id}
												className="inline-flex items-center gap-1 rounded-lg bg-amber-100 px-3 py-1.5 text-xs font-semibold text-amber-700 hover:bg-amber-200 disabled:opacity-50"
											>
												<Pause className="h-3.5 w-3.5" /> Tạm dừng
											</button>
										)}
										{assignment.status === "paused" && (
											<button
												onClick={() => updateAssignmentStatus(id, "activate")}
												disabled={processing === id}
												className="inline-flex items-center gap-1 rounded-lg bg-emerald-100 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-200 disabled:opacity-50"
											>
												<Play className="h-3.5 w-3.5" /> Kích hoạt
											</button>
										)}
										{assignment.status !== "archived" && (
											<button
												onClick={() => updateAssignmentStatus(id, "archive")}
												disabled={processing === id}
												className="inline-flex items-center gap-1 rounded-lg bg-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-300 disabled:opacity-50"
											>
												<Archive className="h-3.5 w-3.5" /> Lưu trữ
											</button>
										)}
									</div>
								</div>
							</article>
						);
					})}
				</section>
			)}

			<PaginationControls meta={meta} onPageChange={load} />
		</div>
	);
}
