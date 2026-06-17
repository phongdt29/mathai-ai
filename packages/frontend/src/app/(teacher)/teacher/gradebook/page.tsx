"use client";

import { BookOpenCheck, Loader2, Target, Users } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
	getTeacherGradebook,
	type StudentGradebookSummary,
	type TeacherGradebookSummary,
} from "@/lib/api";

function formatPercent(value: number): string {
	return `${Math.round(value * 100) / 100}%`;
}

function scoreClass(percentage: number): string {
	if (percentage >= 75) return "text-emerald-600";
	if (percentage >= 50) return "text-amber-600";
	return "text-red-500";
}

function sourceLabel(sourceType: string): string {
	if (sourceType === "teacher_assignment") return "Bài tập";
	if (sourceType === "assessment") return "Đánh giá";
	if (sourceType === "lesson") return "Bài học";
	return sourceType;
}

function latestEntry(student: StudentGradebookSummary) {
	return student.gradebook_entries[0] ?? null;
}

export default function TeacherGradebookPage() {
	const [summary, setSummary] = useState<TeacherGradebookSummary | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		let mounted = true;

		async function loadGradebook() {
			try {
				setLoading(true);
				setError(null);
				const data = await getTeacherGradebook();
				if (mounted) setSummary(data);
			} catch (loadError) {
				if (mounted) {
					setError(
						loadError instanceof Error
							? loadError.message
							: "Không tải được sổ điểm",
					);
					setSummary(null);
				}
			} finally {
				if (mounted) setLoading(false);
			}
		}

		loadGradebook();
		return () => {
			mounted = false;
		};
	}, []);

	const topStudents = useMemo(() => {
		return [...(summary?.students ?? [])]
			.sort((a, b) => b.percentage - a.percentage)
			.slice(0, 5);
	}, [summary?.students]);

	if (loading) {
		return (
			<div className="flex h-64 items-center justify-center">
				<Loader2 className="h-6 w-6 animate-spin text-emerald-600" />
			</div>
		);
	}

	return (
		<div className="space-y-6">
			<div>
				<h1 className="text-xl font-bold text-gray-900">Sổ điểm</h1>
				<p className="mt-0.5 text-sm text-gray-500">
					Tổng hợp điểm từ bài nộp đã chấm, assessment và bài học qua gradebook
					API thật.
				</p>
			</div>

			{error && (
				<div className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">
					{error}
				</div>
			)}

			{!error && summary && (
				<>
					<div className="grid gap-4 md:grid-cols-3">
						<div className="rounded-xl border border-gray-200 bg-white p-5">
							<div className="mb-2 flex items-center gap-2 text-sm text-gray-500">
								<Users className="h-4 w-4 text-emerald-600" /> Học sinh có điểm
							</div>
							<div className="text-3xl font-bold text-gray-900">
								{summary.students.length}
							</div>
						</div>
						<div className="rounded-xl border border-gray-200 bg-white p-5">
							<div className="mb-2 flex items-center gap-2 text-sm text-gray-500">
								<BookOpenCheck className="h-4 w-4 text-emerald-600" /> Bản ghi
								điểm
							</div>
							<div className="text-3xl font-bold text-gray-900">
								{summary.entries}
							</div>
						</div>
						<div className="rounded-xl border border-gray-200 bg-white p-5">
							<div className="mb-2 flex items-center gap-2 text-sm text-gray-500">
								<Target className="h-4 w-4 text-emerald-600" /> Tỷ lệ tổng
							</div>
							<div
								className={`text-3xl font-bold ${scoreClass(summary.percentage)}`}
							>
								{formatPercent(summary.percentage)}
							</div>
						</div>
					</div>

					{summary.students.length === 0 ? (
						<div className="rounded-xl border border-gray-200 bg-white p-10 text-center">
							<BookOpenCheck className="mx-auto mb-3 h-10 w-10 text-gray-300" />
							<h2 className="text-base font-semibold text-gray-900">
								Chưa có điểm thật
							</h2>
							<p className="mt-2 text-sm text-gray-500">
								Sổ điểm sẽ có dữ liệu khi giáo viên chấm bài nộp hoặc hệ thống
								ghi assessment/lesson vào gradebook.
							</p>
						</div>
					) : (
						<div className="grid gap-6 xl:grid-cols-[1fr_320px]">
							<div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
								<div className="border-b border-gray-100 px-5 py-4">
									<h2 className="font-semibold text-gray-900">
										Bảng điểm theo học sinh
									</h2>
								</div>
								<div className="overflow-x-auto">
									<table className="w-full text-left text-sm">
										<thead className="bg-gray-50 text-xs uppercase text-gray-500">
											<tr>
												<th className="px-5 py-3">Học sinh</th>
												<th className="px-5 py-3">Điểm</th>
												<th className="px-5 py-3">Tỷ lệ</th>
												<th className="px-5 py-3">Bản ghi</th>
												<th className="px-5 py-3">Mới nhất</th>
											</tr>
										</thead>
										<tbody className="divide-y divide-gray-50">
											{summary.students.map((student) => {
												const entry = latestEntry(student);
												return (
													<tr
														key={student.student_id}
														className="hover:bg-gray-50 cursor-pointer"
													>
														<td className="px-5 py-4 font-medium text-gray-900">
															<Link
																href={`/teacher/gradebook/${student.student_id}`}
																className="text-emerald-700 hover:underline"
															>
																{student.student_id}
															</Link>
														</td>
														<td className="px-5 py-4 text-gray-600">
															{student.earned_points}/{student.max_points}
														</td>
														<td
															className={`px-5 py-4 font-semibold ${scoreClass(student.percentage)}`}
														>
															{formatPercent(student.percentage)}
														</td>
														<td className="px-5 py-4 text-gray-600">
															{student.entries}
														</td>
														<td className="px-5 py-4 text-gray-600">
															{entry
																? `${entry.title} · ${sourceLabel(entry.source_type)}`
																: "—"}
														</td>
													</tr>
												);
											})}
										</tbody>
									</table>
								</div>
							</div>

							<div className="rounded-xl border border-gray-200 bg-white p-5">
								<h2 className="font-semibold text-gray-900">Top tiến độ</h2>
								<div className="mt-4 space-y-3">
									{topStudents.map((student) => (
										<div key={student.student_id}>
											<div className="mb-1 flex items-center justify-between text-sm">
												<span className="max-w-[180px] truncate font-medium text-gray-700">
													{student.student_id}
												</span>
												<span
													className={`font-semibold ${scoreClass(student.percentage)}`}
												>
													{formatPercent(student.percentage)}
												</span>
											</div>
											<div className="h-2 overflow-hidden rounded-full bg-gray-100">
												<div
													className="h-full rounded-full bg-emerald-500"
													style={{
														width: `${Math.min(100, Math.max(0, student.percentage))}%`,
													}}
												/>
											</div>
										</div>
									))}
								</div>
							</div>
						</div>
					)}
				</>
			)}
		</div>
	);
}
