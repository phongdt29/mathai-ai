"use client";

import {
	AlertCircle,
	CheckCircle2,
	Clock,
	FileText,
	Loader2,
	Send,
} from "lucide-react";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import { useAgeTheme } from "@/contexts/AgeThemeContext";
import {
	listStudentAssignmentsPage,
	type StudentAssignmentSubmissionStatus,
	type StudentAssignmentSummary,
	submitStudentAssignment,
} from "@/lib/api";

function formatDate(value: string | null): string {
	if (!value) return "Không giới hạn";
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return "Không giới hạn";
	return new Intl.DateTimeFormat("vi-VN", {
		dateStyle: "medium",
		timeStyle: "short",
	}).format(date);
}

function statusLabel(assignment: StudentAssignmentSummary): string {
	if (assignment.score !== null) return "Đã chấm";
	if (assignment.submission_id) return "Đã nộp";
	if (assignment.status === "active") return "Cần nộp";
	if (assignment.status === "grading") return "Đang chấm";
	return "Đã đóng";
}

function statusClasses(assignment: StudentAssignmentSummary): string {
	if (assignment.score !== null)
		return "bg-emerald-50 text-emerald-700 ring-emerald-200";
	if (assignment.submission_id) return "bg-blue-50 text-blue-700 ring-blue-200";
	if (assignment.status === "active")
		return "bg-amber-50 text-amber-700 ring-amber-200";
	return "bg-gray-100 text-gray-600 ring-gray-200";
}

function getAssignmentId(assignment: StudentAssignmentSummary): string {
	return assignment.id;
}

const ASSIGNMENTS_PAGE_SIZE = 6;

export default function StudentAssignmentsPage() {
	const { theme } = useAgeTheme();
	const [assignments, setAssignments] = useState<StudentAssignmentSummary[]>(
		[],
	);
	const [selectedId, setSelectedId] = useState("");
	const [draftContent, setDraftContent] = useState("");
	const [loading, setLoading] = useState(true);
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState("");
	const [message, setMessage] = useState("");
	const [statusFilter, setStatusFilter] = useState("");
	const [submissionFilter, setSubmissionFilter] = useState<
		"" | StudentAssignmentSubmissionStatus
	>("");
	const [page, setPage] = useState(1);
	const [totalPages, setTotalPages] = useState(1);
	const [totalAssignments, setTotalAssignments] = useState(0);

	useEffect(() => {
		let cancelled = false;

		async function loadAssignments() {
			setLoading(true);
			setError("");

			try {
				const result = await listStudentAssignmentsPage({
					page,
					limit: ASSIGNMENTS_PAGE_SIZE,
					status: statusFilter || undefined,
					submission_status: submissionFilter || undefined,
				});
				const data = result.items;
				if (cancelled) return;
				setAssignments(data);
				setTotalPages(result.total_pages);
				setTotalAssignments(result.total);
				const firstId = data[0] ? getAssignmentId(data[0]) : "";
				const nextSelected =
					data.find((item) => getAssignmentId(item) === selectedId) ??
					data[0] ??
					null;
				setSelectedId(nextSelected ? getAssignmentId(nextSelected) : firstId);
				setDraftContent(nextSelected?.submission_content ?? "");
				setMessage("");
			} catch (err) {
				if (!cancelled) {
					setError(
						err instanceof Error ? err.message : "Không tải được bài tập.",
					);
				}
			} finally {
				if (!cancelled) setLoading(false);
			}
		}

		loadAssignments();
		return () => {
			cancelled = true;
		};
	}, [page, selectedId, statusFilter, submissionFilter]);

	const selectedAssignment = useMemo(
		() =>
			assignments.find(
				(assignment) => getAssignmentId(assignment) === selectedId,
			) ??
			assignments[0] ??
			null,
		[assignments, selectedId],
	);

	async function handleSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!selectedAssignment) return;

		setSubmitting(true);
		setError("");
		setMessage("");

		try {
			const submission = await submitStudentAssignment(
				getAssignmentId(selectedAssignment),
				{
					content: draftContent,
				},
			);
			setAssignments((current) =>
				current.map((assignment) =>
					getAssignmentId(assignment) === getAssignmentId(selectedAssignment)
						? {
								...assignment,
								submission_id:
									submission._id ?? submission.id ?? assignment.submission_id,
								submission_content: submission.content,
								submitted_at: submission.submitted_at,
								score: submission.score,
								feedback: submission.feedback,
								graded_at: submission.graded_at,
							}
						: assignment,
				),
			);
			setMessage("Đã nộp bài. Giáo viên sẽ chấm và phản hồi trong sổ điểm.");
		} catch (err) {
			setError(err instanceof Error ? err.message : "Không thể nộp bài tập.");
		} finally {
			setSubmitting(false);
		}
	}

	const canSubmit =
		selectedAssignment?.status === "active" &&
		selectedAssignment.score === null;

	function resetToFirstPage() {
		setPage(1);
	}

	function handleSelectAssignment(assignment: StudentAssignmentSummary) {
		setSelectedId(getAssignmentId(assignment));
		setDraftContent(assignment.submission_content ?? "");
		setMessage("");
		setError("");
	}

	return (
		<div className={`${theme.sectionGap} flex flex-col`}>
			<div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
				<div>
					<h1 className={`${theme.fontWeight} text-2xl text-gray-900`}>
						Bài tập giáo viên
					</h1>
					<p className="mt-1 text-gray-500">
						Xem bài được giao theo lớp, nộp lời giải và theo dõi phản hồi sau
						khi giáo viên chấm.
					</p>
				</div>
				<div
					className={`${theme.cardRadius} bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-700 ring-1 ring-blue-100`}
				>
					{
						assignments.filter(
							(item) => item.status === "active" && !item.submission_id,
						).length
					}{" "}
					bài cần nộp
				</div>
			</div>

			<div
				className={`${theme.cardRadius} grid gap-3 border border-gray-100 bg-white p-4 shadow-sm md:grid-cols-[1fr_1fr_auto] md:items-end`}
			>
				<label className="block text-sm font-semibold text-gray-700">
					Trạng thái bài tập
					<select
						value={statusFilter}
						onChange={(event) => {
							setStatusFilter(event.target.value);
							resetToFirstPage();
						}}
						className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
					>
						<option value="">Tất cả</option>
						<option value="active">Đang mở</option>
						<option value="grading">Đang chấm</option>
						<option value="closed">Đã đóng</option>
					</select>
				</label>
				<label className="block text-sm font-semibold text-gray-700">
					Trạng thái nộp bài
					<select
						value={submissionFilter}
						onChange={(event) => {
							setSubmissionFilter(
								event.target.value as "" | StudentAssignmentSubmissionStatus,
							);
							resetToFirstPage();
						}}
						className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
					>
						<option value="">Tất cả</option>
						<option value="pending">Chưa nộp</option>
						<option value="submitted">Đã nộp, chờ chấm</option>
						<option value="graded">Đã chấm</option>
					</select>
				</label>
				<div className="text-sm text-gray-500 md:text-right">
					<div className="font-bold text-gray-900">
						{totalAssignments} bài phù hợp
					</div>
					<div>
						Trang {page}/{totalPages}
					</div>
				</div>
			</div>

			{loading && (
				<div
					className={`${theme.cardRadius} border border-gray-100 bg-white p-8 text-center text-gray-500`}
				>
					<Loader2 className="mx-auto mb-3 h-6 w-6 animate-spin text-blue-600" />
					Đang tải danh sách bài tập...
				</div>
			)}

			{!loading && assignments.length === 0 && (
				<div
					className={`${theme.cardRadius} border border-dashed border-gray-200 bg-gray-50 p-8 text-center`}
				>
					<FileText className="mx-auto mb-3 h-10 w-10 text-gray-400" />
					<div className="font-bold text-gray-900">
						Chưa có bài tập được giao
					</div>
					<p className="mt-1 text-gray-500">
						Khi giáo viên giao bài cho lớp của em, bài tập sẽ xuất hiện tại đây.
					</p>
				</div>
			)}

			{!loading && assignments.length > 0 && (
				<div className="space-y-4">
					<div className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
						<div className="space-y-3">
							{assignments.map((assignment) => {
								const id = getAssignmentId(assignment);
								const selected =
									id === getAssignmentId(selectedAssignment ?? assignment);
								return (
									<button
										key={id}
										type="button"
										onClick={() => handleSelectAssignment(assignment)}
										className={`w-full text-left ${theme.cardRadius} border bg-white p-4 transition ${selected ? "border-blue-300 shadow-sm ring-2 ring-blue-100" : "border-gray-100 hover:border-blue-200"}`}
									>
										<div className="flex items-start justify-between gap-3">
											<div>
												<div className="font-bold text-gray-900">
													{assignment.title}
												</div>
												<div className="mt-1 text-sm text-gray-500">
													{assignment.class_name}
												</div>
											</div>
											<span
												className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ring-1 ${statusClasses(assignment)}`}
											>
												{statusLabel(assignment)}
											</span>
										</div>
										<div className="mt-3 flex items-center gap-2 text-sm text-gray-500">
											<Clock className="h-4 w-4" />
											Hạn nộp: {formatDate(assignment.due_date)}
										</div>
									</button>
								);
							})}
						</div>

						{selectedAssignment && (
							<form
								onSubmit={handleSubmit}
								className={`${theme.cardRadius} border border-gray-100 bg-white p-5 shadow-sm`}
							>
								<div className="flex flex-col gap-3 border-b border-gray-100 pb-4 sm:flex-row sm:items-start sm:justify-between">
									<div>
										<h2 className="text-xl font-bold text-gray-900">
											{selectedAssignment.title}
										</h2>
										<p className="mt-1 text-gray-600">
											{selectedAssignment.description ||
												"Giáo viên chưa thêm mô tả chi tiết."}
										</p>
										<div className="mt-3 flex flex-wrap gap-2 text-sm text-gray-500">
											<span className="rounded-full bg-gray-100 px-3 py-1">
												{selectedAssignment.type}
											</span>
											<span className="rounded-full bg-gray-100 px-3 py-1">
												{selectedAssignment.total_points} điểm
											</span>
											<span className="rounded-full bg-gray-100 px-3 py-1">
												{selectedAssignment.class_name}
											</span>
										</div>
									</div>
									<span
										className={`rounded-full px-3 py-1.5 text-sm font-bold ring-1 ${statusClasses(selectedAssignment)}`}
									>
										{statusLabel(selectedAssignment)}
									</span>
								</div>

								{selectedAssignment.score !== null && (
									<div className="mt-4 rounded-2xl border border-emerald-100 bg-emerald-50 p-4 text-emerald-800">
										<div className="flex items-center gap-2 font-bold">
											<CheckCircle2 className="h-5 w-5" />
											Điểm: {selectedAssignment.score}/
											{selectedAssignment.total_points}
										</div>
										{selectedAssignment.feedback && (
											<p className="mt-2 text-sm">
												{selectedAssignment.feedback}
											</p>
										)}
									</div>
								)}

								<label className="mt-5 block">
									<span className="text-sm font-bold text-gray-700">
										Lời giải / nội dung nộp bài
									</span>
									<textarea
										value={draftContent}
										onChange={(event) => setDraftContent(event.target.value)}
										disabled={!canSubmit || submitting}
										rows={10}
										className="mt-2 w-full rounded-2xl border border-gray-200 px-4 py-3 text-gray-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-gray-50 disabled:text-gray-500"
										placeholder="Nhập lời giải, cách làm hoặc đường dẫn tài liệu bài nộp..."
									/>
								</label>

								{error && (
									<div className="mt-4 flex items-start gap-2 rounded-2xl border border-red-100 bg-red-50 p-3 text-sm text-red-700">
										<AlertCircle className="mt-0.5 h-4 w-4" />
										{error}
									</div>
								)}
								{message && (
									<div className="mt-4 rounded-2xl border border-blue-100 bg-blue-50 p-3 text-sm font-semibold text-blue-700">
										{message}
									</div>
								)}

								<div className="mt-5 flex items-center justify-between gap-3">
									<div className="text-sm text-gray-500">
										{selectedAssignment.submitted_at
											? `Đã nộp: ${formatDate(selectedAssignment.submitted_at)}`
											: "Chưa nộp bài"}
									</div>
									<button
										type="submit"
										disabled={
											!canSubmit ||
											submitting ||
											draftContent.trim().length === 0
										}
										className={`${theme.buttonRadius} inline-flex items-center gap-2 bg-blue-600 px-4 py-2 font-bold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-300`}
									>
										{submitting ? (
											<Loader2 className="h-4 w-4 animate-spin" />
										) : (
											<Send className="h-4 w-4" />
										)}
										Nộp bài
									</button>
								</div>
							</form>
						)}
					</div>
					<div className="flex items-center justify-between gap-3 rounded-2xl border border-gray-100 bg-white px-4 py-3 text-sm text-gray-600">
						<button
							type="button"
							onClick={() => setPage((current) => Math.max(1, current - 1))}
							disabled={page <= 1 || loading}
							className="rounded-xl border border-gray-200 px-3 py-2 font-semibold transition hover:border-blue-300 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
						>
							Trang trước
						</button>
						<span className="font-semibold text-gray-900">
							Trang {page} / {totalPages}
						</span>
						<button
							type="button"
							onClick={() =>
								setPage((current) => Math.min(totalPages, current + 1))
							}
							disabled={page >= totalPages || loading}
							className="rounded-xl border border-gray-200 px-3 py-2 font-semibold transition hover:border-blue-300 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
						>
							Trang sau
						</button>
					</div>
				</div>
			)}
		</div>
	);
}
