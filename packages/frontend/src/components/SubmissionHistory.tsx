"use client";

import { Clock, Loader2, MessageSquare, Star } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { API_URL } from "@/lib/api";

export interface SubmissionHistoryEntry {
	id: string;
	submitted_at: string;
	content: string;
	score: number | null;
	feedback: string | null;
	is_late?: boolean;
}

function getAuthHeaders(): Record<string, string> {
	const headers: Record<string, string> = {
		"Content-Type": "application/json",
	};
	if (typeof window !== "undefined") {
		const token = localStorage.getItem("token");
		if (token && /^[\x20-\x7E]+$/.test(token)) {
			headers.Authorization = `Bearer ${token}`;
		}
	}
	return headers;
}

async function fetchSubmissionHistory(
	assignmentId: string,
): Promise<SubmissionHistoryEntry[]> {
	const response = await fetch(
		`${API_URL}/students/me/assignments/${encodeURIComponent(assignmentId)}/submission-history`,
		{ headers: getAuthHeaders() },
	);
	if (!response.ok) {
		const error = await response.json().catch(() => ({ message: "Lỗi tải lịch sử" }));
		throw new Error(error.message || "Không thể tải lịch sử nộp bài");
	}
	const result = await response.json();
	return result.data ?? [];
}

function formatDate(dateStr: string): string {
	return new Date(dateStr).toLocaleString("vi-VN", {
		day: "2-digit",
		month: "2-digit",
		year: "numeric",
		hour: "2-digit",
		minute: "2-digit",
	});
}

function TimelineEntry({
	entry,
	index,
	total,
}: {
	entry: SubmissionHistoryEntry;
	index: number;
	total: number;
}) {
	const isLatest = index === 0;

	return (
		<div className="relative flex gap-4">
			{/* Timeline connector */}
			<div className="flex flex-col items-center">
				<div
					className={`flex h-8 w-8 items-center justify-center rounded-full ${
						isLatest
							? "bg-blue-100 text-blue-600"
							: "bg-gray-100 text-gray-400"
					}`}
				>
					<Clock className="h-4 w-4" />
				</div>
				{index < total - 1 && (
					<div className="mt-1 w-0.5 flex-1 bg-gray-200" />
				)}
			</div>

			{/* Content */}
			<div className="flex-1 pb-6">
				<div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
					<div className="flex flex-wrap items-center gap-2">
						<span className="text-sm font-semibold text-gray-900">
							Lần nộp #{total - index}
						</span>
						{isLatest && (
							<span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
								Mới nhất
							</span>
						)}
						<span className="text-xs text-gray-500">
							{formatDate(entry.submitted_at)}
						</span>
					</div>

					{/* Content preview */}
					{entry.content && (
						<p className="mt-2 line-clamp-3 text-sm text-gray-600">
							{entry.content}
						</p>
					)}

					{/* Score & Feedback */}
					<div className="mt-3 flex flex-wrap gap-3">
						{entry.score !== null && (
							<div className="inline-flex items-center gap-1 rounded-lg bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">
								<Star className="h-3.5 w-3.5" />
								{entry.score} điểm
							</div>
						)}
						{entry.feedback && (
							<div className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
								<MessageSquare className="h-3.5 w-3.5" />
								Có nhận xét
							</div>
						)}
					</div>

					{/* Feedback content */}
					{entry.feedback && (
						<div className="mt-3 rounded-lg bg-gray-50 p-3 text-sm text-gray-700">
							<p className="mb-1 text-xs font-semibold text-gray-500">
								Nhận xét của giáo viên:
							</p>
							{entry.feedback}
						</div>
					)}
				</div>
			</div>
		</div>
	);
}

export default function SubmissionHistory({
	assignmentId,
	resubmitCount,
}: {
	assignmentId: string;
	resubmitCount: number;
}) {
	const [entries, setEntries] = useState<SubmissionHistoryEntry[]>([]);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState("");
	const [expanded, setExpanded] = useState(false);

	const load = useCallback(async () => {
		setLoading(true);
		setError("");
		try {
			const data = await fetchSubmissionHistory(assignmentId);
			setEntries(data);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Không thể tải lịch sử");
		} finally {
			setLoading(false);
		}
	}, [assignmentId]);

	useEffect(() => {
		if (!(expanded && entries.length === 0)) return;
		let active = true;
		// Defer to a microtask so the loading state update does not run synchronously
		// inside the effect (react-hooks/set-state-in-effect).
		Promise.resolve().then(() => {
			if (active) void load();
		});
		return () => {
			active = false;
		};
	}, [expanded, entries.length, load]);

	// Don't render if no resubmissions
	if (resubmitCount <= 0) return null;

	return (
		<section data-testid="submission-history" className="space-y-3">
			<button
				type="button"
				onClick={() => setExpanded((prev) => !prev)}
				className="inline-flex items-center gap-2 rounded-lg bg-gray-100 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-200"
			>
				<Clock className="h-4 w-4" />
				Lịch sử nộp bài ({resubmitCount} lần nộp lại)
				<span className="text-xs text-gray-500">
					{expanded ? "▲" : "▼"}
				</span>
			</button>

			{expanded && (
				<div className="mt-3">
					{loading ? (
						<div className="flex justify-center py-8">
							<Loader2 className="h-6 w-6 animate-spin text-blue-600" />
						</div>
					) : error ? (
						<div
							role="alert"
							className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700"
						>
							{error}
						</div>
					) : entries.length === 0 ? (
						<div className="rounded-xl border border-dashed border-gray-200 p-6 text-center text-sm text-gray-500">
							Chưa có lịch sử nộp bài.
						</div>
					) : (
						<div className="space-y-0">
							{entries.map((entry, index) => (
								<TimelineEntry
									key={entry.id}
									entry={entry}
									index={index}
									total={entries.length}
								/>
							))}
						</div>
					)}
				</div>
			)}
		</section>
	);
}
