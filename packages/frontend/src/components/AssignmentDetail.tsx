"use client";

import {
	Archive,
	ArrowLeft,
	Edit,
	Loader2,
	Pause,
	Play,
	TrendingUp,
	Users,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
	type ContentAssignment,
	contentLibraryApi,
	getAssignmentId,
} from "@/lib/content-library";

const statusLabels = {
	active: "Đang hoạt động",
	paused: "Tạm dừng",
	archived: "Lưu trữ",
} as const;
const templateLabels = {
	curriculum_template: "Giáo trình",
	lesson_template: "Bài học",
} as const;
const targetLabels = { class: "Lớp học", student: "Học sinh" } as const;

function assignmentTitle(assignment: ContentAssignment): string {
	return (
		assignment.template_snapshot?.title ||
		assignment.template_snapshot?.lesson_title ||
		`${templateLabels[assignment.template_type]} ${assignment.template_id}`
	);
}

function getRecipientCount(assignment: ContentAssignment): number {
	return (
		assignment.recipients_count ??
		assignment.recipient_mapping?.applied_student_ids?.length ??
		assignment.student_contents?.length ??
		0
	);
}

export default function AssignmentDetail({
	id,
	basePath,
}: {
	id: string;
	basePath: "/admin/assignments" | "/teacher/content-library/assignments";
}) {
	const [assignment, setAssignment] = useState<ContentAssignment | null>(null);
	const [loading, setLoading] = useState(true);
	const [processing, setProcessing] = useState(false);
	const [error, setError] = useState("");
	const [notice, setNotice] = useState("");

	const load = useCallback(async () => {
		setLoading(true);
		setError("");
		try {
			const res = await contentLibraryApi.getAssignmentDetail(id);
			setAssignment(res.data);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Không thể tải assignment");
		} finally {
			setLoading(false);
		}
	}, [id]);

	useEffect(() => {
		void Promise.resolve().then(load);
	}, [load]);

	async function updateStatus(action: "pause" | "activate" | "archive") {
		setProcessing(true);
		setError("");
		setNotice("");
		try {
			if (action === "pause") await contentLibraryApi.pauseAssignment(id);
			if (action === "activate") await contentLibraryApi.activateAssignment(id);
			if (action === "archive") await contentLibraryApi.archiveAssignment(id);
			setNotice("Đã cập nhật trạng thái assignment.");
			await load();
		} catch (err) {
			setError(
				err instanceof Error ? err.message : "Không thể cập nhật assignment",
			);
		} finally {
			setProcessing(false);
		}
	}

	const recipientCount = useMemo(
		() => (assignment ? getRecipientCount(assignment) : 0),
		[assignment],
	);

	if (loading)
		return (
			<div
				data-testid="assignment-detail-loading"
				className="flex justify-center py-20"
			>
				<Loader2 className="h-8 w-8 animate-spin text-blue-600" />
			</div>
		);
	if (error && !assignment)
		return (
			<div
				role="alert"
				data-testid="assignment-detail-error"
				className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"
			>
				{error}
			</div>
		);
	if (!assignment)
		return (
			<div
				data-testid="assignment-detail-empty"
				className="rounded-xl border border-dashed border-gray-200 p-8 text-center text-sm text-gray-500"
			>
				Không tìm thấy assignment.
			</div>
		);

	return (
		<div data-testid="assignment-detail" className="space-y-6">
			<nav
				aria-label="Điều hướng assignment"
				className="flex flex-wrap items-center gap-3 text-sm"
			>
				<Link
					href={basePath}
					className="inline-flex items-center gap-2 font-medium text-gray-500 hover:text-gray-900"
				>
					<ArrowLeft className="h-4 w-4" /> Quay lại danh sách
				</Link>
				<Link
					href={`${basePath}/${id}/edit`}
					className="inline-flex items-center gap-2 rounded-lg bg-gray-100 px-3 py-1.5 font-semibold text-gray-700 hover:bg-gray-200"
				>
					<Edit className="h-4 w-4" /> Chỉnh sửa
				</Link>
				<Link
					href={`${basePath}/${id}/stats`}
					className="inline-flex items-center gap-2 rounded-lg bg-gray-100 px-3 py-1.5 font-semibold text-gray-700 hover:bg-gray-200"
				>
					<TrendingUp className="h-4 w-4" /> Thống kê
				</Link>
			</nav>
			{error && (
				<div
					role="alert"
					className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"
				>
					{error}
				</div>
			)}
			{notice && (
				<div
					role="status"
					className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700"
				>
					{notice}
				</div>
			)}

			<header className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
				<div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
					<div>
						<span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
							{statusLabels[assignment.status]}
						</span>
						<h1 className="mt-3 text-2xl font-bold text-gray-900">
							{assignmentTitle(assignment)}
						</h1>
						<p className="mt-2 text-sm text-gray-600">
							{templateLabels[assignment.template_type]} được gán cho{" "}
							{targetLabels[assignment.target_type].toLowerCase()}.
						</p>
					</div>
					<div className="flex flex-wrap gap-2">
						{assignment.status === "active" && (
							<button
								disabled={processing}
								onClick={() => updateStatus("pause")}
								className="inline-flex items-center gap-2 rounded-lg bg-amber-100 px-4 py-2 text-sm font-semibold text-amber-800 hover:bg-amber-200 disabled:opacity-60"
							>
								<Pause className="h-4 w-4" /> Tạm dừng
							</button>
						)}
						{assignment.status === "paused" && (
							<button
								disabled={processing}
								onClick={() => updateStatus("activate")}
								className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
							>
								<Play className="h-4 w-4" /> Kích hoạt
							</button>
						)}
						{assignment.status !== "archived" && (
							<button
								disabled={processing}
								onClick={() => updateStatus("archive")}
								className="inline-flex items-center gap-2 rounded-lg bg-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-300 disabled:opacity-60"
							>
								<Archive className="h-4 w-4" /> Lưu trữ
							</button>
						)}
					</div>
				</div>
			</header>

			<section
				aria-label="Thông tin assignment"
				className="grid gap-4 md:grid-cols-4"
			>
				<div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
					<p className="text-sm text-gray-500">Người nhận</p>
					<p className="mt-2 text-2xl font-bold text-gray-900">
						{recipientCount}
					</p>
				</div>
				<div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
					<p className="text-sm text-gray-500">Loại template</p>
					<p className="mt-2 text-lg font-bold text-gray-900">
						{templateLabels[assignment.template_type]}
					</p>
				</div>
				<div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
					<p className="text-sm text-gray-500">Đối tượng</p>
					<p className="mt-2 text-lg font-bold text-gray-900">
						{targetLabels[assignment.target_type]}
					</p>
				</div>
				<div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
					<p className="text-sm text-gray-500">Tự áp dụng HS mới</p>
					<p className="mt-2 text-lg font-bold text-gray-900">
						{assignment.auto_apply_new_students ? "Có" : "Không"}
					</p>
				</div>
			</section>

			<section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
				<h2 className="text-lg font-bold text-gray-900">Chi tiết phân phối</h2>
				<dl className="mt-4 grid gap-3 text-sm md:grid-cols-2">
					<div className="rounded-xl bg-gray-50 p-3">
						<dt className="text-gray-500">Assignment ID</dt>
						<dd className="mt-1 break-all font-semibold text-gray-900">
							{getAssignmentId(assignment)}
						</dd>
					</div>
					<div className="rounded-xl bg-gray-50 p-3">
						<dt className="text-gray-500">Template ID</dt>
						<dd className="mt-1 break-all font-semibold text-gray-900">
							{assignment.template_id}
						</dd>
					</div>
					<div className="rounded-xl bg-gray-50 p-3">
						<dt className="text-gray-500">Target ID</dt>
						<dd className="mt-1 break-all font-semibold text-gray-900">
							{assignment.target_id}
						</dd>
					</div>
					<div className="rounded-xl bg-gray-50 p-3">
						<dt className="text-gray-500">Ngày tạo</dt>
						<dd className="mt-1 font-semibold text-gray-900">
							{new Date(assignment.createdAt).toLocaleString("vi-VN")}
						</dd>
					</div>
				</dl>
			</section>
		</div>
	);
}
