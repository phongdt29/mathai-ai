"use client";

import { ArrowLeft, CalendarClock, Loader2, Target, Users } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
	type ContentAssignment,
	contentLibraryApi,
} from "@/lib/content-library";

function recipientCount(assignment: ContentAssignment): number {
	return (
		assignment.recipients_count ??
		assignment.recipient_mapping?.applied_student_ids?.length ??
		assignment.student_contents?.length ??
		0
	);
}

function titleOf(assignment: ContentAssignment): string {
	return (
		assignment.template_snapshot?.title ||
		assignment.template_snapshot?.lesson_title ||
		assignment.template_id
	);
}

export default function AssignmentStats({
	id,
	basePath,
}: {
	id: string;
	basePath: "/admin/assignments" | "/teacher/content-library/assignments";
}) {
	const [assignment, setAssignment] = useState<ContentAssignment | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");

	useEffect(() => {
		let active = true;
		queueMicrotask(() => {
			if (!active) return;
			setLoading(true);
			setError("");
			contentLibraryApi
			.getAssignmentDetail(id)
			.then((res) => {
				if (active) setAssignment(res.data);
			})
			.catch((err) => {
				if (active)
					setError(
						err instanceof Error
							? err.message
							: "Không thể tải thống kê assignment",
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
		if (!assignment)
			return { recipients: 0, activeStudents: 0, archivedStudents: 0 };
		const studentContents = Array.isArray(assignment.student_contents)
			? assignment.student_contents
			: [];
		const activeStudents = studentContents.filter(
			(item) =>
				typeof item === "object" &&
				item !== null &&
				(item as { status?: string }).status === "active",
		).length;
		const archivedStudents = studentContents.filter(
			(item) =>
				typeof item === "object" &&
				item !== null &&
				(item as { status?: string }).status === "archived",
		).length;
		return {
			recipients: recipientCount(assignment),
			activeStudents,
			archivedStudents,
		};
	}, [assignment]);

	if (loading)
		return (
			<div
				data-testid="assignment-stats-loading"
				className="flex justify-center py-20"
			>
				<Loader2 className="h-8 w-8 animate-spin text-blue-600" />
			</div>
		);
	if (error && !assignment)
		return (
			<div
				role="alert"
				data-testid="assignment-stats-error"
				className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"
			>
				{error}
			</div>
		);
	if (!assignment)
		return (
			<div
				data-testid="assignment-stats-empty"
				className="rounded-xl border border-dashed border-gray-200 p-8 text-center text-sm text-gray-500"
			>
				Không tìm thấy dữ liệu thống kê assignment.
			</div>
		);

	return (
		<div data-testid="assignment-stats" className="space-y-6">
			<nav aria-label="Điều hướng thống kê assignment">
				<Link
					href={`${basePath}/${id}`}
					className="inline-flex items-center gap-2 text-sm font-medium text-gray-500 hover:text-gray-900"
				>
					<ArrowLeft className="h-4 w-4" /> Quay lại chi tiết assignment
				</Link>
			</nav>
			<header>
				<p className="text-sm font-medium text-blue-600">Thống kê assignment</p>
				<h1 className="mt-1 text-2xl font-bold text-gray-900">
					{titleOf(assignment)}
				</h1>
				<p className="mt-1 text-sm text-gray-500">
					Theo dõi phạm vi phân phối nội dung. Nếu backend trả về
					student_contents, trạng thái học sinh sẽ được tổng hợp tại đây.
				</p>
			</header>

			<section
				aria-label="Thẻ thống kê assignment"
				className="grid gap-4 md:grid-cols-4"
			>
				<div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
					<Users className="h-5 w-5 text-blue-600" />
					<p className="mt-3 text-sm text-gray-500">Người nhận</p>
					<p className="text-2xl font-bold text-gray-900">{stats.recipients}</p>
				</div>
				<div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
					<Target className="h-5 w-5 text-emerald-600" />
					<p className="mt-3 text-sm text-gray-500">Đang active</p>
					<p className="text-2xl font-bold text-gray-900">
						{stats.activeStudents}
					</p>
				</div>
				<div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
					<Target className="h-5 w-5 text-gray-500" />
					<p className="mt-3 text-sm text-gray-500">Đã lưu trữ</p>
					<p className="text-2xl font-bold text-gray-900">
						{stats.archivedStudents}
					</p>
				</div>
				<div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
					<CalendarClock className="h-5 w-5 text-amber-600" />
					<p className="mt-3 text-sm text-gray-500">Ngày tạo</p>
					<p className="text-lg font-bold text-gray-900">
						{new Date(assignment.createdAt).toLocaleDateString("vi-VN")}
					</p>
				</div>
			</section>

			<section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
				<h2 className="text-lg font-bold text-gray-900">
					Trạng thái phân phối
				</h2>
				<div className="mt-4 space-y-3">
					{[
						{
							label: "Đang active",
							value: stats.activeStudents,
							color: "bg-emerald-500",
						},
						{
							label: "Đã lưu trữ",
							value: stats.archivedStudents,
							color: "bg-gray-500",
						},
					].map((item) => {
						const percent =
							stats.recipients > 0
								? Math.round((item.value / stats.recipients) * 100)
								: 0;
						return (
							<div key={item.label}>
								<div className="flex justify-between text-sm">
									<span className="font-medium text-gray-700">
										{item.label}
									</span>
									<span className="text-gray-500">
										{item.value}/{stats.recipients} · {percent}%
									</span>
								</div>
								<div className="mt-1 h-2 rounded-full bg-gray-100">
									<div
										className={`h-2 rounded-full ${item.color}`}
										style={{ width: `${percent}%` }}
									/>
								</div>
							</div>
						);
					})}
				</div>
			</section>
		</div>
	);
}
