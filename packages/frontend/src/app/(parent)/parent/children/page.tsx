"use client";

import { type FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import {
	getParentChildDashboard,
	getParentChildren,
	linkParentChild,
	type ParentChild,
	type ParentDashboardData,
	unlinkParentChild,
} from "@/lib/api";

type ChildDetail = {
	child: ParentChild;
	dashboard: ParentDashboardData | null;
	error: string | null;
};

function attendancePercent(dashboard: ParentDashboardData): number {
	const total = dashboard.attendance_summary.total;
	if (!total) return 0;
	return Math.round((dashboard.attendance_summary.present / total) * 100);
}

export default function ChildrenPage() {
	const [children, setChildren] = useState<ChildDetail[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [studentEmail, setStudentEmail] = useState("");
	const [studentBirthDate, setStudentBirthDate] = useState("");
	const [linking, setLinking] = useState(false);
	const [unlinkingStudentId, setUnlinkingStudentId] = useState<string | null>(
		null,
	);
	const [linkMessage, setLinkMessage] = useState<string | null>(null);
	const [linkError, setLinkError] = useState<string | null>(null);

	async function handleLinkChild(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		try {
			setLinking(true);
			setLinkMessage(null);
			setLinkError(null);
			const linkedChild = await linkParentChild({
				student_email: studentEmail,
				date_of_birth: studentBirthDate,
			});
			let dashboard: ParentDashboardData | null = null;
			let dashboardError: string | null = null;
			try {
				dashboard = await getParentChildDashboard(linkedChild.student_id);
			} catch (childError) {
				dashboardError =
					childError instanceof Error
						? childError.message
						: "Không tải được dữ liệu học tập";
			}
			setChildren((current) => [
				{ child: linkedChild, dashboard, error: dashboardError },
				...current.filter(
					(item) => item.child.student_id !== linkedChild.student_id,
				),
			]);
			setStudentEmail("");
			setStudentBirthDate("");
			setLinkMessage(
				linkedChild.already_linked
					? `${linkedChild.full_name} đã có trong danh sách.`
					: `Đã liên kết ${linkedChild.full_name}.`,
			);
		} catch (linkError) {
			setLinkError(
				linkError instanceof Error
					? linkError.message
					: "Không thể liên kết học sinh",
			);
		} finally {
			setLinking(false);
		}
	}

	async function handleUnlinkChild(child: ParentChild) {
		const confirmed = window.confirm(
			`Hủy liên kết ${child.full_name}? Phụ huynh sẽ không còn xem dashboard học tập của học sinh này.`,
		);
		if (!confirmed) return;

		try {
			setUnlinkingStudentId(child.student_id);
			setLinkMessage(null);
			setLinkError(null);
			const unlinkedChild = await unlinkParentChild(child.student_id);
			setChildren((current) =>
				current.filter((item) => item.child.student_id !== child.student_id),
			);
			setLinkMessage(`Đã hủy liên kết ${unlinkedChild.full_name}.`);
		} catch (unlinkError) {
			setLinkError(
				unlinkError instanceof Error
					? unlinkError.message
					: "Không thể hủy liên kết học sinh",
			);
		} finally {
			setUnlinkingStudentId(null);
		}
	}

	useEffect(() => {
		let mounted = true;

		async function loadChildren() {
			try {
				setLoading(true);
				setError(null);
				const linkedChildren = await getParentChildren();
				const details = await Promise.all(
					linkedChildren.map(async (child) => {
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
										: "Không tải được dữ liệu học tập",
							};
						}
					}),
				);
				if (mounted) setChildren(details);
			} catch (loadError) {
				if (mounted) {
					setError(
						loadError instanceof Error
							? loadError.message
							: "Không tải được danh sách con",
					);
					setChildren([]);
				}
			} finally {
				if (mounted) setLoading(false);
			}
		}

		loadChildren();
		return () => {
			mounted = false;
		};
	}, []);

	if (loading) {
		return (
			<div className="rounded-2xl bg-white p-8 text-center shadow-sm ring-1 ring-gray-100">
				<div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent" />
				<p className="text-sm text-gray-500">Đang tải danh sách con...</p>
			</div>
		);
	}

	return (
		<div className="space-y-6">
			<div>
				<h1 className="text-2xl font-bold text-gray-900">Con em 👦</h1>
				<p className="text-gray-500">
					Danh sách học sinh liên kết và trạng thái học tập lấy từ API phụ
					huynh.
				</p>
			</div>

			<form
				onSubmit={handleLinkChild}
				className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100"
			>
				<div className="mb-4">
					<h2 className="text-lg font-bold text-gray-900">Liên kết học sinh</h2>
					<p className="mt-1 text-sm text-gray-500">
						Nhập email tài khoản học sinh và ngày sinh để xác minh trước khi mở
						dashboard phụ huynh.
					</p>
				</div>
				<div className="grid gap-4 md:grid-cols-[1fr_220px_auto] md:items-end">
					<label className="block text-sm font-medium text-gray-700">
						Email học sinh
						<input
							type="email"
							value={studentEmail}
							onChange={(event) => setStudentEmail(event.target.value)}
							placeholder="hoc-sinh@example.com"
							required
							className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
						/>
					</label>
					<label className="block text-sm font-medium text-gray-700">
						Ngày sinh
						<input
							type="date"
							value={studentBirthDate}
							onChange={(event) => setStudentBirthDate(event.target.value)}
							required
							className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
						/>
					</label>
					<button
						type="submit"
						disabled={linking}
						className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-indigo-300"
					>
						{linking ? "Đang liên kết..." : "Liên kết"}
					</button>
				</div>
				{linkMessage && (
					<p className="mt-3 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">
						{linkMessage}
					</p>
				)}
				{linkError && (
					<p className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-700">
						{linkError}
					</p>
				)}
			</form>

			{error && (
				<div className="rounded-2xl border border-red-100 bg-red-50 p-5 text-sm text-red-700">
					{error}
				</div>
			)}

			{!error && children.length === 0 && (
				<div className="rounded-2xl bg-white p-8 text-center shadow-sm ring-1 ring-gray-100">
					<div className="text-4xl">🔗</div>
					<h2 className="mt-3 text-lg font-bold text-gray-900">
						Chưa có học sinh được liên kết
					</h2>
					<p className="mt-2 text-sm text-gray-500">
						Dùng biểu mẫu phía trên với email và ngày sinh của học sinh để bắt
						đầu theo dõi tiến độ học tập.
					</p>
				</div>
			)}

			{children.map(({ child, dashboard, error: childError }) => (
				<div
					key={child.student_id}
					className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-gray-100"
				>
					<div className="flex flex-col gap-3 bg-gradient-to-r from-indigo-500 to-purple-600 px-6 py-4 text-white sm:flex-row sm:items-start sm:justify-between">
						<div>
							<div className="text-lg font-bold">
								{dashboard?.student.name ?? child.full_name}
							</div>
							<div className="text-sm text-indigo-100">
								{dashboard?.student.grade_level
									? `Lớp ${dashboard.student.grade_level}`
									: "Chưa có khối lớp"}
							</div>
						</div>
						<div className="flex items-center gap-2">
							<Link
								href={`/parent/children/${encodeURIComponent(child.student_id)}`}
								className="rounded-xl bg-white/25 px-3 py-2 text-sm font-semibold text-white ring-1 ring-white/30 transition hover:bg-white/35"
							>
								Xem chi tiết
							</Link>
							<button
								type="button"
								onClick={() => handleUnlinkChild(child)}
								disabled={unlinkingStudentId === child.student_id}
								className="rounded-xl bg-white/15 px-3 py-2 text-sm font-semibold text-white ring-1 ring-white/30 transition hover:bg-white/25 disabled:cursor-not-allowed disabled:opacity-60"
							>
								{unlinkingStudentId === child.student_id
									? "Đang hủy..."
									: "Hủy liên kết"}
							</button>
						</div>
					</div>
					<div className="space-y-4 p-6">
						{childError && (
							<div className="rounded-xl bg-amber-50 p-3 text-sm text-amber-700">
								{childError}
							</div>
						)}

						{dashboard ? (
							<>
								<div className="grid gap-3 md:grid-cols-4">
									<div className="rounded-xl bg-gray-50 p-4">
										<div className="text-xs text-gray-500">Đi học 30 ngày</div>
										<div className="mt-1 text-2xl font-bold text-gray-900">
											{attendancePercent(dashboard)}%
										</div>
									</div>
									<div className="rounded-xl bg-gray-50 p-4">
										<div className="text-xs text-gray-500">Phiên 7 ngày</div>
										<div className="mt-1 text-2xl font-bold text-indigo-600">
											{dashboard.study_stats.total_sessions_7d}
										</div>
									</div>
									<div className="rounded-xl bg-gray-50 p-4">
										<div className="text-xs text-gray-500">Phút/buổi</div>
										<div className="mt-1 text-2xl font-bold text-emerald-600">
											{dashboard.study_stats.avg_active_minutes_per_session}
										</div>
									</div>
									<div className="rounded-xl bg-gray-50 p-4">
										<div className="text-xs text-gray-500">Risk score</div>
										<div className="mt-1 text-2xl font-bold text-amber-600">
											{dashboard.risk.score}
										</div>
									</div>
								</div>

								<div>
									<div className="mb-1 flex items-center justify-between text-sm">
										<span className="font-medium text-gray-700">
											Tỷ lệ tập trung trung bình
										</span>
										<span className="font-bold text-gray-900">
											{Math.round(dashboard.study_stats.avg_focus_ratio * 100)}%
										</span>
									</div>
									<div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
										<div
											className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-purple-500"
											style={{
												width: `${Math.min(100, Math.round(dashboard.study_stats.avg_focus_ratio * 100))}%`,
											}}
										/>
									</div>
								</div>

								<div className="grid gap-4 md:grid-cols-2">
									<div className="rounded-xl border border-gray-100 p-4">
										<h3 className="font-semibold text-gray-900">
											Quiz gần đây
										</h3>
										{dashboard.recent_quiz_results.length === 0 ? (
											<p className="mt-2 text-sm text-gray-500">
												Chưa có kết quả quiz cuối buổi.
											</p>
										) : (
											<ul className="mt-2 space-y-2 text-sm">
												{dashboard.recent_quiz_results.map((quiz, index) => (
													<li
														key={`${quiz.lesson_title}-${quiz.date}-${index}`}
														className="flex justify-between text-gray-600"
													>
														<span>{quiz.lesson_title}</span>
														<span className="font-semibold text-indigo-600">
															{quiz.score}/{quiz.max_score}
														</span>
													</li>
												))}
											</ul>
										)}
									</div>
									<div className="rounded-xl border border-gray-100 p-4">
										<h3 className="font-semibold text-gray-900">
											Gợi ý can thiệp
										</h3>
										{dashboard.intervention_suggestions.length === 0 ? (
											<p className="mt-2 text-sm text-gray-500">
												Chưa có gợi ý can thiệp; trạng thái hiện ổn định hoặc
												chưa đủ dữ liệu.
											</p>
										) : (
											<ul className="mt-2 list-disc space-y-1 pl-4 text-sm text-gray-600">
												{dashboard.intervention_suggestions.map(
													(suggestion) => (
														<li key={suggestion}>{suggestion}</li>
													),
												)}
											</ul>
										)}
									</div>
								</div>
							</>
						) : (
							<p className="text-sm text-gray-500">
								Chưa có dữ liệu dashboard cho học sinh này.
							</p>
						)}
					</div>
				</div>
			))}
		</div>
	);
}
