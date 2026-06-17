"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
	getParentChildDashboard,
	type ParentDashboardData,
} from "@/lib/api";

// ── Severity styling ──

const severityStyles: Record<string, string> = {
	critical: "border-red-200 bg-red-50 text-red-800",
	warning: "border-amber-200 bg-amber-50 text-amber-800",
	info: "border-blue-200 bg-blue-50 text-blue-800",
};

const severityBadge: Record<string, string> = {
	critical: "bg-red-100 text-red-700",
	warning: "bg-amber-100 text-amber-700",
	info: "bg-blue-100 text-blue-700",
};

const riskLevelStyles: Record<string, { bg: string; text: string; label: string }> = {
	low: { bg: "bg-emerald-100", text: "text-emerald-700", label: "Thấp" },
	medium: { bg: "bg-amber-100", text: "text-amber-700", label: "Trung bình" },
	high: { bg: "bg-red-100", text: "text-red-700", label: "Cao" },
};

const attendanceStatusStyles: Record<string, { label: string; color: string }> = {
	present: { label: "Có mặt", color: "bg-emerald-100 text-emerald-700" },
	partial: { label: "Muộn", color: "bg-amber-100 text-amber-700" },
	absent: { label: "Vắng", color: "bg-red-100 text-red-700" },
	scheduled: { label: "Đã lên lịch", color: "bg-blue-100 text-blue-700" },
};

export default function ParentChildDashboardPage() {
	const params = useParams();
	const studentId = params.id as string;

	const [dashboard, setDashboard] = useState<ParentDashboardData | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		let mounted = true;

		async function loadDashboard() {
			try {
				setLoading(true);
				setError(null);
				const data = await getParentChildDashboard(studentId);
				if (mounted) setDashboard(data);
			} catch (err) {
				if (mounted) {
					setError(
						err instanceof Error
							? err.message
							: "Không thể tải dashboard học sinh",
					);
				}
			} finally {
				if (mounted) setLoading(false);
			}
		}

		loadDashboard();
		return () => {
			mounted = false;
		};
	}, [studentId]);

	if (loading) {
		return (
			<div className="rounded-2xl bg-white p-8 text-center shadow-sm ring-1 ring-gray-100">
				<div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent" />
				<p className="text-sm text-gray-500">Đang tải dashboard...</p>
			</div>
		);
	}

	if (error) {
		return (
			<div className="space-y-4">
				<Link
					href="/parent/children"
					className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700"
				>
					← Quay lại danh sách con
				</Link>
				<div className="rounded-2xl border border-red-100 bg-red-50 p-5 text-sm text-red-700">
					{error}
				</div>
			</div>
		);
	}

	if (!dashboard) return null;

	const riskStyle = riskLevelStyles[dashboard.risk.level] ?? riskLevelStyles.low;

	return (
		<div className="space-y-6">
			{/* Header */}
			<div>
				<Link
					href="/parent/children"
					className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-2"
				>
					← Quay lại danh sách con
				</Link>
				<div className="flex items-center gap-3">
					<h1 className="text-2xl font-bold text-gray-900">
						{dashboard.student.name}
					</h1>
					{dashboard.student.grade_level && (
						<span className="rounded-full bg-indigo-100 px-3 py-0.5 text-sm font-medium text-indigo-700">
							Lớp {dashboard.student.grade_level}
						</span>
					)}
					<span className={`rounded-full px-3 py-0.5 text-sm font-medium ${riskStyle.bg} ${riskStyle.text}`}>
						Nguy cơ: {riskStyle.label} ({dashboard.risk.score}/100)
					</span>
				</div>
			</div>

			{/* Section 1: Today Schedule */}
			<TodayScheduleSection schedule={dashboard.today_schedule} />

			{/* Section 2: Attendance Summary */}
			<AttendanceSummarySection summary={dashboard.attendance_summary} />

			{/* Section 3: Study Stats */}
			<StudyStatsSection stats={dashboard.study_stats} />

			{/* Section 4: Recent Quiz Results */}
			<RecentQuizResultsSection results={dashboard.recent_quiz_results} />

			{/* Section 5: Alerts */}
			<AlertsSection alerts={dashboard.alerts} />

			{/* Section 6: Intervention Suggestions */}
			<InterventionSuggestionsSection suggestions={dashboard.intervention_suggestions} />
		</div>
	);
}


// ── Section Components ──

function TodayScheduleSection({
	schedule,
}: {
	schedule: ParentDashboardData["today_schedule"];
}) {
	return (
		<section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
			<h2 className="mb-4 text-lg font-bold text-gray-900">📅 Lịch học hôm nay</h2>
			{schedule ? (
				<div className="flex items-center gap-4">
					<div className="flex-1">
						<p className="text-base font-semibold text-gray-900">
							{schedule.lesson_title}
						</p>
						<div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-gray-500">
							{schedule.scheduled_time && (
								<span>🕐 {schedule.scheduled_time}</span>
							)}
							<span>⏱️ {schedule.expected_duration_minutes} phút</span>
						</div>
					</div>
					<div>
						{attendanceStatusStyles[schedule.status] ? (
							<span
								className={`rounded-full px-3 py-1 text-xs font-medium ${attendanceStatusStyles[schedule.status].color}`}
							>
								{attendanceStatusStyles[schedule.status].label}
							</span>
						) : (
							<span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600">
								{schedule.status}
							</span>
						)}
					</div>
				</div>
			) : (
				<p className="text-sm text-gray-500">
					Không có buổi học nào được lên lịch hôm nay.
				</p>
			)}
		</section>
	);
}

function AttendanceSummarySection({
	summary,
}: {
	summary: ParentDashboardData["attendance_summary"];
}) {
	const attendanceRate =
		summary.total > 0
			? Math.round(((summary.present + summary.partial) / summary.total) * 100)
			: 0;

	return (
		<section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
			<h2 className="mb-4 text-lg font-bold text-gray-900">📊 Tổng hợp điểm danh</h2>
			<div className="grid grid-cols-2 gap-4 md:grid-cols-4">
				<div className="rounded-xl bg-emerald-50 p-4 text-center">
					<p className="text-2xl font-bold text-emerald-700">{summary.present}</p>
					<p className="mt-1 text-xs text-gray-500">Có mặt</p>
				</div>
				<div className="rounded-xl bg-amber-50 p-4 text-center">
					<p className="text-2xl font-bold text-amber-700">{summary.partial}</p>
					<p className="mt-1 text-xs text-gray-500">Muộn</p>
				</div>
				<div className="rounded-xl bg-red-50 p-4 text-center">
					<p className="text-2xl font-bold text-red-700">{summary.absent}</p>
					<p className="mt-1 text-xs text-gray-500">Vắng</p>
				</div>
				<div className="rounded-xl bg-indigo-50 p-4 text-center">
					<p className="text-2xl font-bold text-indigo-700">{attendanceRate}%</p>
					<p className="mt-1 text-xs text-gray-500">Tỷ lệ đi học</p>
				</div>
			</div>
			{summary.total > 0 && (
				<div className="mt-4">
					<div className="flex items-center justify-between text-xs text-gray-500 mb-1">
						<span>Tỷ lệ đi học</span>
						<span>{attendanceRate}%</span>
					</div>
					<div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
						<div
							className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-400"
							style={{ width: `${Math.min(100, attendanceRate)}%` }}
						/>
					</div>
				</div>
			)}
		</section>
	);
}

function StudyStatsSection({
	stats,
}: {
	stats: ParentDashboardData["study_stats"];
}) {
	return (
		<section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
			<h2 className="mb-4 text-lg font-bold text-gray-900">📚 Thống kê học tập</h2>
			<div className="grid grid-cols-1 gap-4 md:grid-cols-3">
				<div className="rounded-xl bg-indigo-50 p-4 text-center">
					<p className="text-2xl font-bold text-indigo-700">
						{stats.avg_active_minutes_per_session}
					</p>
					<p className="mt-1 text-xs text-gray-500">Phút/buổi (trung bình)</p>
				</div>
				<div className="rounded-xl bg-purple-50 p-4 text-center">
					<p className="text-2xl font-bold text-purple-700">
						{Math.round(stats.avg_focus_ratio * 100)}%
					</p>
					<p className="mt-1 text-xs text-gray-500">Tỷ lệ tập trung</p>
				</div>
				<div className="rounded-xl bg-blue-50 p-4 text-center">
					<p className="text-2xl font-bold text-blue-700">
						{stats.total_sessions_7d}
					</p>
					<p className="mt-1 text-xs text-gray-500">Phiên học (7 ngày)</p>
				</div>
			</div>
		</section>
	);
}

function RecentQuizResultsSection({
	results,
}: {
	results: ParentDashboardData["recent_quiz_results"];
}) {
	return (
		<section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
			<h2 className="mb-4 text-lg font-bold text-gray-900">📝 Kết quả quiz gần đây</h2>
			{results.length === 0 ? (
				<p className="text-sm text-gray-500">
					Chưa có kết quả quiz nào trong khoảng thời gian này.
				</p>
			) : (
				<div className="overflow-hidden rounded-xl border border-gray-200">
					<table className="w-full text-sm">
						<thead>
							<tr className="border-b border-gray-100 bg-gray-50">
								<th className="py-3 px-4 text-left text-xs font-medium uppercase text-gray-500">
									Bài học
								</th>
								<th className="py-3 px-4 text-center text-xs font-medium uppercase text-gray-500">
									Điểm
								</th>
								<th className="py-3 px-4 text-center text-xs font-medium uppercase text-gray-500">
									Tỷ lệ
								</th>
								<th className="py-3 px-4 text-right text-xs font-medium uppercase text-gray-500">
									Ngày
								</th>
							</tr>
						</thead>
						<tbody className="divide-y divide-gray-50">
							{results.map((quiz, index) => {
								const percentage =
									quiz.max_score > 0
										? Math.round((quiz.score / quiz.max_score) * 100)
										: 0;
								return (
									<tr
										key={`${quiz.lesson_title}-${quiz.date}-${index}`}
										className="hover:bg-gray-50"
									>
										<td className="py-3 px-4 font-medium text-gray-900">
											{quiz.lesson_title}
										</td>
										<td className="py-3 px-4 text-center text-gray-600">
											{quiz.score}/{quiz.max_score}
										</td>
										<td className="py-3 px-4 text-center">
											<span
												className={`font-semibold ${
													percentage >= 70
														? "text-emerald-600"
														: percentage >= 50
															? "text-amber-600"
															: "text-red-500"
												}`}
											>
												{percentage}%
											</span>
										</td>
										<td className="py-3 px-4 text-right text-gray-500">
											{quiz.date}
										</td>
									</tr>
								);
							})}
						</tbody>
					</table>
				</div>
			)}
		</section>
	);
}

function AlertsSection({
	alerts,
}: {
	alerts: ParentDashboardData["alerts"];
}) {
	return (
		<section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
			<h2 className="mb-4 text-lg font-bold text-gray-900">🔔 Cảnh báo</h2>
			{alerts.length === 0 ? (
				<p className="text-sm text-gray-500">
					Không có cảnh báo nào. Tình trạng học tập ổn định.
				</p>
			) : (
				<div className="space-y-3">
					{alerts.map((alert, index) => {
						const style =
							severityStyles[alert.severity] ?? severityStyles.info;
						const badge =
							severityBadge[alert.severity] ?? severityBadge.info;
						return (
							<div
								key={`${alert.type}-${alert.created_at}-${index}`}
								className={`rounded-xl border p-4 ${style}`}
							>
								<div className="flex items-start justify-between gap-3">
									<div className="flex-1">
										<div className="flex items-center gap-2">
											<h3 className="text-sm font-semibold">{alert.title}</h3>
											<span
												className={`rounded-full px-2 py-0.5 text-xs font-medium ${badge}`}
											>
												{alert.severity === "critical"
													? "Nghiêm trọng"
													: alert.severity === "warning"
														? "Cảnh báo"
														: "Thông tin"}
											</span>
										</div>
										{alert.content && (
											<p className="mt-1 text-sm opacity-90">{alert.content}</p>
										)}
									</div>
									<span className="shrink-0 text-xs opacity-70">
										{new Date(alert.created_at).toLocaleDateString("vi-VN")}
									</span>
								</div>
							</div>
						);
					})}
				</div>
			)}
		</section>
	);
}

function InterventionSuggestionsSection({
	suggestions,
}: {
	suggestions: string[];
}) {
	return (
		<section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
			<h2 className="mb-4 text-lg font-bold text-gray-900">💡 Gợi ý can thiệp</h2>
			{suggestions.length === 0 ? (
				<p className="text-sm text-gray-500">
					Chưa có gợi ý can thiệp. Trạng thái học tập hiện ổn định hoặc chưa đủ
					dữ liệu.
				</p>
			) : (
				<ul className="space-y-2">
					{suggestions.map((suggestion) => (
						<li
							key={suggestion}
							className="flex items-start gap-3 rounded-xl bg-indigo-50 p-3 text-sm text-indigo-800"
						>
							<span className="mt-0.5 shrink-0">→</span>
							<span>{suggestion}</span>
						</li>
					))}
				</ul>
			)}
		</section>
	);
}
