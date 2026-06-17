"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
	getParentChildren,
	getParentChildDashboard,
	type ParentChild,
	type ParentDashboardData,
} from "@/lib/api";

type ChildDashboardState = {
	child: ParentChild;
	dashboard: ParentDashboardData | null;
	error: string | null;
};

function formatPercent(value: number): string {
	return `${Math.round(value * 100)}%`;
}

function riskLabel(level?: string): { text: string; className: string } {
	if (level === "high") return { text: "Cao", className: "bg-red-50 text-red-700" };
	if (level === "medium") return { text: "Cần chú ý", className: "bg-amber-50 text-amber-700" };
	return { text: "Ổn định", className: "bg-emerald-50 text-emerald-700" };
}

export default function ParentDashboardPage() {
	const [items, setItems] = useState<ChildDashboardState[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		let mounted = true;

		async function loadData() {
			try {
				setLoading(true);
				setError(null);
				const children = await getParentChildren();
				const dashboards = await Promise.all(
					children.map(async (child) => {
						try {
							return {
								child,
								dashboard: await getParentChildDashboard(child.student_id),
								error: null,
							};
						} catch (childError) {
							return {
								child,
								dashboard: null,
								error:
									childError instanceof Error
										? childError.message
										: "Không tải được dashboard của học sinh này",
							};
						}
					}),
				);
				if (mounted) setItems(dashboards);
			} catch (loadError) {
				if (mounted) {
					setError(
						loadError instanceof Error
							? loadError.message
							: "Không tải được dữ liệu phụ huynh",
					);
					setItems([]);
				}
			} finally {
				if (mounted) setLoading(false);
			}
		}

		loadData();
		return () => {
			mounted = false;
		};
	}, []);

	const totals = useMemo(() => {
		const dashboards = items.map((item) => item.dashboard).filter(Boolean) as ParentDashboardData[];
		const childrenCount = items.length;
		const sessions = dashboards.reduce((sum, item) => sum + item.study_stats.total_sessions_7d, 0);
		const alerts = dashboards.reduce((sum, item) => sum + item.alerts.length, 0);
		const activeMinutes = dashboards.reduce(
			(sum, item) => sum + item.study_stats.avg_active_minutes_per_session * item.study_stats.total_sessions_7d,
			0,
		);
		const avgFocus = dashboards.length
			? dashboards.reduce((sum, item) => sum + item.study_stats.avg_focus_ratio, 0) / dashboards.length
			: 0;
		return { childrenCount, sessions, alerts, activeMinutes: Math.round(activeMinutes), avgFocus };
	}, [items]);

	if (loading) {
		return (
			<div className="rounded-2xl bg-white p-8 text-center shadow-sm ring-1 ring-gray-100">
				<div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent" />
				<p className="text-sm text-gray-500">Đang tải dữ liệu phụ huynh...</p>
			</div>
		);
	}

	return (
		<div className="space-y-6">
			<div>
				<h1 className="text-2xl font-bold text-gray-900">Tổng quan 📊</h1>
				<p className="text-gray-500">Theo dõi tiến độ học tập của con em bạn.</p>
			</div>

			{error && (
				<div className="rounded-2xl border border-red-100 bg-red-50 p-5 text-sm text-red-700">
					{error}
				</div>
			)}

			{!error && items.length === 0 && (
				<div className="rounded-2xl bg-white p-8 text-center shadow-sm ring-1 ring-gray-100">
					<div className="text-4xl">👨‍👩‍👧‍👦</div>
					<h2 className="mt-3 text-lg font-bold text-gray-900">Chưa liên kết học sinh</h2>
					<p className="mt-2 text-sm text-gray-500">
						Tài khoản phụ huynh hiện chưa có quan hệ parent-child trong hệ thống. Khi backend có dữ liệu liên kết, dashboard sẽ hiển thị tự động.
					</p>
				</div>
			)}

			{/* Summary cards — Requirement 7.9 */}
			{items.length > 0 && (
				<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
					<div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-100">
						<div className="text-sm text-gray-500">Số con liên kết</div>
						<div className="mt-2 text-3xl font-bold text-gray-900">{totals.childrenCount}</div>
					</div>
					<div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-100">
						<div className="text-sm text-gray-500">Cảnh báo chờ xử lý</div>
						<div className={`mt-2 text-3xl font-bold ${totals.alerts > 0 ? "text-red-600" : "text-gray-900"}`}>
							{totals.alerts}
						</div>
						{totals.alerts > 0 && (
							<Link href="/parent/notifications" className="mt-1 inline-block text-xs font-medium text-red-500 hover:text-red-600">
								Xem thông báo →
							</Link>
						)}
					</div>
					<div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-100">
						<div className="text-sm text-gray-500">Phiên học tuần này</div>
						<div className="mt-2 text-3xl font-bold text-indigo-600">{totals.sessions}</div>
					</div>
					<div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-100">
						<div className="text-sm text-gray-500">Phút học tuần này</div>
						<div className="mt-2 text-3xl font-bold text-emerald-600">{totals.activeMinutes}</div>
						<div className="mt-1 text-xs text-gray-400">Tập trung TB: {formatPercent(totals.avgFocus)}</div>
					</div>
				</div>
			)}

			{/* Per-child cards */}
			<div className="grid gap-6 md:grid-cols-2">
				{items.map(({ child, dashboard, error: childError }) => {
					const risk = riskLabel(dashboard?.risk.level);
					const averageQuiz = dashboard?.recent_quiz_results.length
						? dashboard.recent_quiz_results.reduce((sum, quiz) => sum + quiz.score, 0) /
							dashboard.recent_quiz_results.length
						: null;
					return (
						<div key={child.student_id} className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
							<div className="mb-5 flex items-center gap-4">
								<div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 text-lg font-bold text-white">
									{child.full_name.charAt(child.full_name.lastIndexOf(" ") + 1) || child.full_name.charAt(0)}
								</div>
								<div>
									<div className="font-bold text-gray-900">{dashboard?.student.name ?? child.full_name}</div>
									<div className="text-sm text-gray-500">
										{dashboard?.student.grade_level ? `Lớp ${dashboard.student.grade_level}` : "Chưa có khối lớp"}
									</div>
								</div>
							</div>

							{childError && (
								<div className="mb-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-700">{childError}</div>
							)}

							<div className="grid grid-cols-3 gap-3 text-center">
								<div className="rounded-xl bg-blue-50 p-3">
									<div className="text-xl font-bold text-blue-700">{averageQuiz === null ? "—" : averageQuiz.toFixed(1)}</div>
									<div className="text-xs text-blue-600">Điểm quiz</div>
								</div>
								<div className={`rounded-xl p-3 ${risk.className}`}>
									<div className="text-xl font-bold">{risk.text}</div>
									<div className="text-xs">Rủi ro</div>
								</div>
								<div className="rounded-xl bg-green-50 p-3">
									<div className="text-xl font-bold text-green-700">{dashboard?.study_stats.total_sessions_7d ?? 0}</div>
									<div className="text-xs text-green-600">Phiên/7 ngày</div>
								</div>
							</div>

							{/* Alerts for this child */}
							{dashboard && dashboard.alerts.length > 0 && (
								<div className="mt-4 rounded-xl border border-red-100 bg-red-50 p-3">
									<div className="text-xs font-semibold text-red-700 mb-1">
										{dashboard.alerts.length} cảnh báo
									</div>
									<div className="text-xs text-red-600 truncate">
										{dashboard.alerts[0].title}
										{dashboard.alerts.length > 1 && ` (+${dashboard.alerts.length - 1} khác)`}
									</div>
								</div>
							)}

							{dashboard?.today_schedule ? (
								<div className="mt-4 rounded-xl bg-gray-50 p-3 text-sm text-gray-600">
									<span className="font-medium text-gray-900">Hôm nay:</span> {dashboard.today_schedule.lesson_title} · {dashboard.today_schedule.status}
								</div>
							) : (
								<div className="mt-4 rounded-xl bg-gray-50 p-3 text-sm text-gray-500">Chưa có lịch học hôm nay.</div>
							)}

							<Link href={`/parent/children/${child.student_id}`} className="mt-4 block text-center text-sm font-medium text-indigo-600 hover:text-indigo-500">
								Xem chi tiết →
							</Link>
						</div>
					);
				})}
			</div>
		</div>
	);
}
