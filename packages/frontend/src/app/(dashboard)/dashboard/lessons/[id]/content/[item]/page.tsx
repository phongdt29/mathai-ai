"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { LessonIllustration } from "@/components/LessonIllustration";
import { LessonTimelineNav } from "@/components/LessonTimelineNav";
import MathMarkdown from "@/components/MathMarkdown";
import { useAgeTheme } from "@/contexts/AgeThemeContext";
import { apiClient } from "@/lib/api";
import {
	buildLessonTimelineItems,
	getLessonContentCheckHref,
	getLessonContentItemHref,
	type ResolvedTheoryContentItem,
	resolveTheoryContentItem,
	stripMarkdownForDisplay,
} from "@/lib/lesson-content";
import { getLessonDetailEndpoint } from "@/lib/lesson-endpoints";
import {
	type FallbackTheorySectionDetail,
	getFallbackLessonDetail,
	getFallbackTheorySectionDetail,
} from "@/lib/lesson-fallbacks";

type LessonExercise = {
	_id?: string;
};

type LessonDetail = {
	_id: string;
	lesson_title: string;
	theory_content?: string | null;
	lesson_objective?: string | null;
	estimated_minutes?: number | null;
	status?: string;
	exercises?: LessonExercise[];
};

type ApiResponse<T> = {
	success: boolean;
	message?: string;
	data: T;
};

type ContentPageState = {
	lesson: LessonDetail;
	resolved: ResolvedTheoryContentItem;
	detail: FallbackTheorySectionDetail;
};

function buildGenericSectionDetail(
	lesson: LessonDetail,
	resolved: ResolvedTheoryContentItem,
): FallbackTheorySectionDetail {
	const current = resolved.displayText;
	const objective =
		stripMarkdownForDisplay(lesson.lesson_objective?.trim() || "") ||
		"hiểu và vận dụng bài học";

	return {
		itemNumber: resolved.itemNumber,
		title: current,
		explanation: `Mục này tập trung vào nội dung: "${current}". Khi học, hãy xác định khái niệm chính, điều kiện áp dụng và vai trò của nó trong mục tiêu "${objective}". Cách học hiệu quả là diễn giải lại bằng lời của mình trước khi chuyển sang ví dụ số hoặc hình minh họa.`,
		example: `Ví dụ ứng dụng: chọn một bài tập nhỏ trong bài "${lesson.lesson_title}", gạch chân dữ kiện liên quan đến "${current}", sau đó viết từng bước giải theo đúng quy tắc vừa học. Cuối cùng thay kết quả vào đề bài để kiểm tra tính hợp lý.`,
		practice: `Thực hành nhanh: hãy viết một câu hỏi về "${current}", tự giải trong 3 bước và ghi lại điểm còn chưa chắc để hỏi giáo viên hoặc Trợ lý AI.`,
	};
}

export default function LessonContentItemPage({
	params,
}: {
	params: Promise<{ id: string; item: string }>;
}) {
	const { id, item } = React.use(params);
	const { theme, ageGroup } = useAgeTheme();
	const [lesson, setLesson] = useState<LessonDetail | null>(null);
	const [loadingLesson, setLoadingLesson] = useState(true);
	const [error, setError] = useState<string | null>(null);

	const isElementary = ageGroup === "elementary";
	const isHigh = ageGroup === "high";
	const backToLessonHref = `/dashboard/lessons/${encodeURIComponent(id)}`;

	useEffect(() => {
		let cancelled = false;

		async function fetchLesson() {
			setLoadingLesson(true);
			setError(null);
			try {
				const lessonEndpoint = getLessonDetailEndpoint(id);
				let nextLesson: LessonDetail | null = null;

				if (!lessonEndpoint) {
					nextLesson = getFallbackLessonDetail(id);
				} else {
					const res =
						await apiClient<ApiResponse<LessonDetail>>(lessonEndpoint);
					nextLesson = res.data;
				}

				if (!cancelled) {
					setLesson(nextLesson);
				}
			} catch (err) {
				if (!cancelled) {
					setLesson(null);
					setError(
						err instanceof Error ? err.message : "Không thể tải mục bài học.",
					);
				}
			} finally {
				if (!cancelled) setLoadingLesson(false);
			}
		}

		fetchLesson();
		return () => {
			cancelled = true;
		};
	}, [id]);

	const state = useMemo<ContentPageState | null>(() => {
		if (!lesson) return null;

		const resolved = resolveTheoryContentItem(lesson.theory_content, item, {
			lessonTitle: lesson.lesson_title,
		});
		if (!resolved) return null;

		const lessonEndpoint = getLessonDetailEndpoint(id);
		const fallbackDetail = !lessonEndpoint
			? getFallbackTheorySectionDetail(id, resolved.itemNumber, {
					allowLegacy: false,
				})
			: null;
		const detail = fallbackDetail ?? buildGenericSectionDetail(lesson, resolved);

		return { lesson, resolved, detail };
	}, [lesson, id, item]);

	const timelineItems = useMemo(
		() =>
			lesson
				? buildLessonTimelineItems(
						id,
						lesson.theory_content,
						state
							? {
									kind: "section",
									itemNumber: state.resolved.itemNumber,
								}
							: { kind: "section", itemNumber: 1 },
						{ exerciseCount: lesson.exercises?.length ?? 0 },
					)
				: [],
		[lesson, id, state],
	);

	if (loadingLesson) {
		return (
			<div className={`max-w-3xl flex flex-col ${theme.sectionGap}`}>
				<div
					className={`${theme.cardRadius} ${theme.cardBg} ${theme.cardPadding} ${theme.cardBorder} shadow-sm`}
				>
					<p className="text-lg text-gray-600">Đang tải mục bài học...</p>
				</div>
			</div>
		);
	}

	if (!state) {
		return (
			<div className={`max-w-3xl flex flex-col ${theme.sectionGap}`}>
				<div className="flex flex-wrap gap-3">
					<Link
						href={backToLessonHref}
						className="text-lg text-blue-600 hover:opacity-80"
					>
						← Quay lại bài học
					</Link>
					<Link
						href="/dashboard/lessons"
						className="text-lg text-gray-500 hover:text-gray-700"
					>
						Danh sách bài học
					</Link>
				</div>
				<div
					className={`${theme.cardRadius} ${theme.cardBg} ${theme.cardPadding} ${theme.cardBorder} shadow-sm`}
				>
					<h1 className={`mb-2 text-2xl text-gray-900 ${theme.fontWeight}`}>
						Không tìm thấy mục bài học
					</h1>
					<p className="text-lg text-gray-600">
						{error ||
							"Mục nội dung này không tồn tại hoặc nằm ngoài số lượng nội dung của bài học."}
					</p>
				</div>
			</div>
		);
	}

	const { lesson: lessonData, resolved, detail } = state;
	return (
		<div className={`max-w-6xl flex flex-col ${theme.sectionGap}`}>
			<div className="grid gap-6 lg:grid-cols-[18rem_minmax(0,1fr)] lg:items-start">
				<LessonTimelineNav
					items={timelineItems}
					className="lg:sticky lg:top-6"
				/>
				<div className={`min-w-0 flex flex-col ${theme.sectionGap}`}>
					<div>
						<div className="mb-3 flex flex-wrap gap-3">
							<Link
								href={backToLessonHref}
								className={`text-lg ${isHigh ? "text-gray-500 hover:text-gray-700" : "text-blue-600 hover:opacity-80"}`}
							>
								{isElementary ? "👈 Quay lại bài học" : "← Quay lại bài học"}
							</Link>
							<Link
								href="/dashboard/lessons"
								className="text-lg text-gray-500 hover:text-gray-700"
							>
								Danh sách bài học
							</Link>
						</div>
						<p className="mb-2 text-sm font-bold uppercase tracking-wide text-blue-600">
							Nội dung {resolved.itemNumber}/{resolved.totalItems}
						</p>
						<h1 className={`text-gray-900 text-2xl ${theme.fontWeight}`}>
							{lessonData.lesson_title} - Mục {resolved.itemNumber}
						</h1>
					</div>

			<article
				className={`shadow-sm ${theme.cardRadius} ${theme.cardBg} ${theme.cardPadding} ${theme.cardBorder} flex flex-col gap-5`}
			>
				{resolved.illustration ? (
					<LessonIllustration
						src={resolved.illustration.src}
						alt={resolved.illustration.alt}
					/>
				) : null}

				<div className="rounded-2xl bg-blue-50 p-5 ring-1 ring-blue-100">
					<p className="mb-2 text-sm font-bold uppercase tracking-wide text-blue-700">
						Nội dung chính
					</p>
					<MathMarkdown
						className="text-xl font-semibold text-gray-900"
						content={detail.title}
					/>
				</div>

				<section>
					<h2 className={`mb-2 text-xl text-gray-900 ${theme.fontWeight}`}>
						{isElementary ? "💡 Giải thích dễ hiểu" : "Giải thích chi tiết"}
					</h2>
					<MathMarkdown
						className="text-lg leading-8 text-gray-700"
						content={detail.explanation}
					/>
				</section>

				<section>
					<h2 className={`mb-2 text-xl text-gray-900 ${theme.fontWeight}`}>
						{isElementary ? "🧪 Ví dụ áp dụng" : "Ví dụ / ứng dụng"}
					</h2>
					<MathMarkdown
						className="text-lg leading-8 text-gray-700"
						content={detail.example}
					/>
				</section>

				<section>
					<h2 className={`mb-2 text-xl text-gray-900 ${theme.fontWeight}`}>
						{isElementary ? "✏️ Thử luyện tập" : "Luyện tập nhanh"}
					</h2>
					<MathMarkdown
						className="text-lg leading-8 text-gray-700"
						content={detail.practice}
					/>
				</section>
			</article>

					<nav aria-label="Chuyển mục nội dung" className="grid gap-3 sm:grid-cols-2">
						{resolved.previous ? (
							<Link
								href={getLessonContentItemHref(id, resolved.previous.itemNumber)}
								scroll={false}
								className={`${theme.cardRadius} bg-white p-4 text-gray-700 shadow-sm ring-1 ring-gray-100 transition hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2`}
							>
								<span className="block text-sm font-bold text-gray-400">
									Mục trước
								</span>
								<span className="line-clamp-2">
									← {stripMarkdownForDisplay(resolved.previous.text)}
								</span>
							</Link>
						) : (
							<div
								className={`${theme.cardRadius} bg-gray-50 p-4 text-gray-400 ring-1 ring-gray-100`}
							>
								Đây là mục đầu tiên.
							</div>
						)}

						{resolved.next ? (
							<Link
								href={getLessonContentItemHref(id, resolved.next.itemNumber)}
								scroll={false}
								className={`${theme.cardRadius} bg-white p-4 text-right text-gray-700 shadow-sm ring-1 ring-gray-100 transition hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2`}
							>
								<span className="block text-sm font-bold text-gray-400">
									Mục tiếp theo
								</span>
								<span className="line-clamp-2">
									{stripMarkdownForDisplay(resolved.next.text)} →
								</span>
							</Link>
						) : (
							<Link
								href={getLessonContentCheckHref(id)}
								scroll={false}
								className={`${theme.cardRadius} bg-emerald-50 p-4 text-right text-emerald-800 shadow-sm ring-1 ring-emerald-100 transition hover:bg-emerald-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2`}
							>
								<span className="block text-sm font-bold text-emerald-600">
									Hoàn thành lý thuyết
								</span>
								<span className="line-clamp-2">Bài tập / Kiểm tra cuối bài →</span>
							</Link>
						)}
					</nav>
				</div>
			</div>
		</div>
	);
}
