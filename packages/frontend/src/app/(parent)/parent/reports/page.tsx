"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import {
	getParentWeeklyReport,
	type ParentWeeklyReport,
	type ParentWeeklyReportStudent,
} from "@/lib/api";

type RangeDays = 7 | 14 | 30;

const RANGE_OPTIONS: { value: RangeDays; label: string }[] = [
	{ value: 7, label: "7 ngày" },
	{ value: 14, label: "14 ngày" },
	{ value: 30, label: "30 ngày" },
];

function riskLabel(level: ParentWeeklyReportStudent["risk_level"]): string {
	if (level === "high") return "Cao";
	if (level === "medium") return "Cần chú ý";
	return "Ổn định";
}

function riskBadgeStyle(level: ParentWeeklyReportStudent["risk_level"]): string {
	if (level === "high") return "bg-red-100 text-red-700";
	if (level === "medium") return "bg-amber-100 text-amber-700";
	return "bg-emerald-100 text-emerald-700";
}

export default function ParentReportsPage() {
	const [report, setReport] = useState<ParentWeeklyReport | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [rangeDays, setRangeDays] = useState<RangeDays>(7);

	const loadReports = useCallback(async (days: RangeDays) => {
		try {
			setLoading(true);
			setError(null);
			const weeklyReport = await getParentWeeklyReport(days);
			setReport(weeklyReport);
		} catch (loadError) {
			setError(
				loadError instanceof Error
					? loadError.message
					: "Không tải được báo cáo phụ huynh",
			);
			setReport(null);
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		let active = true;
		// Defer to a microtask so the loading state update does not run synchronously
		// inside the effect (react-hooks/set-state-in-effect).
		Promise.resolve().then(() => {
			if (active) void loadReports(rangeDays);
		});
		return () => {
			active = false;
		};
	}, [rangeDays, loadReports]);

	const students = useMemo(() => report?.students ?? [], [report]);
	const totalSessions = report?.totals.sessions ?? 0;
	const totalMinutes = report?.totals.active_minutes ?? 0;

	function handleRangeChange(days: RangeDays) {
		setRangeDays(days);
	}

	return (
		<div className="space-y-6">
			{/* Header + Range Selector */}
			<div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
				<div>
					<h1 className="text-2xl font-bold text-gray-900">Báo cáo học tập 📈</h1>
					<p className="text-gray-500">
						Báo cáo tổng hợp từ backend để phụ huynh theo dõi tiến độ học tập của con.
					</p>
				</div>
				<div className="flex items-center gap-1 rounded-xl bg-gray-100 p-1">
					{RANGE_OPTIONS.map((option) => (
						<button
							key={option.value}
							type="button"
							onClick={() => handleRangeChange(option.value)}
							disabled={loading}
							className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
								rangeDays === option.value
									? "bg-white text-indigo-700 shadow-sm"
									: "text-gray-600 hover:text-gray-900"
							} disabled:opacity-50`}
							aria-pressed={rangeDays === option.value}
						>
							{option.label}
						</button>
					))}
				</div>
			</div>

			{/* Loading */}
			{loading && (
				<div className="rounded-2xl bg-white p-8 text-center shadow-sm ring-1 ring-gray-100">
					<div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent" />
					<p className="text-sm text-gray-500">Đang tổng hợp báo cáo...</p>
				</div>
			)}

			{/* Error */}
			{!loading && error && (
				<div className="rounded-2xl border border-red-100 bg-red-50 p-5 text-sm text-red-700">
					{error}
				</div>
			)}

			{/* Empty state */}
			{!loading && !error && students.length === 0 && (
				<div className="rounded-2xl bg-white p-8 text-center shadow-sm ring-1 ring-gray-100">
					<div className="text-4xl">📭</div>
					<h2 className="mt-3 text-lg font-bold text-gray-900">
						Chưa có dữ liệu báo cáo
					</h2>
					<p className="mt-2 text-sm text-gray-500">
						Cần liên kết học sinh và phát sinh session/quiz/attendance thật để
						có báo cáo.
					</p>
				</div>
			)}

			{/* Report content */}
			{!loading && !error && students.length > 0 && (
				<>
					{/* Summary cards */}
					<div className="grid gap-4 md:grid-cols-4">
						<div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-100">
							<div className="text-sm text-gray-500">
								Tổng phiên {report?.range_days ?? rangeDays} ngày
							</div>
							<div className="mt-2 text-3xl font-bold text-indigo-600">
								{totalSessions}
							</div>
						</div>
						<div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-100">
							<div className="text-sm text-gray-500">Phút học ước tính</div>
							<div className="mt-2 text-3xl font-bold text-emerald-600">
								{totalMinutes}
							</div>
						</div>
						<div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-100">
							<div className="text-sm text-gray-500">Học sinh có báo cáo</div>
							<div className="mt-2 text-3xl font-bold text-gray-900">
								{report?.totals.students ?? students.length}
							</div>
						</div>
						<div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-100">
							<div className="text-sm text-gray-500">Cảnh báo cần xem</div>
							<div className="mt-2 text-3xl font-bold text-amber-600">
								{report?.totals.alerts ?? 0}
							</div>
						</div>
					</div>

					{/* Global follow_up_actions */}
					{Boolean(report?.follow_up_actions.length) && (
						<div className="rounded-2xl border border-indigo-100 bg-indigo-50 p-5 text-sm text-indigo-800">
							<div className="font-semibold text-indigo-900">
								Việc nên theo dõi tuần này
							</div>
							<ul className="mt-2 list-disc space-y-1 pl-5">
								{report?.follow_up_actions.map((action) => (
									<li key={action}>{action}</li>
								))}
							</ul>
						</div>
					)}

					{/* Per-child report cards */}
					<div className="space-y-4">
						{students.map((student) => (
							<ChildReportCard key={student.student_id} student={student} />
						))}
					</div>
				</>
			)}
		</div>
	);
}

function ChildReportCard({ student }: { student: ParentWeeklyReportStudent }) {
	return (
		<div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
			{/* Child header */}
			<div className="mb-4 flex items-center justify-between">
				<div>
					<h3 className="text-lg font-bold text-gray-900">
						{student.student_name}
					</h3>
					<p className="text-sm text-gray-500">
						{student.grade_level
							? `Lớp ${student.grade_level}`
							: "Chưa có khối lớp"}
					</p>
				</div>
				<span
					className={`rounded-full px-3 py-1 text-xs font-medium ${riskBadgeStyle(student.risk_level)}`}
				>
					{riskLabel(student.risk_level)}
				</span>
			</div>

			{/* Stats grid */}
			<div className="grid grid-cols-2 gap-3 md:grid-cols-5">
				<div className="rounded-xl bg-indigo-50 p-3 text-center">
					<p className="text-xl font-bold text-indigo-700">{student.sessions}</p>
					<p className="mt-0.5 text-xs text-gray-500">Phiên học</p>
				</div>
				<div className="rounded-xl bg-emerald-50 p-3 text-center">
					<p className="text-xl font-bold text-emerald-700">
						{student.active_minutes}
					</p>
					<p className="mt-0.5 text-xs text-gray-500">Phút học</p>
				</div>
				<div className="rounded-xl bg-blue-50 p-3 text-center">
					<p className="text-xl font-bold text-blue-700">
						{student.attendance_rate !== null
							? `${student.attendance_rate}%`
							: "—"}
					</p>
					<p className="mt-0.5 text-xs text-gray-500">Chuyên cần</p>
				</div>
				<div className="rounded-xl bg-purple-50 p-3 text-center">
					<p className="text-xl font-bold text-purple-700">
						{student.avg_quiz_score !== null
							? `${student.avg_quiz_score}%`
							: "—"}
					</p>
					<p className="mt-0.5 text-xs text-gray-500">Điểm quiz TB</p>
				</div>
				<div className="rounded-xl bg-amber-50 p-3 text-center">
					<p className="text-xl font-bold text-amber-700">{student.alerts}</p>
					<p className="mt-0.5 text-xs text-gray-500">Cảnh báo</p>
				</div>
			</div>

			{/* Per-child follow_up_actions (intervention_suggestions) */}
			{student.intervention_suggestions.length > 0 && (
				<div className="mt-4 rounded-xl border border-gray-100 bg-gray-50 p-4">
					<p className="mb-2 text-xs font-semibold uppercase text-gray-500">
						Gợi ý theo dõi
					</p>
					<ul className="space-y-1">
						{student.intervention_suggestions.map((suggestion) => (
							<li
								key={suggestion}
								className="flex items-start gap-2 text-sm text-gray-700"
							>
								<span className="mt-0.5 shrink-0 text-indigo-500">→</span>
								<span>{suggestion}</span>
							</li>
						))}
					</ul>
				</div>
			)}
		</div>
	);
}
