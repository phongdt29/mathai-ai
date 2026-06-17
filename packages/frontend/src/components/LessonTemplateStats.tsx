"use client";

import {
	ArrowLeft,
	BookOpenCheck,
	Clock,
	FileQuestion,
	Loader2,
	Target,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
	type ContentDifficultyLevel,
	contentLibraryApi,
	type LessonTemplate,
	type TemplateAnswerType,
} from "@/lib/content-library";

const answerLabels: Record<TemplateAnswerType, string> = {
	multiple_choice: "Trắc nghiệm",
	short_answer: "Trả lời ngắn",
	essay: "Tự luận",
};

const difficultyLabels: Record<ContentDifficultyLevel, string> = {
	easy: "Cơ bản",
	medium: "Trung bình",
	hard: "Nâng cao",
};

function countWords(value: string | null | undefined): number {
	return (value || "").trim().split(/\s+/).filter(Boolean).length;
}

export default function LessonTemplateStats({
	id,
	basePath,
}: {
	id: string;
	basePath: "/admin/content-library" | "/teacher/content-library";
}) {
	const [template, setTemplate] = useState<LessonTemplate | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");

	useEffect(() => {
		let active = true;
		queueMicrotask(() => {
			if (!active) return;
			setLoading(true);
			setError("");
			contentLibraryApi
			.getLessonTemplate(id)
			.then((res) => {
				if (active) setTemplate(res.data);
			})
			.catch((err) => {
				if (active)
					setError(
						err instanceof Error
							? err.message
							: "Không thể tải thống kê bài học",
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

	const stats = useMemo(() => {
		const exercises = template?.exercises || [];
		const answerTypeCounts = exercises.reduce<Record<string, number>>(
			(acc, exercise) => {
				acc[exercise.answer_type] = (acc[exercise.answer_type] || 0) + 1;
				return acc;
			},
			{},
		);
		return {
			exerciseCount: exercises.length,
			theoryWords: countWords(template?.theory_content),
			objectiveWords: countWords(template?.lesson_objective),
			estimatedMinutes: template?.estimated_minutes || 0,
			answerTypeCounts,
		};
	}, [template]);

	if (loading)
		return (
			<div
				data-testid="lesson-stats-loading"
				className="flex justify-center py-20"
			>
				<Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
			</div>
		);
	if (error && !template)
		return (
			<div
				role="alert"
				data-testid="lesson-stats-error"
				className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"
			>
				{error}
			</div>
		);
	if (!template)
		return (
			<div
				data-testid="lesson-stats-empty"
				className="rounded-xl border border-dashed border-gray-200 p-8 text-center text-sm text-gray-500"
			>
				Không tìm thấy dữ liệu thống kê.
			</div>
		);

	return (
		<div data-testid="lesson-stats" className="space-y-6">
			<nav aria-label="Điều hướng thống kê bài học">
				<Link
					href={`${basePath}/lessons/${id}`}
					className="inline-flex items-center gap-2 text-sm font-medium text-gray-500 hover:text-gray-900"
				>
					<ArrowLeft className="h-4 w-4" /> Quay lại chi tiết bài học
				</Link>
			</nav>
			<header>
				<p className="text-sm font-medium text-emerald-600">
					Thống kê lesson template
				</p>
				<h1 className="mt-1 text-2xl font-bold text-gray-900">
					{template.lesson_title}
				</h1>
				<p className="mt-1 text-sm text-gray-500">
					Tổng quan độ dài nội dung, bài tập và mức độ sẵn sàng trước khi gán
					cho học sinh.
				</p>
			</header>

			<section
				aria-label="Thẻ thống kê bài học"
				className="grid gap-4 md:grid-cols-4"
			>
				<div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
					<BookOpenCheck className="h-5 w-5 text-emerald-600" />
					<p className="mt-3 text-sm text-gray-500">Từ lý thuyết</p>
					<p className="text-2xl font-bold text-gray-900">
						{stats.theoryWords}
					</p>
				</div>
				<div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
					<Target className="h-5 w-5 text-indigo-600" />
					<p className="mt-3 text-sm text-gray-500">Từ mục tiêu</p>
					<p className="text-2xl font-bold text-gray-900">
						{stats.objectiveWords}
					</p>
				</div>
				<div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
					<Clock className="h-5 w-5 text-amber-600" />
					<p className="mt-3 text-sm text-gray-500">Thời lượng</p>
					<p className="text-2xl font-bold text-gray-900">
						{stats.estimatedMinutes} phút
					</p>
				</div>
				<div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
					<FileQuestion className="h-5 w-5 text-blue-600" />
					<p className="mt-3 text-sm text-gray-500">Bài tập</p>
					<p className="text-2xl font-bold text-gray-900">
						{stats.exerciseCount}
					</p>
				</div>
			</section>

			<section className="grid gap-4 lg:grid-cols-2">
				<div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
					<h2 className="text-lg font-bold text-gray-900">Phân loại bài tập</h2>
					<div className="mt-4 space-y-3">
						{Object.entries(answerLabels).map(([type, label]) => {
							const count = stats.answerTypeCounts[type] || 0;
							const percent =
								stats.exerciseCount > 0
									? Math.round((count / stats.exerciseCount) * 100)
									: 0;
							return (
								<div key={type}>
									<div className="flex justify-between text-sm">
										<span className="font-medium text-gray-700">{label}</span>
										<span className="text-gray-500">
											{count} câu · {percent}%
										</span>
									</div>
									<div className="mt-1 h-2 rounded-full bg-gray-100">
										<div
											className="h-2 rounded-full bg-emerald-500"
											style={{ width: `${percent}%` }}
										/>
									</div>
								</div>
							);
						})}
					</div>
				</div>
				<div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
					<h2 className="text-lg font-bold text-gray-900">
						Thông tin xuất bản
					</h2>
					<dl className="mt-4 grid gap-3 text-sm">
						<div className="flex justify-between rounded-xl bg-gray-50 p-3">
							<dt className="text-gray-500">Trạng thái</dt>
							<dd className="font-semibold text-gray-900">{template.status}</dd>
						</div>
						<div className="flex justify-between rounded-xl bg-gray-50 p-3">
							<dt className="text-gray-500">Độ khó</dt>
							<dd className="font-semibold text-gray-900">
								{difficultyLabels[template.difficulty_level]}
							</dd>
						</div>
						<div className="flex justify-between rounded-xl bg-gray-50 p-3">
							<dt className="text-gray-500">Ngày tạo</dt>
							<dd className="font-semibold text-gray-900">
								{new Date(template.createdAt).toLocaleDateString("vi-VN")}
							</dd>
						</div>
						<div className="flex justify-between rounded-xl bg-gray-50 p-3">
							<dt className="text-gray-500">Cập nhật</dt>
							<dd className="font-semibold text-gray-900">
								{new Date(template.updatedAt).toLocaleDateString("vi-VN")}
							</dd>
						</div>
					</dl>
				</div>
			</section>
		</div>
	);
}
