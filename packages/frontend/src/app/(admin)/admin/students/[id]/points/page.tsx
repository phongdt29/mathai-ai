"use client";

import { ArrowLeft, Coins, History, PlusCircle, Trophy } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import type { FormEvent } from "react";
import { useCallback, useEffect, useState } from "react";
import {
	adminAdjustStudentPoints,
	adminGetStudentPoints,
	type StudentPointHistoryResult,
} from "@/lib/api";
import { adminPointHistoryDetails } from "./point-history-details";

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

export default function AdminStudentPointsPage() {
	const params = useParams<{ id: string }>();
	const studentId = params.id;
	const [data, setData] = useState<StudentPointHistoryResult | null>(null);
	const [loading, setLoading] = useState(true);
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [formError, setFormError] = useState<string | null>(null);
	const [successMessage, setSuccessMessage] = useState<string | null>(null);
	const [rewardPoints, setRewardPoints] = useState("");
	const [reason, setReason] = useState("");
	const [note, setNote] = useState("");

	const loadPoints = useCallback(async () => {
		if (!studentId) {
			setError("Thiếu ID học sinh.");
			setLoading(false);
			return;
		}
		setLoading(true);
		try {
			const result = await adminGetStudentPoints(studentId);
			setData(result);
			setError(null);
		} catch (err) {
			setError(
				err instanceof Error ? err.message : "Không thể tải điểm học sinh",
			);
		} finally {
			setLoading(false);
		}
	}, [studentId]);

	useEffect(() => {
		let isActive = true;

		queueMicrotask(() => {
			if (isActive) {
				void loadPoints();
			}
		});

		return () => {
			isActive = false;
		};
	}, [loadPoints]);

	async function handleSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setFormError(null);
		setSuccessMessage(null);
		if (!studentId) {
			setFormError("Thiếu ID học sinh.");
			return;
		}
		const parsedRewardPoints = Number(rewardPoints);
		if (!Number.isFinite(parsedRewardPoints) || parsedRewardPoints === 0) {
			setFormError("Điểm điều chỉnh phải là số khác 0.");
			return;
		}
		if (!reason.trim()) {
			setFormError("Vui lòng nhập lý do điều chỉnh.");
			return;
		}

		setSubmitting(true);
		try {
			await adminAdjustStudentPoints(studentId, {
				reward_points: parsedRewardPoints,
				reason: reason.trim(),
				note: note.trim() || undefined,
			});
			setRewardPoints("");
			setReason("");
			setNote("");
			setSuccessMessage("Đã ghi nhận điều chỉnh điểm thưởng.");
			await loadPoints();
		} catch (err) {
			setFormError(
				err instanceof Error ? err.message : "Không thể điều chỉnh điểm",
			);
		} finally {
			setSubmitting(false);
		}
	}

	const summary = data?.summary;
	const history = data?.history ?? [];

	return (
		<div className="space-y-6">
			<Link
				href="/admin/classes"
				className="inline-flex items-center gap-1 text-sm font-medium text-blue-600 hover:underline"
			>
				<ArrowLeft className="h-4 w-4" aria-hidden="true" />
				Quay lại quản lý lớp
			</Link>

			<header className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
				<div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
					<div>
						<p className="text-sm font-semibold uppercase tracking-wide text-slate-500">
							Admin
						</p>
						<h1 className="mt-1 text-2xl font-bold text-gray-900">
							Điểm thưởng học sinh
						</h1>
						<p className="mt-2 text-sm text-gray-500">
							Xem ledger điểm và thêm điều chỉnh thủ công cho học sinh ID:{" "}
							{studentId}
						</p>
					</div>
					<div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-amber-700">
						<div className="flex items-center gap-2 text-sm font-semibold">
							<Coins className="h-5 w-5" aria-hidden="true" />
							Điểm thưởng hiện tại
						</div>
						<p className="mt-2 text-3xl font-extrabold">
							{formatNumber(summary?.reward_points)}
						</p>
					</div>
				</div>
			</header>

			{loading ? (
				<section
					aria-label="Đang tải điểm học sinh"
					className="grid gap-4 md:grid-cols-3"
				>
					{[0, 1, 2].map((item) => (
						<div
							key={item}
							className="h-28 animate-pulse rounded-2xl bg-gray-100"
						/>
					))}
				</section>
			) : error ? (
				<section
					className="rounded-2xl border border-red-200 bg-red-50 p-6"
					aria-live="polite"
				>
					<h2 className="text-lg font-semibold text-red-700">
						Không thể tải điểm
					</h2>
					<p className="mt-2 text-sm text-red-600">{error}</p>
				</section>
			) : (
				<>
					<section
						aria-label="Tổng quan điểm học sinh"
						className="grid gap-4 md:grid-cols-3"
					>
						<SummaryTile
							label="Điểm học tập"
							value={`${formatNumber(summary?.total_earned_points)}/${formatNumber(summary?.total_available_points)}`}
						/>
						<SummaryTile
							label="Trung bình"
							value={`${formatNumber(summary?.academic_percentage)}%`}
						/>
						<SummaryTile
							label="Năng lực"
							value={`${formatNumber(summary?.competency_score)}%`}
						/>
					</section>

					<section className="grid gap-6 lg:grid-cols-[0.9fr_1.3fr]">
						<form
							onSubmit={handleSubmit}
							className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"
						>
							<h2 className="flex items-center gap-2 text-lg font-bold text-gray-900">
								<PlusCircle
									className="h-5 w-5 text-blue-600"
									aria-hidden="true"
								/>
								Điều chỉnh thủ công
							</h2>
							<p className="mt-1 text-sm text-gray-500">
								Nhập số dương để cộng điểm hoặc số âm để trừ điểm.
							</p>

							<div className="mt-5 space-y-4">
								<label className="block">
									<span className="text-sm font-medium text-gray-700">
										Điểm thưởng *
									</span>
									<input
										type="number"
										step="0.5"
										value={rewardPoints}
										onChange={(event) => setRewardPoints(event.target.value)}
										className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
										placeholder="Ví dụ: 5 hoặc -3"
										required
									/>
								</label>
								<label className="block">
									<span className="text-sm font-medium text-gray-700">
										Lý do *
									</span>
									<input
										value={reason}
										onChange={(event) => setReason(event.target.value)}
										className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
										placeholder="Ví dụ: Sửa điểm bị cộng trùng"
										required
									/>
								</label>
								<label className="block">
									<span className="text-sm font-medium text-gray-700">
										Ghi chú
									</span>
									<textarea
										value={note}
										onChange={(event) => setNote(event.target.value)}
										className="mt-1 min-h-24 w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
										placeholder="Thông tin audit bổ sung (nếu có)"
									/>
								</label>
							</div>

							{formError && (
								<p
									className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600"
									role="alert"
								>
									{formError}
								</p>
							)}
							{successMessage && (
								<p
									className="mt-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700"
									role="status"
								>
									{successMessage}
								</p>
							)}

							<button
								type="submit"
								disabled={submitting}
								className="mt-5 inline-flex w-full items-center justify-center rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
							>
								{submitting ? "Đang lưu..." : "Lưu điều chỉnh"}
							</button>
						</form>

						<section
							className="rounded-2xl border border-gray-200 bg-white shadow-sm"
							aria-label="Lịch sử điểm học sinh"
						>
							<div className="flex items-center gap-2 border-b border-gray-100 p-5">
								<History
									className="h-5 w-5 text-slate-600"
									aria-hidden="true"
								/>
								<h2 className="text-lg font-bold text-gray-900">
									Lịch sử điểm
								</h2>
							</div>
							{history.length === 0 ? (
								<p className="p-8 text-center text-sm text-gray-500">
									Học sinh chưa có lịch sử điểm.
								</p>
							) : (
								<div className="overflow-x-auto">
									<table className="w-full text-sm">
										<thead>
											<tr className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
												<th className="px-4 py-3">Ngày</th>
												<th className="px-4 py-3">Nguồn</th>
												<th className="px-4 py-3">Lý do</th>
												<th className="px-4 py-3">Ghi chú</th>
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
													<td className="max-w-xs px-4 py-3 text-gray-600">
														{adminPointHistoryDetails(entry)}
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
					</section>
				</>
			)}
		</div>
	);
}

function SummaryTile({ label, value }: { label: string; value: string }) {
	return (
		<div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
			<div className="flex items-center justify-between">
				<p className="text-sm font-semibold text-gray-500">{label}</p>
				<Trophy className="h-5 w-5 text-blue-600" aria-hidden="true" />
			</div>
			<p className="mt-4 text-2xl font-extrabold text-gray-900">{value}</p>
		</div>
	);
}
