"use client";

import {
	ArrowLeft,
	CheckCircle,
	Edit,
	Loader2,
	Send,
	TrendingUp,
	Users,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { contentLibraryApi, type LessonTemplate } from "@/lib/content-library";
import ContentAssignmentDialog from "./ContentAssignmentDialog";

const difficultyLabels = {
	easy: "Cơ bản",
	medium: "Trung bình",
	hard: "Nâng cao",
} as const;
const statusLabels = {
	draft: "Bản nháp",
	published: "Đã xuất bản",
	archived: "Lưu trữ",
} as const;
const answerTypeLabels = {
	multiple_choice: "Trắc nghiệm",
	short_answer: "Trả lời ngắn",
	essay: "Tự luận",
} as const;

function renderUnknown(value: unknown): string {
	if (!value) return "";
	if (Array.isArray(value))
		return value
			.map((item, index) => `${index + 1}. ${String(item)}`)
			.join("\n");
	if (typeof value === "object") return JSON.stringify(value, null, 2);
	return String(value);
}

export default function LessonTemplateDetail({
	id,
	basePath,
}: {
	id: string;
	basePath: "/admin/content-library" | "/teacher/content-library";
}) {
	const [template, setTemplate] = useState<LessonTemplate | null>(null);
	const [loading, setLoading] = useState(true);
	const [publishing, setPublishing] = useState(false);
	const [requestingPublish, setRequestingPublish] = useState(false);
	const [assignmentOpen, setAssignmentOpen] = useState(false);
	const [error, setError] = useState("");
	const [success, setSuccess] = useState("");
	const isAdmin = basePath.startsWith("/admin");
	const canEdit = template?.status !== "published";

	const load = useCallback(async () => {
		setLoading(true);
		setError("");
		try {
			const res = await contentLibraryApi.getLessonTemplate(id);
			setTemplate(res.data);
		} catch (err) {
			setError(
				err instanceof Error ? err.message : "Không thể tải bài học",
			);
		} finally {
			setLoading(false);
		}
	}, [id]);

	useEffect(() => {
		void Promise.resolve().then(load);
	}, [load]);

	async function publish() {
		setPublishing(true);
		setError("");
		setSuccess("");
		try {
			const res = await contentLibraryApi.publishLessonTemplate(id);
			setTemplate(res.data);
			setSuccess("Đã xuất bản bài học thành công.");
		} catch (err) {
			setError(
				err instanceof Error
					? err.message
					: "Không thể xuất bản bài học",
			);
		} finally {
			setPublishing(false);
		}
	}

	async function requestPublish() {
		setRequestingPublish(true);
		setError("");
		setSuccess("");
		try {
			await contentLibraryApi.requestPublishLessonTemplate(id);
			setSuccess(
				"Đã gửi yêu cầu duyệt xuất bản bài học. Theo dõi trạng thái tại trang Đề xuất.",
			);
		} catch (err) {
			setError(
				err instanceof Error
					? err.message
					: "Không thể gửi yêu cầu duyệt xuất bản bài học",
			);
		} finally {
			setRequestingPublish(false);
		}
	}

	if (loading)
		return (
			<div
				data-testid="lesson-detail-loading"
				className="flex justify-center py-20"
			>
				<Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
			</div>
		);
	if (error && !template)
		return (
			<div
				role="alert"
				data-testid="lesson-detail-error"
				className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"
			>
				{error}
			</div>
		);
	if (!template)
		return (
			<div
				data-testid="lesson-detail-empty"
				className="rounded-xl border border-dashed border-gray-200 p-8 text-center text-sm text-gray-500"
			>
				Không tìm thấy bài học.
			</div>
		);

	return (
		<div data-testid="lesson-detail" className="space-y-6">
			<nav
				aria-label="Điều hướng bài học"
				className="flex flex-wrap items-center gap-3 text-sm"
			>
				<Link
					href={basePath}
					className="inline-flex items-center gap-2 font-medium text-gray-500 hover:text-gray-900"
				>
					<ArrowLeft className="h-4 w-4" /> Quay lại thư viện
				</Link>
				{canEdit ? (
					<Link
						data-testid="lesson-edit-link"
						href={`${basePath}/lessons/${id}/edit`}
						className="inline-flex items-center gap-2 rounded-lg bg-gray-100 px-3 py-1.5 font-semibold text-gray-500 hover:bg-gray-200"
					>
						<Edit className="h-4 w-4" /> Chỉnh sửa
					</Link>
				) : (
					<span className="inline-flex cursor-not-allowed items-center gap-2 rounded-lg bg-gray-100 px-3 py-1.5 font-semibold text-gray-400" data-testid="lesson-edit-disabled">
						<Edit className="h-4 w-4" /> Published templates cannot be edited
					</span>
				)}
				<Link
					data-testid="lesson-stats-link"
					href={`${basePath}/lessons/${id}/stats`}
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
			{success && (
				<div
					role="status"
					className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700"
				>
					{success}
				</div>
			)}

			<div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
				<div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
					<div>
						<span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
							{statusLabels[template.status]}
						</span>
						<h1 className="mt-3 text-2xl font-bold text-gray-900">
							{template.lesson_title}
						</h1>
						<p className="mt-2 text-sm text-gray-600">
							{template.lesson_objective ||
								template.topic ||
								"Chưa có mục tiêu bài học."}
						</p>
					</div>
					<div className="flex flex-wrap gap-2">
						{isAdmin ? (
							<button
								onClick={publish}
								disabled={publishing || template.status === "published"}
								className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
							>
								<CheckCircle className="h-4 w-4" />{" "}
								{template.status === "published"
									? "Đã xuất bản"
									: publishing
										? "Đang xuất bản..."
										: "Xuất bản"}
							</button>
						) : (
							<button
								onClick={requestPublish}
								disabled={requestingPublish || template.status === "published"}
								className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
							>
								<Send className="h-4 w-4" />{" "}
								{template.status === "published"
									? "Đã xuất bản"
									: requestingPublish
										? "Đang gửi..."
										: "Gửi duyệt xuất bản"}
							</button>
						)}
						{template.status === "published" && (
							<button
								onClick={() => setAssignmentOpen(true)}
								className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
							>
								<Users className="h-4 w-4" /> Gán nội dung
							</button>
						)}
					</div>
				</div>
				<div className="mt-5 grid gap-3 text-sm md:grid-cols-4">
					<div className="rounded-xl bg-gray-50 p-3">
						<p className="text-gray-500">Khối lớp</p>
						<p className="font-semibold text-gray-900">
							Lớp {template.grade_level}
						</p>
					</div>
					<div className="rounded-xl bg-gray-50 p-3">
						<p className="text-gray-500">Độ khó</p>
						<p className="font-semibold text-gray-900">
							{difficultyLabels[template.difficulty_level]}
						</p>
					</div>
					<div className="rounded-xl bg-gray-50 p-3">
						<p className="text-gray-500">Thời lượng</p>
						<p className="font-semibold text-gray-900">
							{template.estimated_minutes ?? 0} phút
						</p>
					</div>
					<div className="rounded-xl bg-gray-50 p-3">
						<p className="text-gray-500">Bài tập</p>
						<p className="font-semibold text-gray-900">
							{template.exercises?.length ?? 0}
						</p>
					</div>
				</div>
			</div>

			{template.status === "published" && (
				<div className="rounded-2xl border border-blue-100 bg-blue-50 p-5">
					<div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
						<div>
							<h2 className="font-bold text-blue-950">
								Gán bài học cho lớp hoặc học sinh
							</h2>
							<p className="mt-1 text-sm text-blue-700">
								Tạo assignment từ bài học đã xuất bản để học
								sinh nhận nội dung theo cơ chế on-demand.
							</p>
						</div>
						<button
							onClick={() => setAssignmentOpen(true)}
							className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
						>
							<Users className="h-4 w-4" /> Gán nội dung
						</button>
					</div>
				</div>
			)}

			<section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
				<h2 className="text-lg font-bold text-gray-900">Lý thuyết</h2>
				<div className="prose prose-sm mt-4 max-w-none whitespace-pre-wrap text-gray-700">
					{template.theory_content || "Chưa có nội dung lý thuyết."}
				</div>
			</section>

			<section className="space-y-3">
				<h2 className="text-lg font-bold text-gray-900">Bài tập preview</h2>
				{(template.exercises || []).map((exercise) => (
					<div
						key={exercise._id}
						className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"
					>
						<div className="flex flex-wrap items-center gap-2 text-xs">
							<span className="rounded-full bg-gray-100 px-2 py-1 font-medium text-gray-600">
								Bài {exercise.order_index}
							</span>
							<span className="rounded-full bg-indigo-50 px-2 py-1 font-medium text-indigo-700">
								{answerTypeLabels[exercise.answer_type]}
							</span>
						</div>
						<p className="mt-3 font-semibold text-gray-900">
							{exercise.question_text}
						</p>
						{renderUnknown(exercise.choices) && (
							<pre className="mt-3 whitespace-pre-wrap rounded-xl bg-gray-50 p-3 text-xs text-gray-600">
								{renderUnknown(exercise.choices)}
							</pre>
						)}
						<div className="mt-3 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">
							<span className="font-semibold">Đáp án:</span>{" "}
							{exercise.correct_answer}
						</div>
						{renderUnknown(exercise.solution_steps) && (
							<pre className="mt-3 whitespace-pre-wrap rounded-xl bg-blue-50 p-3 text-xs text-blue-800">
								{renderUnknown(exercise.solution_steps)}
							</pre>
						)}
						{exercise.explanation && (
							<p className="mt-3 text-sm text-gray-600">
								{exercise.explanation}
							</p>
						)}
					</div>
				))}
				{(!template.exercises || template.exercises.length === 0) && (
					<div className="rounded-xl border border-dashed border-gray-200 p-8 text-center text-sm text-gray-500">
						Bài học chưa có bài tập.
					</div>
				)}
			</section>

			<ContentAssignmentDialog
				open={assignmentOpen}
				onClose={() => setAssignmentOpen(false)}
				templateType="lesson_template"
				templateId={template._id || template.id || id}
				templateTitle={template.lesson_title}
			/>
		</div>
	);
}
