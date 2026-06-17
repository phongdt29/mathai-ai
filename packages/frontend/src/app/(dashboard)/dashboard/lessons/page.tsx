"use client";

import {
	AlertCircle,
	BarChart3,
	Circle,
	Clock,
	Hash,
	Ruler,
	Sparkles,
	TrendingUp,
	Triangle,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useAgeTheme } from "@/contexts/AgeThemeContext";
import {
	type AdaptiveRecommendation,
	type Curriculum,
	getActiveCurriculum,
	getTodayRecommendation,
	type LessonSummary,
	listLessons,
} from "@/lib/api";
import {
	getRecommendationDisplaySummary,
	type RecommendationPill,
	type RecommendationTopicGroup,
} from "@/lib/recommendation-ui";

const iconPool = [Triangle, Ruler, TrendingUp, Circle, Hash, BarChart3];
const colorPool = [
	"bg-blue-500",
	"bg-emerald-500",
	"bg-purple-500",
	"bg-rose-500",
	"bg-amber-500",
	"bg-cyan-500",
];

const defaultSubjects = ["Tất cả"];

const difficultyConfig: Record<
	string,
	{ bg: string; text: string; label: string }
> = {
	Dễ: { bg: "bg-emerald-100", text: "text-emerald-700", label: "Cơ bản" },
	"Trung bình": {
		bg: "bg-amber-100",
		text: "text-amber-700",
		label: "Trung bình",
	},
	Khó: { bg: "bg-red-100", text: "text-red-700", label: "Nâng cao" },
};

type LessonCard = {
	id: string;
	title: string;
	topicLabel: string;
	subject: string;
	grade: string;
	duration: string;
	difficulty: string;
	progress: number;
	status: string;
	icon: typeof Triangle;
	color: string;
	recommendationLabel?: string;
};

const pillToneClass: Record<RecommendationPill["tone"], string> = {
	amber: "bg-amber-50 text-amber-700 ring-amber-200",
	blue: "bg-blue-50 text-blue-700 ring-blue-200",
	emerald: "bg-emerald-50 text-emerald-700 ring-emerald-200",
	slate: "bg-slate-50 text-slate-700 ring-slate-200",
};

const topicToneClass: Record<RecommendationTopicGroup["tone"], string> = {
	amber: "bg-amber-50 text-amber-700 ring-amber-200",
	blue: "bg-blue-50 text-blue-700 ring-blue-200",
	emerald: "bg-emerald-50 text-emerald-700 ring-emerald-200",
	slate: "bg-slate-50 text-slate-700 ring-slate-200",
};

function mapDifficulty(lesson: LessonSummary): string {
	const raw = (lesson as unknown as Record<string, unknown>).difficulty_level;
	if (typeof raw === "string" && raw) {
		const level = raw.toLowerCase();
		if (level === "easy" || level === "dễ" || level === "cơ bản") return "Dễ";
		if (level === "hard" || level === "khó" || level === "nâng cao")
			return "Khó";
	}
	return "Trung bình";
}

function progressFromStatus(status?: string): number {
	if (status === "completed") return 100;
	if (status === "in_progress") return 50;
	return 0;
}

function statusLabel(status?: string): string {
	switch (status) {
		case "completed":
			return "Hoàn thành";
		case "available":
			return "Sẵn sàng";
		case "scheduled":
			return "Theo lịch";
		case "skipped":
			return "Đã bỏ qua";
		default:
			return "Chưa bắt đầu";
	}
}

function lessonTopic(lesson: LessonSummary): string {
	return lesson.lesson_objective?.trim() || "Bài học cá nhân";
}

function lessonTopicLabel(lesson: LessonSummary): string {
	const objective = lesson.lesson_objective?.trim();
	if (objective) {
		const masteryMatch = objective.match(
			// Không dùng cờ "u": tsconfig target es5 không hỗ trợ, và khớp chuỗi
			// tiếng Việt literal không cần unicode mode
			/^Học sinh\s+(?:nắm chắc|biết|xác định được|vận dụng được|hiểu được)\s+(.+?)\s+qua\b/i,
		);
		if (masteryMatch?.[1]) {
			const topic = masteryMatch[1].trim();
			return topic.charAt(0).toUpperCase() + topic.slice(1);
		}
	}

	const title = lesson.lesson_title?.trim();
	if (title) {
		const segment = title.split(" - ").pop()?.trim();
		if (segment) return segment;
	}

	if (objective) {
		return objective.length > 36
			? `${objective.slice(0, 33).trimEnd()}…`
			: objective;
	}

	return "Bài học cá nhân";
}

function lessonId(lesson: LessonSummary, index: number): string {
	return String(lesson._id || lesson.id || index + 1);
}

function getRecommendationLabel(
	recommendation: AdaptiveRecommendation | null,
	id: string,
): string | undefined {
	if (!recommendation) return undefined;
	if (recommendation.new_lesson?.lesson_id === id)
		return "Gợi ý bài mới hôm nay";
	if (recommendation.review_items.some((item) => item.lesson_id === id))
		return "Nên ôn tập hôm nay";
	if (recommendation.reinforce_items.some((item) => item.lesson_id === id))
		return "Nên củng cố hôm nay";
	return undefined;
}

function RecommendationInsightPill({ pill }: { pill: RecommendationPill }) {
	return (
		<span
			className={`inline-flex max-w-full items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${pillToneClass[pill.tone]}`}
		>
			<span className="shrink-0 opacity-70">{pill.label}</span>
			<span className="truncate">{pill.value}</span>
		</span>
	);
}

function RecommendationTopicPills({
	group,
}: {
	group: RecommendationTopicGroup;
}) {
	return (
		<div className="space-y-2">
			<div className="text-xs font-bold uppercase tracking-wide text-gray-500">
				{group.label}
			</div>
			<div className="flex flex-wrap gap-2">
				{group.topics.map((topic) => (
					<span
						key={topic}
						title={topic}
						className={`inline-flex max-w-full rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${topicToneClass[group.tone]}`}
					>
						<span className="max-w-[18rem] truncate">{topic}</span>
					</span>
				))}
				{group.hiddenCount > 0 && (
					<span
						className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${topicToneClass[group.tone]}`}
					>
						+{group.hiddenCount} chủ đề
					</span>
				)}
			</div>
		</div>
	);
}

export default function LessonsPage() {
	const [filter, setFilter] = useState("Tất cả");
	const [mounted, setMounted] = useState(false);
	const [lessons, setLessons] = useState<LessonSummary[]>([]);
	const [activeCurriculum, setActiveCurriculum] = useState<Curriculum | null>(
		null,
	);
	const [recommendation, setRecommendation] =
		useState<AdaptiveRecommendation | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const { theme, ageGroup } = useAgeTheme();

	useEffect(() => {
		queueMicrotask(() => setMounted(true));
	}, []);

	useEffect(() => {
		let cancelled = false;

		async function fetchLessons() {
			try {
				setError(null);
				const [curriculumData, recommendationData] = await Promise.all([
					getActiveCurriculum(),
					getTodayRecommendation(),
				]);
				const curriculumId = curriculumData?._id || curriculumData?.id;
				const lessonsData = await listLessons(curriculumId);

				if (!cancelled) {
					setActiveCurriculum(curriculumData);
					setRecommendation(recommendationData);
					setLessons(lessonsData);
				}
			} catch (err) {
				if (!cancelled)
					setError(
						err instanceof Error
							? err.message
							: "Không tải được danh sách bài học",
					);
			} finally {
				if (!cancelled) setLoading(false);
			}
		}

		fetchLessons();
		return () => {
			cancelled = true;
		};
	}, []);

	const cards: LessonCard[] = useMemo(
		() =>
			lessons.map((lesson, index) => {
				const id = lessonId(lesson, index);
				return {
					id,
					title: lesson.lesson_title || `Bài học ${index + 1}`,
					topicLabel: lessonTopicLabel(lesson),
					subject: lessonTopic(lesson),
					grade: statusLabel(lesson.status),
					duration: lesson.estimated_minutes
						? `${lesson.estimated_minutes} phút`
						: "Chưa có thời lượng",
					difficulty: mapDifficulty(lesson),
					progress: progressFromStatus(lesson.status),
					status: lesson.status || "pending",
					icon: iconPool[index % iconPool.length],
					color: colorPool[index % colorPool.length],
					recommendationLabel: getRecommendationLabel(recommendation, id),
				};
			}),
		[lessons, recommendation],
	);

	const subjects = Array.from(
		new Set([
			...defaultSubjects,
			...cards.map((l) => l.topicLabel).filter(Boolean),
		]),
	);
	const subjectTitles = useMemo(() => {
		const map = new Map<string, string>();
		for (const card of cards) {
			if (!map.has(card.topicLabel)) {
				map.set(card.topicLabel, card.subject);
			}
		}
		return map;
	}, [cards]);
	const filtered =
		filter === "Tất cả" ? cards : cards.filter((l) => l.topicLabel === filter);

	const isElementary = ageGroup === "elementary";
	const isHigh = ageGroup === "high";
	const nextLesson = recommendation?.new_lesson;
	const recommendationSummary = useMemo(
		() => getRecommendationDisplaySummary(recommendation),
		[recommendation],
	);

	return (
		<div className={`flex flex-col ${theme.sectionGap}`}>
			<div>
				<h1 className={`${theme.fontWeight} text-2xl text-gray-900`}>
					{isElementary ? "Bài học vui" : isHigh ? "Bài học" : "Bài học"}
				</h1>
				<p className={`text-gray-500 mt-1 text-sm`}>
					{isElementary
						? "Chọn bài học yêu thích và bắt đầu phiêu lưu nào!"
						: isHigh
							? "Chọn bài học để bắt đầu ôn tập và rèn luyện."
							: "Chọn bài học để bắt đầu hành trình chinh phục toán học!"}
				</p>
			</div>

			{error && (
				<div
					className={`${theme.cardRadius} border border-red-200 bg-red-50 p-4 text-red-700`}
				>
					{error}
				</div>
			)}

			{nextLesson && (
				<Link
					href={`/dashboard/lessons/${nextLesson.lesson_id}`}
					className={`${theme.cardRadius} border border-blue-100 bg-white p-4 text-blue-800 shadow-sm transition hover:border-blue-200 hover:bg-blue-50`}
				>
					<div className="flex items-start gap-3">
						<div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm">
							<Sparkles className="h-5 w-5" />
						</div>
						<div className="min-w-0 flex-1 space-y-3">
							<div className="flex flex-wrap items-start justify-between gap-3">
								<div className="min-w-0">
									<div className="text-sm font-bold text-blue-700">
										Gợi ý học hôm nay
									</div>
									<div className="mt-0.5 text-lg font-extrabold text-gray-900">
										{nextLesson.title}
									</div>
								</div>
								<span className="rounded-full bg-blue-600 px-3 py-1 text-xs font-bold text-white">
									Cá nhân hóa
								</span>
							</div>

							{recommendationSummary.focusText && (
								<p className="text-sm leading-6 text-blue-700">
									{recommendationSummary.focusText}
								</p>
							)}

							{recommendationSummary.pills.length > 0 && (
								<div className="flex flex-wrap gap-2">
									{recommendationSummary.pills.map((pill) => (
										<RecommendationInsightPill
											key={`${pill.label}-${pill.value}`}
											pill={pill}
										/>
									))}
								</div>
							)}

							{recommendationSummary.topicGroups.length > 0 && (
								<div className="grid gap-3 md:grid-cols-2">
									{recommendationSummary.topicGroups.map((group) => (
										<RecommendationTopicPills
											key={group.label}
											group={group}
										/>
									))}
								</div>
							)}

							{recommendationSummary.friendlyTip && (
								<div className="rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-700">
									{recommendationSummary.friendlyTip}
								</div>
							)}
						</div>
					</div>
				</Link>
			)}

			{!nextLesson &&
				(recommendation?.fallback_reason || recommendationSummary.friendlyTip) && (
					<div
						className={`${theme.cardRadius} border border-amber-100 bg-amber-50 p-4 text-amber-800 flex items-start gap-3`}
					>
						<AlertCircle className="w-5 h-5 mt-1" />
						<div>
							{recommendation?.fallback_reason || recommendationSummary.friendlyTip}
						</div>
					</div>
				)}

			{activeCurriculum && (
				<div
					className={`${theme.cardRadius} bg-white border border-gray-100 p-4`}
				>
					<div className="text-sm text-gray-500">Giáo trình đang học</div>
					<div className="font-bold text-gray-900">
						{activeCurriculum.title}
					</div>
					{activeCurriculum.ai_summary && (
						<div className="text-gray-600 mt-1 line-clamp-2">
							{activeCurriculum.ai_summary}
						</div>
					)}
				</div>
			)}

			<div className="flex gap-2 overflow-x-auto pb-1">
				{subjects.map((s) => (
					<button
						key={s}
						type="button"
						onClick={() => setFilter(s)}
						title={s === "Tất cả" ? undefined : subjectTitles.get(s)}
						className={`max-w-[12rem] shrink-0 px-4 py-2 ${theme.fontWeight} transition-all ${theme.buttonRadius} text-sm ${
							filter === s
								? "bg-blue-600 text-white shadow-md"
								: "bg-white text-gray-500 hover:bg-gray-100 ring-1 ring-gray-200/80"
						}`}
					>
						<span className="block truncate">{s}</span>
					</button>
				))}
			</div>

			{loading && (
				<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
					{[0, 1, 2, 3, 4, 5].map((item) => (
						<div
							key={item}
							className={`${theme.cardRadius} h-56 bg-gray-100 animate-pulse`}
						/>
					))}
				</div>
			)}

			{!loading && filtered.length === 0 && (
				<div
					className={`${theme.cardRadius} border border-dashed border-gray-200 bg-gray-50 p-8 text-center text-gray-600`}
				>
					<div className="font-bold text-gray-800 mb-1">
						Chưa có bài học thật
					</div>
					<div>
						Hãy hoàn thành đánh giá đầu vào và tạo giáo trình để hệ thống sinh
						danh sách bài học cá nhân hóa.
					</div>
					<div className="mt-4 flex justify-center gap-3">
						<Link
							href="/dashboard/assessment"
							className={`${theme.buttonRadius} bg-blue-600 px-4 py-2 font-semibold text-white`}
						>
							Làm assessment
						</Link>
						<Link
							href="/dashboard/curriculum"
							className={`${theme.buttonRadius} bg-white px-4 py-2 font-semibold text-blue-600 ring-1 ring-blue-200`}
						>
							Xem giáo trình
						</Link>
					</div>
				</div>
			)}

			{!loading && filtered.length > 0 && (
				<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
					{filtered.map((lesson, i) => {
						const diff = difficultyConfig[lesson.difficulty];
						const isComplete = lesson.progress === 100;
						const isNew = lesson.progress === 0;
						return (
							<Link
								key={lesson.id}
								href={`/dashboard/lessons/${lesson.id}`}
								className={`group overflow-hidden shadow-sm transition-all duration-500 ${theme.cardRadius} ${theme.cardBg} ${theme.cardBorder} ${
									isElementary
										? "ring-2 ring-blue-200 hover:shadow-md hover:ring-blue-400"
										: isHigh
											? "ring-1 ring-gray-200 hover:shadow-md hover:ring-gray-300"
											: "ring-1 ring-gray-100/80 hover:shadow-md hover:ring-blue-200"
								} ${mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}
								style={{ transitionDelay: `${i * 80}ms` }}
							>
								<div
									className={lesson.color}
									style={{
										height: isElementary ? "6px" : isHigh ? "3px" : "6px",
									}}
								/>

								<div className={theme.cardPadding}>
									{(lesson.recommendationLabel ||
										isComplete ||
										(isNew && !lesson.recommendationLabel)) && (
										<div className="mb-3 flex flex-wrap items-center gap-2">
											{lesson.recommendationLabel && (
												<span
													className={`rounded-full bg-amber-500 px-2 py-0.5 font-bold text-white ${isElementary ? "text-base" : "text-sm"}`}
												>
													{lesson.recommendationLabel}
												</span>
											)}
											{isComplete && (
												<span
													className={`ml-auto rounded-full bg-emerald-500 px-2 py-0.5 font-bold text-white ${isElementary ? "text-base" : "text-sm"}`}
												>
													{isElementary ? "Hoàn thành" : "✓ Hoàn thành"}
												</span>
											)}
											{isNew && !lesson.recommendationLabel && (
												<span
													className={`ml-auto rounded-full bg-blue-500 px-2 py-0.5 font-bold text-white ${isElementary ? "text-base animate-bounce" : "text-sm animate-pulse"}`}
												>
													{lesson.status === "available"
														? isElementary
															? "Sẵn sàng!"
															: "Sẵn sàng"
														: isElementary
															? "MỚI!"
															: "MỚI"}
												</span>
											)}
										</div>
									)}
									<div className="flex items-start gap-3 mb-3">
										<div
											className={`${lesson.color} text-white flex items-center justify-center shadow-sm transition-all ${
												isElementary
													? "group-hover:opacity-80"
													: isHigh
														? "group-hover:opacity-90"
														: "group-hover:opacity-85"
											}`}
											style={{
												height: isElementary ? "3.5rem" : "3rem",
												width: isElementary ? "3.5rem" : "3rem",
												borderRadius: isElementary ? "1rem" : "0.75rem",
												fontSize: isElementary ? "1.75rem" : "1.5rem",
											}}
										>
											{isHigh ? (
												lesson.title.charAt(0)
											) : (
												<lesson.icon className="w-6 h-6" />
											)}
										</div>
										<div className="min-w-0 flex-1">
											<h3
												className={`line-clamp-2 ${theme.fontWeight} text-base text-gray-900 transition ${isHigh ? "group-hover:text-gray-700" : "group-hover:text-blue-600"}`}
											>
												{lesson.title}
											</h3>
											<p
												className="mt-0.5 line-clamp-2 text-sm text-gray-400"
												title={lesson.subject}
											>
												{lesson.subject} · {lesson.grade}
											</p>
										</div>
									</div>

									<div className="flex items-center gap-2 mb-3">
										<span
											className={`font-semibold px-2 py-0.5 rounded-full text-xs ${diff.bg} ${diff.text}`}
										>
											{isHigh ? diff.label : lesson.difficulty}
										</span>
										<span className="text-gray-400 text-xs">
											{isHigh ? (
												lesson.duration
											) : (
												<>
													<Clock className="w-3 h-3 inline mr-0.5" />{" "}
													{lesson.duration}
												</>
											)}
										</span>
									</div>

									<div>
										<div
											className={`flex items-center justify-between mb-1 text-xs`}
										>
											<span className="text-gray-400">Tiến độ</span>
											<span
												className={`font-bold ${isComplete ? "text-emerald-600" : "text-blue-600"}`}
											>
												{lesson.progress}%
											</span>
										</div>
										<div
											className={`w-full bg-gray-100 overflow-hidden ${theme.progressHeight} ${theme.progressRadius}`}
										>
											<div
												className={`h-full transition-all duration-1000 ease-out ${theme.progressRadius} ${isComplete ? "bg-emerald-500" : lesson.color}`}
												style={{
													width: mounted ? `${lesson.progress}%` : "0%",
												}}
											/>
										</div>
									</div>

									<div className="mt-4 text-center">
										<span
											className={`inline-block font-bold px-4 py-1.5 text-sm transition-all ${theme.buttonRadius} ${
												isComplete
													? "bg-emerald-50 text-emerald-600 group-hover:bg-emerald-100"
													: isNew
														? "bg-blue-500 text-white shadow-md"
														: "bg-blue-50 text-blue-600 group-hover:bg-blue-100"
											}`}
										>
											{isComplete
												? "Ôn tập lại"
												: isNew
													? "Bắt đầu"
													: "Tiếp tục học"}
										</span>
									</div>
								</div>
							</Link>
						);
					})}
				</div>
			)}
		</div>
	);
}
