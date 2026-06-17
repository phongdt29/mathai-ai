"use client";

import {
	Award,
	BookOpen,
	Coins,
	type LucideIcon,
	Target,
	Trophy,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
	getDashboardPoints,
	type PointLedgerEntry,
	type StudentPointHistoryResult,
} from "@/lib/api";

function formatNumber(value: number | null | undefined): string {
	if (typeof value !== "number" || !Number.isFinite(value)) return "—";
	return new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 1 }).format(
		value,
	);
}

function formatDate(value: string | undefined): string {
	if (!value) return "—";
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return "—";
	return new Intl.DateTimeFormat("vi-VN", {
		dateStyle: "short",
		timeStyle: "short",
	}).format(date);
}

function sourceLabel(sourceType: string): string {
	const labels: Record<string, string> = {
		assessment: "Đánh giá",
		lesson: "Bài học",
		teacher_assignment: "Bài tập GV",
		manual_adjustment: "Điều chỉnh",
	};
	return labels[sourceType] ?? sourceType;
}

function metadataText(entry: PointLedgerEntry): string {
	const metadata = entry.metadata;
	if (!metadata) return "—";
	const topic = Array.isArray(metadata.topics)
		? metadata.topics.join(", ")
		: typeof metadata.topic === "string"
			? metadata.topic
			: undefined;
	const parts = [
		topic,
		typeof metadata.difficulty === "string" ? metadata.difficulty : undefined,
		typeof metadata.lesson_title === "string"
			? metadata.lesson_title
			: undefined,
		typeof metadata.assignment_title === "string"
			? metadata.assignment_title
			: undefined,
		typeof metadata.assessment_type === "string"
			? metadata.assessment_type
			: undefined,
	].filter(Boolean);
	return parts.length > 0 ? parts.join(" · ") : "—";
}

interface DerivedBreakdownItem {
	key: string;
	label: string;
	earned: number;
	max: number;
	reward: number;
	competencyTotal: number;
	entries: number;
}

function addBreakdownEntry(
	map: Map<string, DerivedBreakdownItem>,
	key: string,
	label: string,
	entry: PointLedgerEntry,
) {
	const existing = map.get(key) ?? {
		key,
		label,
		earned: 0,
		max: 0,
		reward: 0,
		competencyTotal: 0,
		entries: 0,
	};
	existing.earned += entry.earned_points || 0;
	existing.max += entry.max_points || 0;
	existing.reward += entry.reward_points || 0;
	existing.competencyTotal += entry.competency_score || 0;
	existing.entries += 1;
	map.set(key, existing);
}

function deriveRichBreakdown(
	history: PointLedgerEntry[],
): DerivedBreakdownItem[] {
	const map = new Map<string, DerivedBreakdownItem>();
	for (const entry of history) {
		const metadata = entry.metadata;
		addBreakdownEntry(
			map,
			`source:${entry.source_type}`,
			`Nguồn: ${sourceLabel(entry.source_type)}`,
			entry,
		);

		if (metadata) {
			const topics = Array.isArray(metadata.topics)
				? metadata.topics.filter(
						(topic): topic is string => typeof topic === "string",
					)
				: typeof metadata.topic === "string"
					? [metadata.topic]
					: [];
			for (const topic of topics) {
				addBreakdownEntry(map, `topic:${topic}`, `Chủ đề: ${topic}`, entry);
			}
			if (typeof metadata.difficulty === "string") {
				addBreakdownEntry(
					map,
					`difficulty:${metadata.difficulty}`,
					`Độ khó: ${metadata.difficulty}`,
					entry,
				);
			}
		}
	}
	return Array.from(map.values()).sort((a, b) => b.reward - a.reward);
}

export default function StudentPointsPage() {
	const [data, setData] = useState<StudentPointHistoryResult | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		let isActive = true;

		queueMicrotask(() => {
			if (!isActive) return;

			setLoading(true);
			getDashboardPoints()
				.then((result) => {
					if (!isActive) return;
					setData(result);
					setError(null);
				})
				.catch((err) => {
					if (!isActive) return;

					setError(
						err instanceof Error ? err.message : "Không thể tải điểm thưởng",
					);
				})
				.finally(() => {
					if (isActive) setLoading(false);
				});
		});

		return () => {
			isActive = false;
		};
	}, []);

	const richBreakdown = useMemo(
		() => deriveRichBreakdown(data?.history ?? []),
		[data?.history],
	);

	if (loading) {
		return (
			<section aria-label="Đang tải điểm thưởng" className="space-y-4">
				<div className="h-8 w-56 animate-pulse rounded bg-gray-200" />
				<div className="grid gap-4 md:grid-cols-4">
					{[0, 1, 2, 3].map((item) => (
						<div
							key={item}
							className="h-28 animate-pulse rounded-2xl bg-gray-100"
						/>
					))}
				</div>
			</section>
		);
	}

	if (error) {
		return (
			<section
				className="rounded-2xl border border-red-200 bg-red-50 p-6"
				aria-live="polite"
			>
				<h1 className="text-2xl font-bold text-red-700">
					Không thể tải điểm thưởng
				</h1>
				<p className="mt-2 text-sm text-red-600">{error}</p>
			</section>
		);
	}

	const summary = data?.summary;
	const history = data?.history ?? [];
	const sourceSummary = Object.entries(summary?.by_source_type ?? {});
	const gamification = summary?.gamification;
	const unlockedBadges =
		gamification?.badges.filter((badge) => badge.unlocked) ?? [];

	return (
		<div className="space-y-6">
			<header className="rounded-3xl border border-blue-100 bg-gradient-to-br from-blue-50 to-white p-6 shadow-sm">
				<div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
					<div>
						<p className="text-sm font-semibold uppercase tracking-wide text-blue-600">
							Điểm thưởng
						</p>
						<h1 className="mt-1 text-3xl font-extrabold text-gray-900">
							Lịch sử điểm và năng lực
						</h1>
						<p className="mt-2 max-w-2xl text-sm text-gray-600">
							Theo dõi điểm thưởng, điểm học thuật và năng lực từ bài đánh giá,
							bài học và bài tập đã chấm.
						</p>
					</div>
					<div className="flex items-center gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-700">
						<Coins className="h-6 w-6" aria-hidden="true" />
						<span className="text-2xl font-extrabold">
							{formatNumber(summary?.reward_points)}
						</span>
						<span className="text-sm font-medium">điểm thưởng</span>
					</div>
				</div>
			</header>

			{gamification && (
				<section
					className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]"
					aria-label="Gamification điểm thưởng"
				>
					<div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 shadow-sm">
						<p className="text-sm font-semibold uppercase tracking-wide text-amber-700">
							Cấp độ học tập
						</p>
						<div className="mt-3 flex items-end justify-between gap-4">
							<div>
								<h2 className="text-3xl font-extrabold text-gray-900">
									Cấp {gamification.level}: {gamification.level_title}
								</h2>
								<p className="mt-2 text-sm text-amber-800">
									{gamification.next_level_reward_points === null
										? "Bạn đã đạt cấp cao nhất hiện tại."
										: `Còn ${formatNumber(gamification.points_to_next_level)} điểm thưởng để lên cấp tiếp theo.`}
								</p>
							</div>
							<span className="rounded-full bg-white px-3 py-1 text-sm font-bold text-amber-700 shadow-sm">
								{formatNumber(gamification.reward_points)} điểm
							</span>
						</div>
						<div className="mt-5 h-3 overflow-hidden rounded-full bg-white">
							<div
								className="h-full rounded-full bg-amber-500 transition-all"
								style={{
									width: `${Math.min(gamification.progress_percentage, 100)}%`,
								}}
							/>
						</div>
						<p className="mt-2 text-xs font-medium text-amber-700">
							{formatNumber(gamification.progress_percentage)}% tiến độ cấp hiện
							tại
						</p>
					</div>

					<div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
						<div className="flex items-center justify-between gap-3">
							<h2 className="text-lg font-bold text-gray-900">
								Huy hiệu nền tảng
							</h2>
							<span className="rounded-full bg-emerald-50 px-3 py-1 text-sm font-semibold text-emerald-700">
								{unlockedBadges.length}/{gamification.badges.length} đã mở
							</span>
						</div>
						<div className="mt-4 grid gap-3 sm:grid-cols-2">
							{gamification.badges.map((badge) => (
								<div
									key={badge.key}
									className={`rounded-xl border p-4 ${badge.unlocked ? "border-emerald-200 bg-emerald-50" : "border-gray-100 bg-gray-50"}`}
								>
									<div className="flex items-center justify-between gap-3">
										<p className="font-semibold text-gray-900">{badge.title}</p>
										<span
											className={`rounded-full px-2 py-0.5 text-xs font-bold ${badge.unlocked ? "bg-emerald-100 text-emerald-700" : "bg-gray-200 text-gray-600"}`}
										>
											{badge.unlocked
												? "Đã mở"
												: `${formatNumber(badge.progress.percentage)}%`}
										</span>
									</div>
									<p className="mt-1 text-xs text-gray-500">
										{badge.description}
									</p>
									<div className="mt-3 h-2 overflow-hidden rounded-full bg-white">
										<div
											className={`h-full rounded-full ${badge.unlocked ? "bg-emerald-500" : "bg-blue-400"}`}
											style={{
												width: `${Math.min(badge.progress.percentage, 100)}%`,
											}}
										/>
									</div>
									<p className="mt-1 text-xs text-gray-500">
										{formatNumber(badge.progress.current)}/
										{formatNumber(badge.progress.target)}
									</p>
								</div>
							))}
						</div>
					</div>
				</section>
			)}

			<section
				aria-label="Tổng quan điểm"
				className="grid gap-4 md:grid-cols-4"
			>
				<SummaryCard
					icon={Coins}
					label="Điểm thưởng"
					value={formatNumber(summary?.reward_points)}
					tone="amber"
				/>
				<SummaryCard
					icon={BookOpen}
					label="Điểm học tập"
					value={`${formatNumber(summary?.total_earned_points)}/${formatNumber(summary?.total_available_points)}`}
					tone="blue"
				/>
				<SummaryCard
					icon={Target}
					label="Trung bình"
					value={`${formatNumber(summary?.academic_percentage)}%`}
					tone="emerald"
				/>
				<SummaryCard
					icon={Trophy}
					label="Năng lực"
					value={`${formatNumber(summary?.competency_score)}%`}
					tone="purple"
				/>
			</section>

			<section className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
				<div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
					<h2 className="flex items-center gap-2 text-lg font-bold text-gray-900">
						<Award className="h-5 w-5 text-blue-600" aria-hidden="true" />
						Tổng hợp theo nguồn
					</h2>
					{sourceSummary.length === 0 ? (
						<p className="mt-4 rounded-xl bg-gray-50 p-4 text-sm text-gray-500">
							Chưa có dữ liệu điểm theo nguồn.
						</p>
					) : (
						<div className="mt-4 space-y-3">
							{sourceSummary.map(([source, item]) => (
								<div
									key={source}
									className="rounded-xl border border-gray-100 p-4"
								>
									<div className="flex items-center justify-between gap-3">
										<p className="font-semibold text-gray-900">
											{sourceLabel(source)}
										</p>
										<span className="rounded-full bg-amber-50 px-2.5 py-1 text-sm font-semibold text-amber-700">
											{formatNumber(item.reward_points)} thưởng
										</span>
									</div>
									<p className="mt-2 text-sm text-gray-500">
										{formatNumber(item.earned_points)}/
										{formatNumber(item.available_points)} điểm ·{" "}
										{formatNumber(item.competency_score)}% năng lực ·{" "}
										{item.entries} lượt
									</p>
								</div>
							))}
						</div>
					)}
				</div>

				<div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
					<h2 className="text-lg font-bold text-gray-900">
						Nguồn / chủ đề / độ khó
					</h2>
					{richBreakdown.length === 0 ? (
						<p className="mt-4 rounded-xl bg-gray-50 p-4 text-sm text-gray-500">
							Chưa có lịch sử để tổng hợp chi tiết.
						</p>
					) : (
						<div className="mt-4 grid gap-3 md:grid-cols-2">
							{richBreakdown.slice(0, 8).map((item) => (
								<div
									key={item.key}
									className="rounded-xl border border-gray-100 bg-gray-50 p-4"
								>
									<p className="text-sm font-semibold text-gray-900">
										{item.label}
									</p>
									<p className="mt-1 text-xs text-gray-500">
										{item.entries} lượt · {formatNumber(item.reward)} điểm
										thưởng
									</p>
									<p className="mt-2 text-xs text-gray-600">
										Học tập {formatNumber(item.earned)}/{formatNumber(item.max)}{" "}
										· Năng lực{" "}
										{formatNumber(item.competencyTotal / item.entries)}%
									</p>
								</div>
							))}
						</div>
					)}
				</div>
			</section>

			<section
				className="rounded-2xl border border-gray-200 bg-white shadow-sm"
				aria-label="Lịch sử điểm thưởng"
			>
				<div className="border-b border-gray-100 p-5">
					<h2 className="text-lg font-bold text-gray-900">Lịch sử điểm</h2>
					<p className="mt-1 text-sm text-gray-500">
						Các sự kiện cộng/trừ điểm được ghi nhận bởi hệ thống.
					</p>
				</div>
				{history.length === 0 ? (
					<p className="p-8 text-center text-sm text-gray-500">
						Chưa có điểm thưởng nào. Hoàn thành bài học hoặc bài đánh giá để bắt
						đầu tích điểm.
					</p>
				) : (
					<div className="overflow-x-auto">
						<table className="w-full text-sm">
							<thead>
								<tr className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
									<th className="px-4 py-3">Ngày</th>
									<th className="px-4 py-3">Nguồn</th>
									<th className="px-4 py-3">Lý do</th>
									<th className="px-4 py-3">Chi tiết</th>
									<th className="px-4 py-3 text-right">Học tập</th>
									<th className="px-4 py-3 text-right">Thưởng</th>
									<th className="px-4 py-3 text-right">Năng lực</th>
								</tr>
							</thead>
							<tbody className="divide-y divide-gray-100">
								{history.map((entry, index) => (
									<tr
										key={
											entry._id ??
											`${entry.source_type}-${entry.createdAt}-${index}`
										}
										className="hover:bg-gray-50"
									>
										<td className="px-4 py-3 text-gray-500">
											{formatDate(entry.createdAt)}
										</td>
										<td className="px-4 py-3 font-medium text-gray-900">
											{sourceLabel(entry.source_type)}
										</td>
										<td className="max-w-xs px-4 py-3 text-gray-700">
											{entry.reason || "—"}
										</td>
										<td className="px-4 py-3 text-gray-500">
											{metadataText(entry)}
										</td>
										<td className="px-4 py-3 text-right text-gray-700">
											{formatNumber(entry.earned_points)}/
											{formatNumber(entry.max_points)}
										</td>
										<td
											className={`px-4 py-3 text-right font-semibold ${entry.reward_points < 0 ? "text-red-600" : "text-amber-700"}`}
										>
											{entry.reward_points > 0 ? "+" : ""}
											{formatNumber(entry.reward_points)}
										</td>
										<td className="px-4 py-3 text-right text-gray-700">
											{formatNumber(entry.competency_score)}%
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				)}
			</section>
		</div>
	);
}

function SummaryCard({
	icon: Icon,
	label,
	value,
	tone,
}: {
	icon: LucideIcon;
	label: string;
	value: string;
	tone: "amber" | "blue" | "emerald" | "purple";
}) {
	const tones = {
		amber: "bg-amber-50 text-amber-700 border-amber-100",
		blue: "bg-blue-50 text-blue-700 border-blue-100",
		emerald: "bg-emerald-50 text-emerald-700 border-emerald-100",
		purple: "bg-purple-50 text-purple-700 border-purple-100",
	};
	return (
		<div className={`rounded-2xl border p-5 shadow-sm ${tones[tone]}`}>
			<div className="flex items-center justify-between">
				<span className="text-sm font-semibold">{label}</span>
				<Icon className="h-5 w-5" aria-hidden="true" />
			</div>
			<p className="mt-4 text-2xl font-extrabold">{value}</p>
		</div>
	);
}
