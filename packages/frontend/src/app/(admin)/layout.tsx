"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import {
	AdminFlatIcon,
	type AdminFlatIconName,
} from "./components/AdminFlatIcon";
import { canAccessPath } from "./admin/users/access";

/**
 * Paths explicitly denied to staff role in the sidebar navigation.
 */
const staffDeniedAdminHrefs = new Set([
	"/admin/settings",
	"/admin/tutors",
	"/admin/proposals",
	"/admin/ai-logs",
	"/admin/ai-providers",
	"/admin/audit",
	"/admin/billing",
]);

/**
 * Paths allowed for staff role — all nav items except denied ones.
 */
const staffAllowedAdminHrefs = new Set([
	"/admin",
	"/admin/activity",
	"/admin/users",
	"/admin/teachers",
	"/admin/classes",
	"/admin/content",
	"/admin/content-library",
	"/admin/assignments",
	"/admin/ai-governance",
	"/admin/scheduler",
	"/admin/risk-review",
	"/admin/notifications",
	"/admin/reports",
]);

const navGroups: {
	label: string;
	items: { href: string; label: string; icon: AdminFlatIconName }[];
}[] = [
	{
		label: "Tổng quan",
		items: [
			{ href: "/admin", label: "Tổng quan", icon: "overview" },
			{ href: "/admin/activity", label: "Hoạt động", icon: "activity" },
		],
	},
	{
		label: "Quản lý",
		items: [
			{ href: "/admin/users", label: "Người dùng", icon: "users" },
			{ href: "/admin/teachers", label: "Giáo viên", icon: "teacher" },
			{ href: "/admin/classes", label: "Lớp học", icon: "classes" },
			{ href: "/admin/proposals", label: "Đề xuất", icon: "proposals" },
			{ href: "/admin/content", label: "Nội dung", icon: "content" },
			{
				href: "/admin/content-library",
				label: "Thư viện AI",
				icon: "contentLibrary",
			},
			{ href: "/admin/assignments", label: "Kiểm tra", icon: "assignments" },
			{ href: "/admin/tutors", label: "Trợ lý AI", icon: "tutors" },
		],
	},
	{
		label: "AI & Hệ thống",
		items: [
			{ href: "/admin/ai-providers", label: "Cung cấp AI", icon: "aiProviders" },
			{ href: "/admin/ai-governance", label: "Quản trị AI", icon: "aiGovernance" },
			{ href: "/admin/ai-logs", label: "Nhật ký AI", icon: "aiLogs" },
			{ href: "/admin/scheduler", label: "Lập lịch", icon: "scheduler" },
			{
				href: "/admin/risk-review",
				label: "Xem xét rủi ro",
				icon: "riskReview",
			},
			{
				href: "/admin/notifications",
				label: "Thông báo",
				icon: "notifications",
			},
		],
	},
	{
		label: "Phân tích & Tài chính",
		items: [
			{ href: "/admin/reports", label: "Báo cáo", icon: "reports" },
			{ href: "/admin/audit", label: "Nhật ký kiểm toán", icon: "audit" },
			{ href: "/admin/billing", label: "Thanh toán", icon: "billing" },
		],
	},
	{
		label: "Hệ thống",
		items: [{ href: "/admin/settings", label: "Cài đặt", icon: "settings" }],
	},
];

export default function AdminLayout({ children }: { children: ReactNode }) {
	const { user, loading, logout } = useAuth(["admin", "staff"]);
	const [collapsed, setCollapsed] = useState(false);
	const [mobileOpen, setMobileOpen] = useState(false);
	const pathname = usePathname();

	if (loading) {
		return (
			<div className="flex min-h-screen items-center justify-center bg-gray-100">
				<div className="text-center">
					<div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-800 border-t-transparent mx-auto mb-3" />
					<p className="text-sm text-gray-500">Đang tải...</p>
				</div>
			</div>
		);
	}

	if (!user) return null;

	return (
		<div className="flex min-h-screen bg-gray-100">
			{mobileOpen && (
				<div
					className="fixed inset-0 z-40 bg-black/50 lg:hidden"
					onClick={() => setMobileOpen(false)}
				/>
			)}

			{/* Dark sidebar */}
			<aside
				className={`fixed inset-y-0 left-0 z-50 flex flex-col bg-slate-900 text-white transition-all duration-300 ${collapsed ? "w-[68px]" : "w-[250px]"} ${mobileOpen ? "translate-x-0" : "-translate-x-full"} lg:translate-x-0`}
			>
				<div className="flex h-16 items-center justify-between border-b border-slate-700 px-4">
					{!collapsed && (
						<div className="flex items-center gap-2">
							<AdminFlatIcon name="brand" size={32} />
							<span className="font-extrabold text-lg">
								{user?.role === "staff" ? "Staff" : "Admin"}
							</span>
						</div>
					)}
					{collapsed && <AdminFlatIcon name="brand" size={32} className="mx-auto" />}
					<button
						onClick={() => setCollapsed(!collapsed)}
						className="hidden lg:flex h-8 w-8 items-center justify-center rounded-lg hover:bg-slate-700 text-slate-400"
						aria-label={collapsed ? "Mở rộng thanh điều hướng" : "Thu gọn thanh điều hướng"}
					>
						<AdminFlatIcon name={collapsed ? "expand" : "collapse"} size={24} />
					</button>
				</div>

				<nav className="flex-1 overflow-y-auto p-3 space-y-4">
					{navGroups.map((group) => {
						const visibleItems =
							user?.role !== "staff"
								? group.items
								: group.items.filter((item) =>
										staffAllowedAdminHrefs.has(item.href),
									);
						if (visibleItems.length === 0) return null;
						return (
							<div key={group.label}>
								{!collapsed && (
									<div className="px-3 mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
										{group.label}
									</div>
								)}
								<div className="space-y-1">
									{visibleItems.map((item) => {
										const isActive =
											pathname === item.href ||
											(item.href !== "/admin" && pathname.startsWith(item.href));
										return (
											<Link
												key={item.href}
												href={item.href}
												onClick={() => setMobileOpen(false)}
										className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition ${
											isActive
												? "bg-slate-700 text-white font-medium"
												: "text-slate-300 hover:bg-slate-800 hover:text-white"
										}`}
									>
										<AdminFlatIcon
											name={item.icon}
											size={28}
											className="shrink-0"
										/>
										{!collapsed && <span>{item.label}</span>}
									</Link>
										);
									})}
								</div>
							</div>
						);
					})}
				</nav>

				<div className="border-t border-slate-700 p-3">
					<button
						onClick={logout}
						className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-red-400 transition hover:bg-slate-800 w-full"
					>
						<AdminFlatIcon name="logout" size={28} className="shrink-0" />
						{!collapsed && <span>Đăng xuất</span>}
					</button>
				</div>
			</aside>

			<div
				className={`flex-1 transition-all duration-300 ${collapsed ? "lg:pl-[68px]" : "lg:pl-[250px]"}`}
			>
					<header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-gray-200 bg-white/80 backdrop-blur-xl px-6">
					<button
						onClick={() => setMobileOpen(true)}
						className="lg:hidden h-10 w-10 flex items-center justify-center rounded-xl hover:bg-gray-100"
						aria-label="Mở menu điều hướng"
					>
						<AdminFlatIcon name="menu" size={30} />
					</button>
					<div className="text-sm font-medium text-gray-700">
						{user?.role === "staff" ? "Bảng nhân viên" : "Bảng quản trị"}
					</div>
					<div className="flex items-center gap-3">
						<div className="h-8 w-8 rounded-full bg-slate-800 flex items-center justify-center text-white text-sm font-bold">
							{user?.role === "staff" ? "S" : "A"}
						</div>
					</div>
				</header>
				<main className="p-6">{children}</main>
			</div>
		</div>
	);
}
