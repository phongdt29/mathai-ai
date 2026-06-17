"use client";

import { ArrowLeft, Loader2 } from "lucide-react";
import Link from "next/link";
import { type FormEvent, useEffect, useState } from "react";
import {
	type ContentDifficultyLevel,
	contentLibraryApi,
	type LessonTemplate,
} from "@/lib/content-library";

const difficultyLabels: Record<ContentDifficultyLevel, string> = {
	easy: "Cơ bản",
	medium: "Trung bình",
	hard: "Nâng cao",
};

interface LessonEditFormState {
	status: LessonTemplate["status"];
	lesson_title: string;
	lesson_objective: string;
	theory_content: string;
	age_group: string;
	topic: string;
	difficulty_level: ContentDifficultyLevel;
	estimated_minutes: number;
}

function toFormState(template: LessonTemplate): LessonEditFormState {
	return {
		status: template.status,
		lesson_title: template.lesson_title || "",
		lesson_objective: template.lesson_objective || "",
		theory_content: template.theory_content || "",
		age_group: template.age_group || "",
		topic: template.topic || "",
		difficulty_level: template.difficulty_level || "medium",
		estimated_minutes: template.estimated_minutes || 45,
	};
}

export default function LessonTemplateEdit({
	id,
	basePath,
}: {
	id: string;
	basePath: "/admin/content-library" | "/teacher/content-library";
}) {
	const [form, setForm] = useState<LessonEditFormState | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");
	const [success, setSuccess] = useState("");
	const [saving, setSaving] = useState(false);
	const isPublishedTemplate = form?.status === "published";

	useEffect(() => {
		let active = true;
		queueMicrotask(() => {
			if (!active) return;
			setLoading(true);
			setError("");
			contentLibraryApi
			.getLessonTemplate(id)
			.then((res) => {
				if (active) setForm(toFormState(res.data));
			})
			.catch((err) => {
				if (active) {
					setError(
						err instanceof Error ? err.message : "Không thể tải bài học",
					);
				}
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
		if (!form) return;
		if (isPublishedTemplate) {
			setError("Không thể chỉnh sửa mẫu đã xuất bản");
			return;
		}
		setSaving(true);
		setError("");
		setSuccess("");
		try {
			const res = await contentLibraryApi.updateLessonTemplate(id, {
				lesson_title: form.lesson_title,
				lesson_objective: form.lesson_objective || null,
				theory_content: form.theory_content || null,
				topic: form.topic || null,
				difficulty_level: form.difficulty_level,
				estimated_minutes: Number(form.estimated_minutes) || null,
				age_group: form.age_group || null,
			});
			setForm(toFormState(res.data));
			setSuccess("Đã lưu thay đổi bài học.");
		} catch (err) {
			setError(err instanceof Error ? err.message : "Không thể lưu bài học");
		} finally {
			setSaving(false);
		}
	}

	if (loading) {
		return (
			<div
				data-testid="lesson-edit-loading"
				className="flex justify-center py-20"
			>
				<Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
			</div>
		);
	}
	if (error && !form) {
		return (
			<div
				role="alert"
				data-testid="lesson-edit-error"
				className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"
			>
				{error}
			</div>
		);
	}
	if (!form) {
		return (
			<div
				data-testid="lesson-edit-empty"
				className="rounded-xl border border-dashed border-gray-200 p-8 text-center text-sm text-gray-500"
			>
				Không tìm thấy bài học để chỉnh sửa.
			</div>
		);
	}

	return (
		<div data-testid="lesson-edit" className="mx-auto max-w-4xl space-y-6">
			<nav aria-label="Điều hướng chỉnh sửa bài học">
				<Link
					href={`${basePath}/lessons/${id}`}
					className="inline-flex items-center gap-2 text-sm font-medium text-gray-500 hover:text-gray-900"
				>
					<ArrowLeft className="h-4 w-4" /> Quay lại chi tiết bài học
				</Link>
			</nav>
			<header className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6">
				<p className="text-sm font-semibold text-emerald-700">
					Chỉnh sửa bài học
				</p>
				<h1 className="mt-2 text-2xl font-bold text-gray-900">
					{form.lesson_title || "Bài học"}
				</h1>
				<p className="mt-2 text-sm text-emerald-800">
					Cập nhật các thông tin có thể chỉnh sửa của mẫu bài học.
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
			{success && (
				<div
					role="status"
					className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700"
				>
					{success}
				</div>
			)}
			{isPublishedTemplate && (
				<div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm font-medium text-amber-800">
					Không thể chỉnh sửa mẫu đã xuất bản.
				</div>
			)}

			<form
				onSubmit={onSubmit}
				className="space-y-5 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm"
			>
				<div>
					<label
						htmlFor="lesson-title"
						className="text-sm font-semibold text-gray-700"
					>
						Tiêu đề bài học
					</label>
					<input
						id="lesson-title"
						value={form.lesson_title}
						disabled={isPublishedTemplate}
						onChange={(e) => setForm({ ...form, lesson_title: e.target.value })}
						className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
					/>
				</div>
				<div className="grid gap-4 md:grid-cols-3">
					<div>
						<label
							htmlFor="lesson-difficulty"
							className="text-sm font-semibold text-gray-700"
						>
							Độ khó
						</label>
						<select
							id="lesson-difficulty"
							value={form.difficulty_level}
							disabled={isPublishedTemplate}
							onChange={(e) =>
								setForm({
									...form,
									difficulty_level: e.target.value as ContentDifficultyLevel,
								})
							}
							className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
						>
							{Object.entries(difficultyLabels).map(([value, label]) => (
								<option key={value} value={value}>
									{label}
								</option>
							))}
						</select>
					</div>
					<div>
						<label
							htmlFor="lesson-minutes"
							className="text-sm font-semibold text-gray-700"
						>
							Thời lượng phút
						</label>
						<input
							id="lesson-minutes"
							type="number"
							min={1}
							max={240}
							value={form.estimated_minutes}
							disabled={isPublishedTemplate}
							onChange={(e) =>
								setForm({ ...form, estimated_minutes: Number(e.target.value) })
							}
							className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
						/>
					</div>
					<div>
						<label
							htmlFor="lesson-age"
							className="text-sm font-semibold text-gray-700"
						>
							Nhóm tuổi
						</label>
						<input
							id="lesson-age"
							value={form.age_group}
							disabled={isPublishedTemplate}
							onChange={(e) => setForm({ ...form, age_group: e.target.value })}
							className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
						/>
					</div>
				</div>
				<div>
					<label
						htmlFor="lesson-topic"
						className="text-sm font-semibold text-gray-700"
					>
						Chủ đề
					</label>
					<input
						id="lesson-topic"
						value={form.topic}
						disabled={isPublishedTemplate}
						onChange={(e) => setForm({ ...form, topic: e.target.value })}
						className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
					/>
				</div>
				<div>
					<label
						htmlFor="lesson-objective"
						className="text-sm font-semibold text-gray-700"
					>
						Mục tiêu bài học
					</label>
					<textarea
						id="lesson-objective"
						value={form.lesson_objective}
						disabled={isPublishedTemplate}
						onChange={(e) =>
							setForm({ ...form, lesson_objective: e.target.value })
						}
						rows={3}
						className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
					/>
				</div>
				<div>
					<label
						htmlFor="lesson-theory"
						className="text-sm font-semibold text-gray-700"
					>
						Nội dung lý thuyết
					</label>
					<textarea
						id="lesson-theory"
						value={form.theory_content}
						disabled={isPublishedTemplate}
						onChange={(e) =>
							setForm({ ...form, theory_content: e.target.value })
						}
						rows={12}
						className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
					/>
				</div>
				<div className="flex flex-col-reverse gap-3 border-t border-gray-100 pt-5 sm:flex-row sm:justify-end">
					<Link
						href={`${basePath}/lessons/${id}`}
						className="inline-flex justify-center rounded-lg bg-gray-100 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-200"
					>
						Hủy
					</Link>
					{!isPublishedTemplate ? (
						<button
							type="submit"
							data-testid="lesson-edit-save"
							aria-label="Lưu thay đổi"
							disabled={isPublishedTemplate || saving}
							className="inline-flex justify-center rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
						>
							{saving ? "Đang lưu..." : "Lưu thay đổi"}
						</button>
					) : (
						<span className="inline-flex cursor-not-allowed justify-center rounded-lg bg-gray-100 px-4 py-2 text-sm font-semibold text-gray-500">
							Published templates cannot be edited
						</span>
					)}
				</div>
			</form>
		</div>
	);
}
