"use client";

import { ArrowLeft, Loader2, Save } from "lucide-react";
import Link from "next/link";
import { type FormEvent, useEffect, useState } from "react";
import {
	type ContentAssignment,
	type ContentAssignmentStatus,
	contentLibraryApi,
} from "@/lib/content-library";

const statusOptions: Array<{ value: ContentAssignmentStatus; label: string }> =
	[
		{ value: "active", label: "Đang hoạt động" },
		{ value: "paused", label: "Tạm dừng" },
		{ value: "archived", label: "Lưu trữ" },
	];

function titleOf(assignment: ContentAssignment): string {
	return (
		assignment.template_snapshot?.title ||
		assignment.template_snapshot?.lesson_title ||
		assignment.template_id
	);
}

export default function AssignmentEdit({
	id,
	basePath,
}: {
	id: string;
	basePath: "/admin/assignments" | "/teacher/content-library/assignments";
}) {
	const [assignment, setAssignment] = useState<ContentAssignment | null>(null);
	const [status, setStatus] = useState<ContentAssignmentStatus>("active");
	const [autoApply, setAutoApply] = useState(false);
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState("");
	const [notice, setNotice] = useState("");
	const isArchivedAssignment = assignment?.status === "archived";

	useEffect(() => {
		let active = true;
		queueMicrotask(() => {
			if (!active) return;
			setLoading(true);
			setError("");
			contentLibraryApi
			.getAssignmentDetail(id)
			.then((res) => {
				if (!active) return;
				setAssignment(res.data);
				setStatus(res.data.status);
				setAutoApply(Boolean(res.data.auto_apply_new_students));
			})
			.catch((err) => {
				if (active)
					setError(
						err instanceof Error ? err.message : "Không thể tải bài tập",
					);
			})
			.finally(() => {
				if (active) setLoading(false);
			});
		});
		return () => {
			active = false;
		};
	}, [id]);

	async function onSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!assignment) return;
		setSaving(true);
		setError("");
		setNotice("");
		try {
			if (assignment?.status === "archived" && status === "active") {
				setError(
					"Bài tập lưu trữ không thể được kích hoạt lại từ màn hình này vì các lượt gửi đã lưu trữ không được khôi phục.",
				);
				return;
			}

			let updatedAssignment = assignment;
			if (assignment.auto_apply_new_students !== autoApply) {
				const res = await contentLibraryApi.updateAssignment(id, {
					auto_apply_new_students: autoApply,
				});
				updatedAssignment = res.data;
			}
			if (assignment?.status !== status) {
				if (status === "active") {
					const res = await contentLibraryApi.activateAssignment(id);
					updatedAssignment = res.data;
				}
				if (status === "paused") {
					const res = await contentLibraryApi.pauseAssignment(id);
					updatedAssignment = res.data;
				}
				if (status === "archived") {
					const res = await contentLibraryApi.archiveAssignment(id);
					updatedAssignment = res.data;
				}
			}
			setAssignment(updatedAssignment);
			setStatus(updatedAssignment.status);
			setAutoApply(Boolean(updatedAssignment.auto_apply_new_students));
			setNotice("Đã lưu thay đổi bài tập.");
		} catch (err) {
			setError(err instanceof Error ? err.message : "Không thể lưu bài tập");
		} finally {
			setSaving(false);
		}
	}

	if (loading) {
		return (
			<div
				data-testid="assignment-edit-loading"
				className="flex justify-center py-20"
			>
				<Loader2 className="h-8 w-8 animate-spin text-blue-600" />
			</div>
		);
	}
	if (error && !assignment) {
		return (
			<div
				role="alert"
				data-testid="assignment-edit-error"
				className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"
			>
				{error}
			</div>
		);
	}
	if (!assignment) {
		return (
			<div
				data-testid="assignment-edit-empty"
				className="rounded-xl border border-dashed border-gray-200 p-8 text-center text-sm text-gray-500"
			>
				Không tìm thấy bài tập để chỉnh sửa.
			</div>
		);
	}

	return (
		<div data-testid="assignment-edit" className="mx-auto max-w-3xl space-y-6">
			<nav aria-label="Điều hướng chỉnh sửa bài tập">
				<Link
					href={`${basePath}/${id}`}
					className="inline-flex items-center gap-2 text-sm font-medium text-gray-500 hover:text-gray-900"
				>
					<ArrowLeft className="h-4 w-4" /> Quay lại chi tiết bài tập
				</Link>
			</nav>
			<header>
				<h1 className="text-2xl font-bold text-gray-900">
					Chỉnh sửa bài tập
				</h1>
				<p className="mt-1 text-sm text-gray-500">
					Điều chỉnh trạng thái phân phối cho “{titleOf(assignment)}”.
				</p>
			</header>

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
					className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800"
				>
					{notice}
				</div>
			)}

			<form
				onSubmit={onSubmit}
				className="space-y-5 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm"
			>
				<div>
					<label
						htmlFor="assignment-title"
						className="text-sm font-semibold text-gray-700"
					>
						Nội dung được gán
					</label>
					<div id="assignment-title-display" className="mt-1 w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-600">{titleOf(assignment)}</div>
				</div>
				<div>
					<label
						htmlFor="assignment-status"
						className="text-sm font-semibold text-gray-700"
					>
						Trạng thái
					</label>
					<select
						id="assignment-status"
						value={status}
						onChange={(e) =>
							setStatus(e.target.value as ContentAssignmentStatus)
						}
						className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
					>
						{statusOptions.map((option) => (
							<option
								key={option.value}
								value={option.value}
								disabled={isArchivedAssignment && option.value === "active"}
							>
								{option.label}
							</option>
						))}
					</select>
					{isArchivedAssignment && (
						<p className="mt-2 text-xs text-gray-500">
							Bài tập lưu trữ không thể được kích hoạt lại từ màn hình này
							vì các lượt gửi đã lưu trữ không được khôi phục. Tạo bài tập mới
							nếu cần phân phối lại nội dung.
						</p>
					)}
				</div>
				<div className="rounded-xl border border-gray-200 p-4">
					<label
						htmlFor="assignment-auto-apply"
						className="flex items-start gap-3 text-sm font-semibold text-gray-700"
					>
						<input
							id="assignment-auto-apply"
							type="checkbox"
							checked={autoApply}
							onChange={(e) => setAutoApply(e.target.checked)}
							className="mt-1"
						/>
						<span>
							<span className="block">Tự áp dụng cho học sinh mới</span>
							<span className="mt-1 block font-normal text-gray-500">
								Khi bật, học sinh mới được thêm vào lớp sẽ nhận nội dung này tự
								động.
							</span>
						</span>
					</label>
				</div>
				<div className="flex flex-col-reverse gap-3 border-t border-gray-100 pt-5 sm:flex-row sm:justify-end">
					<Link
						href={`${basePath}/${id}`}
						className="inline-flex justify-center rounded-lg bg-gray-100 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-200"
					>
						Hủy
					</Link>
					<button
						type="submit"
						disabled={saving}
						className="inline-flex justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
					>
						<Save className="h-4 w-4" />{" "}
						{saving ? "Đang lưu..." : "Lưu thay đổi"}
					</button>
				</div>
			</form>
		</div>
	);
}
