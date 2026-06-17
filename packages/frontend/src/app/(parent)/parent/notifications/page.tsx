"use client";

import { useEffect, useMemo, useState } from "react";
import {
	getParentNotifications,
	markAllParentNotificationsRead,
	markParentNotificationRead,
	type ParentNotification,
	type ParentNotificationType,
	type NotificationSeverity,
} from "@/lib/api";

/* ─── Helpers ─── */

const NOTIFICATION_TYPE_LABELS: Record<ParentNotificationType, string> = {
	session_start: "Bắt đầu phiên",
	session_complete: "Hoàn thành phiên",
	absent: "Vắng mặt",
	daily_summary: "Tóm tắt ngày",
	weekly_summary: "Tóm tắt tuần",
	risk_alert: "Cảnh báo rủi ro",
	achievement: "Thành tích",
	quiz_result: "Kết quả quiz",
	streak_milestone: "Chuỗi ngày",
	intervention_suggestion: "Gợi ý can thiệp",
};

const SEVERITY_LABELS: Record<NotificationSeverity, string> = {
	info: "Thông tin",
	warning: "Cảnh báo",
	critical: "Nghiêm trọng",
};

const SEVERITY_STYLES: Record<NotificationSeverity, string> = {
	info: "bg-blue-50 text-blue-700 ring-blue-200",
	warning: "bg-amber-50 text-amber-700 ring-amber-200",
	critical: "bg-red-50 text-red-700 ring-red-200",
};

const SEVERITY_DRAWER_STYLES: Record<NotificationSeverity, string> = {
	info: "border-blue-200 bg-blue-50",
	warning: "border-amber-200 bg-amber-50",
	critical: "border-red-200 bg-red-50",
};

function iconForNotification(notification: ParentNotification): string {
	if (notification.severity === "critical") return "🚨";
	if (notification.severity === "warning") return "⚠️";
	if (notification.type === "session_complete") return "✅";
	if (notification.type === "session_start") return "📚";
	if (notification.type === "achievement") return "🏆";
	if (notification.type === "quiz_result") return "📝";
	if (notification.type === "streak_milestone") return "🔥";
	if (notification.type === "absent") return "🚫";
	return "🔔";
}

function formatTime(value?: string | null): string {
	if (!value) return "Không rõ thời gian";
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return value;
	return date.toLocaleString("vi-VN");
}

type ReadFilter = "all" | "unread" | "read";

/* ─── Detail Drawer ─── */

function NotificationDetailDrawer({
	notification,
	onClose,
}: {
	notification: ParentNotification;
	onClose: () => void;
}) {
	return (
		<>
			{/* Backdrop */}
			<div
				className="fixed inset-0 z-40 bg-black/30 transition-opacity"
				onClick={onClose}
				onKeyDown={(e) => e.key === "Escape" && onClose()}
				role="button"
				tabIndex={0}
				aria-label="Đóng chi tiết"
			/>
			{/* Drawer */}
			<aside className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col bg-white shadow-xl">
				{/* Header */}
				<div className={`flex items-center justify-between border-b p-5 ${SEVERITY_DRAWER_STYLES[notification.severity]}`}>
					<div className="flex items-center gap-3">
						<span className="text-2xl">{iconForNotification(notification)}</span>
						<div>
							<span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ${SEVERITY_STYLES[notification.severity]}`}>
								{SEVERITY_LABELS[notification.severity]}
							</span>
							<span className="ml-2 text-xs text-gray-500">
								{NOTIFICATION_TYPE_LABELS[notification.type]}
							</span>
						</div>
					</div>
					<button
						type="button"
						onClick={onClose}
						className="rounded-lg p-2 text-gray-500 hover:bg-gray-100"
						aria-label="Đóng"
					>
						✕
					</button>
				</div>

				{/* Body */}
				<div className="flex-1 overflow-y-auto p-5 space-y-5">
					<h2 className="text-lg font-bold text-gray-900">{notification.title}</h2>

					{notification.content && (
						<p className="whitespace-pre-line text-sm text-gray-700">{notification.content}</p>
					)}

					<div className="text-xs text-gray-400">
						{formatTime(notification.created_at ?? notification.createdAt)}
					</div>

					{notification.is_read && notification.read_at && (
						<div className="text-xs text-green-600">
							✓ Đã đọc lúc {formatTime(notification.read_at)}
						</div>
					)}

					{/* Payload section */}
					{notification.payload && Object.keys(notification.payload).length > 0 && (
						<div className="space-y-2">
							<h3 className="text-sm font-semibold text-gray-700">Chi tiết dữ liệu</h3>
							<div className="rounded-xl bg-gray-50 p-4 text-xs text-gray-600 overflow-x-auto">
								<dl className="space-y-2">
									{Object.entries(notification.payload).map(([key, value]) => (
										<div key={key} className="flex gap-2">
											<dt className="font-medium text-gray-500 min-w-[100px]">{key}:</dt>
											<dd className="text-gray-800 break-all">
												{typeof value === "object" ? JSON.stringify(value) : String(value ?? "—")}
											</dd>
										</div>
									))}
								</dl>
							</div>
						</div>
					)}
				</div>
			</aside>
		</>
	);
}

/* ─── Main Page ─── */

export default function NotificationsPage() {
	const [notifications, setNotifications] = useState<ParentNotification[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [actionError, setActionError] = useState<string | null>(null);
	const [updatingId, setUpdatingId] = useState<string | null>(null);

	// Filters
	const [filterType, setFilterType] = useState<ParentNotificationType | "all">("all");
	const [filterSeverity, setFilterSeverity] = useState<NotificationSeverity | "all">("all");
	const [filterRead, setFilterRead] = useState<ReadFilter>("all");

	// Detail drawer
	const [selectedNotification, setSelectedNotification] = useState<ParentNotification | null>(null);

	async function loadNotifications() {
		try {
			setLoading(true);
			setError(null);
			setNotifications(await getParentNotifications(50));
		} catch (loadError) {
			setError(loadError instanceof Error ? loadError.message : "Không tải được thông báo");
			setNotifications([]);
		} finally {
			setLoading(false);
		}
	}

	useEffect(() => {
		void Promise.resolve().then(loadNotifications);
	}, []);

	const filteredNotifications = useMemo(() => {
		return notifications.filter((n) => {
			if (filterType !== "all" && n.type !== filterType) return false;
			if (filterSeverity !== "all" && n.severity !== filterSeverity) return false;
			if (filterRead === "unread" && n.is_read) return false;
			if (filterRead === "read" && !n.is_read) return false;
			return true;
		});
	}, [notifications, filterType, filterSeverity, filterRead]);

	const unreadCount = useMemo(() => notifications.filter((item) => !item.is_read).length, [notifications]);

	async function handleMarkRead(notification: ParentNotification) {
		const id = notification.id ?? notification._id;
		if (!id || notification.is_read) return;
		try {
			setActionError(null);
			setUpdatingId(id);
			await markParentNotificationRead(id);
			const now = new Date().toISOString();
			setNotifications((current) =>
				current.map((item) =>
					(item.id ?? item._id) === id ? { ...item, is_read: true, read_at: now } : item,
				),
			);
		} catch (markError) {
			setActionError(markError instanceof Error ? markError.message : "Không đánh dấu đã đọc được");
		} finally {
			setUpdatingId(null);
		}
	}

	async function handleMarkAllRead() {
		try {
			setActionError(null);
			setUpdatingId("all");
			await markAllParentNotificationsRead();
			const now = new Date().toISOString();
			setNotifications((current) =>
				current.map((item) => ({ ...item, is_read: true, read_at: item.read_at ?? now })),
			);
		} catch (markError) {
			setActionError(markError instanceof Error ? markError.message : "Không đánh dấu tất cả đã đọc được");
		} finally {
			setUpdatingId(null);
		}
	}

	function handleNotificationClick(notification: ParentNotification) {
		setSelectedNotification(notification);
		// Also mark as read if unread
		if (!notification.is_read) {
			void handleMarkRead(notification);
		}
	}

	if (loading) {
		return (
			<div className="rounded-2xl bg-white p-8 text-center shadow-sm ring-1 ring-gray-100">
				<div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent" />
				<p className="text-sm text-gray-500">Đang tải thông báo...</p>
			</div>
		);
	}

	return (
		<div className="space-y-6">
			{/* Header */}
			<div className="flex items-start justify-between gap-4">
				<div>
					<h1 className="text-2xl font-bold text-gray-900">Thông báo 🔔</h1>
					<p className="text-gray-500">Quản lý thông báo từ hệ thống MathAI.</p>
				</div>
				<button
					type="button"
					onClick={handleMarkAllRead}
					disabled={unreadCount === 0 || updatingId === "all"}
					className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-gray-300"
				>
					Đánh dấu tất cả đã đọc ({unreadCount})
				</button>
			</div>

			{/* Filters */}
			<div className="flex flex-wrap items-center gap-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-100">
				<div className="flex items-center gap-2">
					<label htmlFor="filter-type" className="text-xs font-medium text-gray-500">Loại:</label>
					<select
						id="filter-type"
						value={filterType}
						onChange={(e) => setFilterType(e.target.value as ParentNotificationType | "all")}
						className="rounded-lg border border-gray-200 px-2 py-1.5 text-sm text-gray-700 focus:border-indigo-300 focus:ring-1 focus:ring-indigo-200"
					>
						<option value="all">Tất cả</option>
						{Object.entries(NOTIFICATION_TYPE_LABELS).map(([key, label]) => (
							<option key={key} value={key}>{label}</option>
						))}
					</select>
				</div>

				<div className="flex items-center gap-2">
					<label htmlFor="filter-severity" className="text-xs font-medium text-gray-500">Mức độ:</label>
					<select
						id="filter-severity"
						value={filterSeverity}
						onChange={(e) => setFilterSeverity(e.target.value as NotificationSeverity | "all")}
						className="rounded-lg border border-gray-200 px-2 py-1.5 text-sm text-gray-700 focus:border-indigo-300 focus:ring-1 focus:ring-indigo-200"
					>
						<option value="all">Tất cả</option>
						{Object.entries(SEVERITY_LABELS).map(([key, label]) => (
							<option key={key} value={key}>{label}</option>
						))}
					</select>
				</div>

				<div className="flex items-center gap-2">
					<label htmlFor="filter-read" className="text-xs font-medium text-gray-500">Trạng thái:</label>
					<select
						id="filter-read"
						value={filterRead}
						onChange={(e) => setFilterRead(e.target.value as ReadFilter)}
						className="rounded-lg border border-gray-200 px-2 py-1.5 text-sm text-gray-700 focus:border-indigo-300 focus:ring-1 focus:ring-indigo-200"
					>
						<option value="all">Tất cả</option>
						<option value="unread">Chưa đọc</option>
						<option value="read">Đã đọc</option>
					</select>
				</div>

				{(filterType !== "all" || filterSeverity !== "all" || filterRead !== "all") && (
					<button
						type="button"
						onClick={() => { setFilterType("all"); setFilterSeverity("all"); setFilterRead("all"); }}
						className="ml-auto text-xs font-medium text-indigo-600 hover:text-indigo-500"
					>
						Xoá bộ lọc
					</button>
				)}
			</div>

			{/* Errors */}
			{error && <div className="rounded-2xl border border-red-100 bg-red-50 p-5 text-sm text-red-700">{error}</div>}
			{actionError && <div className="rounded-2xl border border-amber-100 bg-amber-50 p-4 text-sm text-amber-700">{actionError}</div>}

			{/* Empty state */}
			{!error && filteredNotifications.length === 0 && (
				<div className="rounded-2xl bg-white p-8 text-center shadow-sm ring-1 ring-gray-100">
					<div className="text-4xl">📭</div>
					<h2 className="mt-3 text-lg font-bold text-gray-900">
						{notifications.length === 0 ? "Chưa có thông báo" : "Không có thông báo phù hợp bộ lọc"}
					</h2>
					<p className="mt-2 text-sm text-gray-500">
						{notifications.length === 0
							? "Thông báo sẽ xuất hiện khi có sự kiện từ hệ thống."
							: "Thử thay đổi bộ lọc để xem thêm thông báo."}
					</p>
				</div>
			)}

			{/* Notification list */}
			{filteredNotifications.length > 0 && (
				<div className="rounded-2xl bg-white shadow-sm ring-1 ring-gray-100">
					<div className="divide-y divide-gray-50">
						{filteredNotifications.map((notification) => {
							const id = notification.id ?? notification._id ?? `${notification.title}-${notification.created_at}`;
							return (
								<button
									key={id}
									type="button"
									onClick={() => handleNotificationClick(notification)}
									className={`flex w-full items-start gap-4 p-5 text-left transition hover:bg-gray-50 ${!notification.is_read ? "bg-indigo-50/50" : ""}`}
								>
									<span className="text-2xl">{iconForNotification(notification)}</span>
									<div className="flex-1 min-w-0">
										<div className="flex items-center gap-2">
											<span className={`font-medium truncate ${!notification.is_read ? "text-gray-900" : "text-gray-600"}`}>
												{notification.title}
											</span>
											<span className={`inline-flex shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ${SEVERITY_STYLES[notification.severity]}`}>
												{SEVERITY_LABELS[notification.severity]}
											</span>
										</div>
										{notification.content && (
											<div className="mt-1 truncate text-sm text-gray-500">{notification.content}</div>
										)}
										<div className="mt-2 flex items-center gap-3 text-xs text-gray-400">
											<span>{formatTime(notification.created_at ?? notification.createdAt)}</span>
											<span className="rounded bg-gray-100 px-1.5 py-0.5 text-gray-500">
												{NOTIFICATION_TYPE_LABELS[notification.type]}
											</span>
										</div>
									</div>
									{!notification.is_read && (
										<span className="mt-2 h-2.5 w-2.5 shrink-0 rounded-full bg-indigo-500" title="Chưa đọc" />
									)}
								</button>
							);
						})}
					</div>
				</div>
			)}

			{/* Detail Drawer */}
			{selectedNotification && (
				<NotificationDetailDrawer
					notification={selectedNotification}
					onClose={() => setSelectedNotification(null)}
				/>
			)}
		</div>
	);
}
