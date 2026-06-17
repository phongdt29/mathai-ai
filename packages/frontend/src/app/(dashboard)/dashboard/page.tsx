"use client";

import {
	BookOpen,
	Bot,
	Brain,
	Calculator,
	CheckCircle,
	Circle,
	Flame,
	Medal,
	Rocket,
	Ruler,
	Star,
	Target,
	TrendingUp,
	Triangle,
	Trophy,
	Zap,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useAgeTheme } from "@/contexts/AgeThemeContext";
import {
	type AdaptiveRecommendation,
	type DashboardStats,
	getDashboardStats,
	getTodayRecommendation,
	getTopicMastery,
	type LessonSummary,
	listLessons,
	type TopicMastery,
} from "@/lib/api";
import { getRecommendationDisplaySummary } from "@/lib/recommendation-ui";

const defaultStats: DashboardStats = {
	total_lessons: 0,
	completed_lessons: 0,
	completion_percentage: 0,
	average_quiz_score: null,
	total_study_time_minutes: 0,
	current_streak_days: 0,
	longest_streak_days: 0,
};

const lessonIcons = [Triangle, Ruler, TrendingUp, Circle];
const lessonColors = [
	"bg-blue-500",
	"bg-emerald-500",
	"bg-purple-500",
	"bg-red-500",
];

function lessonProgress(status?: string): number {
	if (status === "completed") return 100;
	if (status === "in_progress") return 50;
	return 0;
}

function lessonSubject(lesson: LessonSummary): string {
	return lesson.lesson_objective || "Bài học cá nhân";
}

const quickActions = [
	{
		href: "/dashboard/solver",
		icon: Calculator,
		label: "Giải toán AI",
		desc: "Nhập bài toán, nhận lời giải",
		solid: "bg-gradient-to-br from-blue-500 to-indigo-500 border-blue-400",
	},
	{
		href: "/dashboard/chat",
		icon: Bot,
		label: "Trợ lý AI",
		desc: "Hỏi đáp 24/7",
		solid: "bg-gradient-to-br from-emerald-400 to-cyan-500 border-emerald-400",
	},
	{
		href: "/dashboard/assessment",
		icon: Target,
		label: "Đánh giá",
		desc: "Kiểm tra trình độ",
		solid: "bg-gradient-to-br from-amber-300 to-orange-500 border-amber-400",
	},
];

export default function DashboardPage() {
	const { theme, ageGroup } = useAgeTheme();
	const [mounted, setMounted] = useState(false);
	const [dashboardData, setDashboardData] =
		useState<DashboardStats>(defaultStats);
	const [mastery, setMastery] = useState<TopicMastery[]>([]);
	const [recommendation, setRecommendation] =
		useState<AdaptiveRecommendation | null>(null);
	const [recentLessons, setRecentLessons] = useState<LessonSummary[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		queueMicrotask(() => setMounted(true));
	}, []);

	useEffect(() => {
		let cancelled = false;
		async function fetchStats() {
			try {
				setError(null);
				const [statsData, masteryData, recommendationData, lessonsData] =
					await Promise.all([
						getDashboardStats(),
						getTopicMastery(),
						getTodayRecommendation(),
						listLessons(),
					]);
				if (!cancelled) {
					setDashboardData(statsData);
					setMastery(masteryData);
					setRecommendation(recommendationData);
					setRecentLessons(lessonsData.slice(0, 4));
				}
			} catch (err) {
				if (!cancelled)
					setError(
						err instanceof Error
							? err.message
							: "Không tải được dữ liệu dashboard",
					);
			} finally {
				if (!cancelled) setLoading(false);
			}
		}
		fetchStats();
		return () => {
			cancelled = true;
		};
	}, []);

	const averageMastery =
		mastery.length > 0
			? Math.round(
					mastery.reduce(
						(sum, item) => sum + Number(item.mastery_level || 0),
						0,
					) / mastery.length,
				)
			: null;
	// Module 8 — top 3 nhóm kiến thức yếu (trực quan hóa cho học sinh).
	const weakTopics = [...mastery]
		.filter((m) => (m.topic ?? "").trim().length > 0)
		.sort((a, b) => Number(a.mastery_level || 0) - Number(b.mastery_level || 0))
		.slice(0, 3);
	const nextLessonTitle = recommendation?.new_lesson?.title || null;
	const recommendationSummary = getRecommendationDisplaySummary(recommendation);
	const recommendationReason =
		recommendationSummary.focusText ||
		recommendation?.fallback_reason ||
		null;
	const achievements = [
		{
			icon: Trophy,
			label: "Điểm thưởng",
			value: dashboardData.points?.reward_points ?? 0,
			unlocked: Boolean(dashboardData.points?.reward_points),
		},
		{
			icon: Target,
			label: "Độ thành thạo TB",
			value: averageMastery === null ? "—" : `${averageMastery}%`,
			unlocked: averageMastery !== null,
		},
		{
			icon: Zap,
			label: "Hoàn thành",
			value: `${dashboardData.completed_lessons}/${dashboardData.total_lessons}`,
			unlocked: dashboardData.completed_lessons > 0,
		},
		{
			icon: Brain,
			label: "Chuỗi học tập",
			value: `${dashboardData.current_streak_days} ngày`,
			unlocked: dashboardData.current_streak_days > 0,
		},
	];

	const stats = [
		{
			label: "Tổng bài học",
			value: dashboardData.total_lessons,
			icon: BookOpen,
			change:
				dashboardData.total_lessons > 0
					? `${dashboardData.completion_percentage}%`
					: "Chưa có",
			solid: "bg-blue-500",
			border: "border-blue-500",
			bg: "bg-blue-50",
			color: "text-blue-600",
		},
		{
			label: "Bài hoàn thành",
			value: dashboardData.completed_lessons,
			icon: CheckCircle,
			change: `${dashboardData.completion_percentage}%`,
			solid: "bg-emerald-500",
			border: "border-emerald-500",
			bg: "bg-emerald-50",
			color: "text-emerald-600",
		},
		{
			label: "Điểm TB",
			value:
				dashboardData.average_quiz_score === null
					? "—"
					: Math.round(dashboardData.average_quiz_score),
			icon: Star,
			change: dashboardData.points
				? `${dashboardData.points.academic_percentage}%`
				: "Chưa chấm",
			solid: "bg-amber-500",
			border: "border-amber-500",
			bg: "bg-amber-50",
			color: "text-amber-600",
		},
		{
			label: "Chuỗi học tập",
			value: `${dashboardData.current_streak_days} ngày`,
			icon: Flame,
			change: dashboardData.current_streak_days > 0 ? "Tiếp tục!" : "Bắt đầu",
			solid: "bg-rose-500",
			border: "border-rose-500",
			bg: "bg-rose-50",
			color: "text-rose-600",
		},
	];

	const isElementary = ageGroup === "elementary";

	return (
		<div className="min-w-0 space-y-6">
			{/* Hero Banner */}
			<div
				className={`relative overflow-hidden rounded-[2rem] border-2 border-violet-400 bg-gradient-to-r from-violet-500 via-blue-500 to-sky-500 ${isElementary ? "p-8" : "p-6"} text-white shadow-xl transition-all duration-700 ${mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}
			>
				{theme.showAnimations && (
					<>
						<div className="absolute -top-16 -right-10 h-48 w-48 rounded-full bg-white/15" />
						<div className="absolute -bottom-16 -left-10 h-40 w-40 rounded-full bg-yellow-300/20" />
						<div className="absolute bottom-5 right-10 hidden text-7xl opacity-30 md:block">
							🧮
						</div>
					</>
				)}
				{isElementary && (
					<div
						className="absolute top-2 right-4 opacity-20 animate-bounce"
						style={{ animationDuration: "3s" }}
					>
						<Rocket className="w-16 h-16" />
					</div>
				)}
				<div className="relative">
					<h1 className="text-3xl font-black tracking-tight md:text-4xl">
						Chinh phục mục tiêu toán học! ✨
					</h1>
					<p
						className={`${isElementary ? "text-lg text-white/90" : "text-base text-white/80"} mt-1`}
					>
						{dashboardData.current_streak_days > 0
							? isElementary
								? `Hôm nay là ngày thứ ${dashboardData.current_streak_days} trong chuỗi streak! Giỏi lắm!`
								: `Hôm nay là ngày thứ ${dashboardData.current_streak_days} trong chuỗi streak. Tiếp tục nào!`
							: isElementary
								? "Hãy bắt đầu học để tạo chuỗi streak nhé!"
								: "Bắt đầu học hôm nay để tạo chuỗi streak."}
					</p>
					<div
						className={`flex flex-wrap gap-3 ${isElementary ? "mt-5" : "mt-4"}`}
					>
						<Link
							href="/dashboard/lessons"
							className="rounded-full bg-white/20 px-5 py-3 font-extrabold text-white shadow-inner backdrop-blur hover:bg-white/30"
						>
							{"Tiếp tục học →"}
						</Link>
						<Link
							href="/dashboard/solver"
							className="rounded-full bg-yellow-300 px-5 py-3 font-extrabold text-slate-900 shadow-lg hover:bg-yellow-200"
						>
							{"Giải toán AI"}
						</Link>
					</div>
				</div>
			</div>

			{error && (
				<div
					className={`${theme.cardRadius} border border-red-200 bg-red-50 p-4 text-red-700`}
				>
					{error}
				</div>
			)}

			{/* Stats Grid */}
			<div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
				{stats.map((stat, i) => (
					<div
						key={stat.label}
						className={`rounded-[1.75rem] border-2 ${stat.border} ${stat.bg} p-5 shadow-sm transition-all duration-500 hover:-translate-y-1 hover:shadow-xl ${mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}
						style={{ transitionDelay: `${i * 100}ms` }}
					>
						<div className="flex items-center justify-between mb-2">
							<stat.icon
								className={`${isElementary ? "w-7 h-7" : "w-5 h-5"} ${stat.color}`}
							/>
							<span
								className={`text-xs font-bold px-2 py-0.5 rounded-full ${stat.solid} text-white`}
							>
								{stat.change}
							</span>
						</div>
						<div
							className={`${isElementary ? "text-4xl" : "text-3xl"} font-extrabold text-gray-900`}
						>
							{loading ? (
								<span className="inline-block w-12 h-8 bg-gray-200 rounded animate-pulse" />
							) : (
								stat.value
							)}
						</div>
						<div
							className={`${isElementary ? "text-base" : "text-sm"} text-gray-500 mt-0.5`}
						>
							{stat.label}
						</div>
					</div>
				))}
			</div>

			{/* Recent Lessons + Achievements */}
			<div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(260px,1fr)]">
				<div
					className="min-w-0 overflow-hidden rounded-[2rem] border-2 border-pink-400 bg-gradient-to-br from-pink-50 via-white to-sky-50 shadow-sm"
				>
					<div className="flex items-center justify-between border-b border-pink-100/80 p-5">
						<h2
							className={`${isElementary ? "text-xl" : "text-lg"} ${theme.fontWeight} text-slate-950`}
						>
							<span className="flex items-center gap-1">
								{theme.showEmojis && <BookOpen className="w-5 h-5 inline" />}{" "}
								Bài học gần đây
							</span>
						</h2>
						<Link
							href="/dashboard/lessons"
							className="text-base font-semibold text-blue-600 hover:opacity-80"
						>
							{"Xem tất cả →"}
						</Link>
					</div>
					<div className="grid grid-cols-1 gap-4 p-5 xl:grid-cols-2">
						{loading &&
							[0, 1, 2].map((item) => (
								<div
									key={item}
									className={`${isElementary ? "p-5" : "p-4"} animate-pulse`}
								>
									<div className="h-12 bg-gray-100 rounded" />
								</div>
							))}
						{!loading && recentLessons.length === 0 && (
							<div className={`${isElementary ? "p-5" : "p-4"} text-gray-500`}>
								Chưa có bài học thật. Hãy hoàn thành đánh giá đầu vào và tạo
								giáo trình để bắt đầu.
							</div>
						)}
						{!loading &&
							recentLessons.map((lesson, i) => {
								const progress = lessonProgress(lesson.status);
								const Icon = lessonIcons[i % lessonIcons.length];
								const solid = lessonColors[i % lessonColors.length];
								return (
									<div
										key={lesson._id || lesson.id || lesson.lesson_title}
										className="group flex min-w-0 cursor-pointer flex-col gap-3 rounded-3xl border-2 border-blue-300 bg-white/90 p-4 shadow-sm transition hover:-translate-y-1 hover:shadow-lg sm:flex-row sm:items-center"
									>
										<div className="flex min-w-0 flex-1 items-center gap-3">
											<div
												className={`${isElementary ? "h-14 w-14 text-2xl" : "h-10 w-10 text-lg"} flex shrink-0 items-center justify-center rounded-2xl bg-blue-100 text-blue-600`}
											>
												<Icon
													className={`${isElementary ? "w-7 h-7" : "w-5 h-5"}`}
												/>
											</div>
											<div className="min-w-0 flex-1">
												<div
													className={`truncate font-semibold ${isElementary ? "text-lg" : "text-base"} text-gray-900 transition group-hover:text-blue-700`}
												>
													{lesson.lesson_title}
												</div>
												<div
													className={`truncate ${isElementary ? "text-base" : "text-sm"} text-gray-400`}
												>
													{lessonSubject(lesson)}
												</div>
											</div>
										</div>
										<div className="flex shrink-0 items-center gap-2 sm:ml-auto">
											<div
												className={`${isElementary ? "w-24" : "w-20"} ${theme.progressHeight} rounded-full bg-gray-100 overflow-hidden`}
											>
												<div
													className={`h-full rounded-full transition-all duration-1000 ${progress === 100 ? "bg-emerald-500" : solid}`}
													style={{ width: mounted ? `${progress}%` : "0%" }}
												/>
											</div>
											<span
												className={`text-base font-bold ${progress === 100 ? "text-emerald-600" : "text-gray-500"}`}
											>
												{progress === 100 ? "✓" : `${progress}%`}
											</span>
										</div>
									</div>
								);
							})}
					</div>
				</div>

				<div
					className="min-w-0 rounded-[2rem] border-2 border-amber-400 bg-amber-50/80 p-5 shadow-sm"
				>
					<h2
						className={`${isElementary ? "text-xl" : "text-lg"} ${theme.fontWeight} mb-4 text-slate-950`}
					>
						<span className="flex items-center gap-1">
							{theme.showEmojis && <Medal className="w-5 h-5 inline" />} Thành
							tích
						</span>
					</h2>
					<div className="grid grid-cols-2 gap-3">
						{achievements.map((a) => (
							<div
								key={a.label}
								className={`flex flex-col items-center justify-center rounded-3xl border-2 ${isElementary ? "p-4" : "p-3"} transition-all ${
									a.unlocked
										? "border-violet-300 bg-white hover:-translate-y-1 hover:shadow-md"
										: "bg-gray-50 border-gray-100 opacity-40 grayscale"
								}`}
							>
								<a.icon
									className={`${isElementary ? "w-10 h-10" : "w-8 h-8"} mb-1 ${a.unlocked ? "text-blue-700" : "text-gray-600"}`}
								/>
								<span
									className={`${isElementary ? "text-base" : "text-xs"} font-semibold text-center ${a.unlocked ? "text-blue-700" : "text-gray-600"}`}
								>
									{a.label}
								</span>
								<span
									className={`text-xs font-bold ${a.unlocked ? "text-blue-800" : "text-gray-500"}`}
								>
									{a.value}
								</span>
							</div>
						))}
					</div>
					<Link
						href="/dashboard/progress"
						className={`block mt-3 text-center text-base font-semibold text-blue-600 hover:opacity-80`}
					>
						{"Xem tất cả thành tích →"}
					</Link>
				</div>
			</div>

			{/* Quick Actions */}
			<div className="grid gap-4 sm:grid-cols-3">
				{quickActions.map((action, i) => (
					<Link
						key={action.href}
						href={action.href}
					className={`group rounded-[1.75rem] border-2 ${action.solid} ${isElementary ? "p-7" : "p-5"} text-white shadow-lg transition-all duration-500 hover:-translate-y-1 hover:shadow-xl ${mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}
						style={{ transitionDelay: `${i * 100 + 400}ms` }}
					>
						<action.icon
							className={`${isElementary ? "w-12 h-12" : "w-8 h-8"} mb-2`}
						/>
						<div
							className={`${theme.fontWeight} ${isElementary ? "text-2xl" : "text-lg"}`}
						>
							{action.label}
						</div>
						<div
							className={`text-white/80 ${isElementary ? "text-base" : "text-sm"} mt-0.5`}
						>
							{action.desc}
						</div>
					</Link>
				))}
			</div>

			{nextLessonTitle && (
				<div
					className="rounded-[1.75rem] border-2 border-blue-300 bg-blue-50 p-5 text-blue-800 shadow-sm"
				>
					<div>
						Gợi ý hôm nay: <span className="font-bold">{nextLessonTitle}</span>
					</div>
					{recommendationSummary.focusText && (
						<div className="mt-1 text-sm text-blue-700">
							{recommendationSummary.focusText}
						</div>
					)}
				</div>
			)}

			{weakTopics.length > 0 && (
				<div className="rounded-[1.75rem] border-2 border-amber-200 bg-amber-50 p-5 shadow-sm">
					<p className="font-bold text-amber-800">Nhóm kiến thức cần cải thiện</p>
					<div className="mt-3 space-y-2">
						{weakTopics.map((m) => {
							const level = Math.round(Number(m.mastery_level || 0));
							return (
								<div key={m.topic} className="text-sm">
									<div className="flex items-center justify-between text-amber-900">
										<span>{m.topic}</span>
										<span className="font-bold">{level}%</span>
									</div>
									<div className="mt-1 h-2 w-full rounded-full bg-amber-100">
										<div
											className="h-2 rounded-full bg-amber-500"
											style={{ width: `${Math.min(100, Math.max(0, level))}%` }}
										/>
									</div>
								</div>
							);
						})}
					</div>
				</div>
			)}

			{/* Mascot section for elementary */}
			{isElementary && (
				<div
					className="flex items-center gap-4 rounded-[2rem] border-2 border-cyan-300 bg-cyan-50 p-6 shadow-sm"
				>
					<Rocket
						className="w-12 h-12 text-cyan-600 animate-bounce"
						style={{ animationDuration: "2s" }}
					/>
					<div>
						<p className="text-xl font-bold text-cyan-800">
							{"Bạn đang làm rất tốt!"}
						</p>
						<p className="text-base text-cyan-600 mt-1">
							{recommendationReason ||
								(nextLessonTitle
									? `Bài gợi ý hôm nay: ${nextLessonTitle}`
									: "Tạo giáo trình để nhận gợi ý học cá nhân hóa nhé!")}
						</p>
					</div>
				</div>
			)}
		</div>
	);
}
