"use client";

import {
	Bell,
	BookOpen,
	Bot,
	Calculator,
	ClipboardList,
	Coins,
	CreditCard,
	Flame,
	Hand,
	Home,
	Star,
	Target,
	TrendingUp,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import {
	type AgeGroup,
	AgeThemeProvider,
	useAgeTheme,
} from "@/contexts/AgeThemeContext";
import { type AuthUser, useAuth } from "@/hooks/useAuth";
import { getDashboardPointSummary, getDashboardStats, type DashboardStats } from "@/lib/api";

const navItems = [
	{ href: "/dashboard", label: "Tổng quan", icon: Home },
	{ href: "/dashboard/lessons", label: "Bài học", icon: BookOpen },
	{ href: "/dashboard/assignments", label: "Bài tập", icon: ClipboardList },
	{ href: "/dashboard/assessment", label: "Đánh giá", icon: Target },
	{ href: "/dashboard/solver", label: "Giải toán", icon: Calculator },
	{ href: "/dashboard/chat", label: "Trợ lý AI", icon: Bot },
	{ href: "/dashboard/progress", label: "Tiến độ", icon: TrendingUp },
	{ href: "/dashboard/points", label: "Điểm thưởng", icon: Coins },
	{ href: "/dashboard/billing", label: "Gói & Thanh toán", icon: CreditCard },
];

function GradeBadge({ collapsed = false }: { collapsed?: boolean }) {
	const { grade, ageGroup } = useAgeTheme();
	const labels: Record<AgeGroup, string> = {
		elementary: "Tiểu học",
		middle: "THCS",
		high: "THPT",
	};

	if (collapsed) {
		return (
			<div
				className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/20 bg-white/12 text-sm font-bold text-yellow-200"
				title={`Lớp ${grade} ${labels[ageGroup]}`}
			>
				{grade}
			</div>
		);
	}

	return (
		<div className="flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-white/25 bg-white/15 px-3 py-1.5">
			<span className="text-sm font-bold text-white">Lớp {grade}</span>
			<span className="text-xs font-semibold text-yellow-200">
				{labels[ageGroup]}
			</span>
		</div>
	);
}

function userInitial(name: string): string {
	const trimmed = name.trim();
	if (!trimmed) return "?";
	return trimmed.charAt(0).toUpperCase();
}

function DashboardShell({
	children,
	user,
}: {
	children: ReactNode;
	user: AuthUser;
}) {
	const { theme, ageGroup } = useAgeTheme();
	const [collapsed, setCollapsed] = useState(false);
	const [mobileOpen, setMobileOpen] = useState(false);
	const [rewardPoints, setRewardPoints] = useState(0);
	const [dashboardData, setDashboardData] = useState<DashboardStats>({
		total_lessons: 0,
		completed_lessons: 0,
		completion_percentage: 0,
		average_quiz_score: null,
		total_study_time_minutes: 0,
		current_streak_days: 0,
		longest_streak_days: 0,
	});
	const pathname = usePathname();
	const [mounted, setMounted] = useState(false);

	useEffect(() => {
		let isActive = true;

		queueMicrotask(() => {
			if (isActive) {
				setMounted(true);
			}
		});

		return () => {
			isActive = false;
		};
	}, []);

	useEffect(() => {
		let isActive = true;

		queueMicrotask(() => {
			if (!isActive) return;

			Promise.all([
				getDashboardPointSummary(),
				getDashboardStats(),
			])
				.then(([points, stats]) => {
					if (isActive) {
						setRewardPoints(points.reward_points);
						setDashboardData(stats);
					}
				})
				.catch(() => {
					if (isActive) {
						setRewardPoints(0);
					}
				});
		});

		return () => {
			isActive = false;
		};
	}, []);

	const xp = rewardPoints;
	const level = Math.max(1, Math.floor(rewardPoints / 200) + 1);
	const xpForNextLevel = level * 200;
	const xpProgress = xpForNextLevel > 0 ? Math.min((xp / xpForNextLevel) * 100, 100) : 0;

	const isElementary = ageGroup === "elementary";

	return (
		<div className="flex min-h-screen overflow-x-hidden bg-[#f6fbff] text-slate-900">
			{mobileOpen && (
				<div
					className="fixed inset-0 z-40 bg-black/40 lg:hidden"
					onClick={() => setMobileOpen(false)}
				/>
			)}

			<aside
				className={`fixed inset-y-0 left-0 z-50 flex flex-col bg-[#1954aa] text-white shadow-2xl transition-all duration-300 ${collapsed ? "w-[76px]" : "w-[264px]"} ${mobileOpen ? "translate-x-0" : "-translate-x-full"} lg:translate-x-0`}
			>
				<div className="flex h-20 items-center justify-between px-4 border-b border-white/10">
					{!collapsed && (
						<Link href="/dashboard" className="flex items-center gap-2.5 group">
							<div className="relative rounded-2xl bg-white/15 p-2 shadow-inner">
								<Calculator
									className={`${isElementary ? "w-9 h-9" : "w-8 h-8"} text-yellow-300`}
								/>
								<div className="absolute -top-1 -right-1 w-3 h-3 bg-emerald-300 rounded-full border-2 border-white" />
							</div>
							<div>
								<span className={`block text-2xl leading-none ${theme.fontWeight} text-white`}>
									MathAI
								</span>
								<span className="text-[11px] font-extrabold uppercase tracking-wide text-yellow-200">
									Học toán thông minh
								</span>
							</div>
						</Link>
					)}
					{collapsed && (
						<Link href="/dashboard" className="mx-auto rounded-2xl bg-white/15 p-2">
							<Calculator className="w-8 h-8 text-yellow-300" />
						</Link>
					)}
					<button
						onClick={() => setCollapsed(!collapsed)}
						className="hidden lg:flex h-8 w-8 items-center justify-center rounded-xl text-white/60 transition-colors hover:bg-white/15 hover:text-white"
						aria-label={collapsed ? "Mở rộng sidebar" : "Thu gọn sidebar"}
					>
						<svg
							className={`w-4 h-4 transition-transform duration-300 ${collapsed ? "rotate-180" : ""}`}
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
						>
							<path
								strokeLinecap="round"
								strokeLinejoin="round"
								strokeWidth={2}
								d="M15 19l-7-7 7-7"
							/>
						</svg>
					</button>
				</div>

				<div className={collapsed ? "px-2 mt-2" : "mx-4 mt-3"}>
					<Link
						href="/dashboard/settings"
						onClick={() => setMobileOpen(false)}
						className={`flex items-center gap-3 rounded-2xl border border-white/20 bg-white/12 transition-colors hover:bg-white/18 ${
							collapsed ? "justify-center px-2 py-2" : "px-3 py-2.5"
						}`}
						title={user.full_name}
					>
						<div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-base font-bold text-[#1954aa] shadow-sm">
							{userInitial(user.full_name)}
						</div>
						{!collapsed && (
							<div className="min-w-0 flex-1">
								<div className="truncate text-base font-bold text-white">
									{user.full_name}
								</div>
								<div className="truncate text-sm text-blue-100">
									Cài đặt tài khoản
								</div>
							</div>
						)}
					</Link>
				</div>

				<div
					className={`${
						collapsed
							? "flex flex-col items-center gap-2 px-2 mt-2"
							: "mx-4 mt-2 flex items-center justify-center gap-2"
					}`}
				>
					<GradeBadge collapsed={collapsed} />
					<button
						type="button"
						className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white/80 transition-colors hover:bg-white/15 hover:text-white"
						aria-label="Thông báo"
					>
						<Bell className="w-5 h-5" />
						<span
							className="absolute top-1.5 right-2 h-2 w-2 rounded-full border border-[#1954aa] bg-red-400"
							aria-hidden="true"
						/>
					</button>
				</div>

				{!collapsed && (
					<div
						className={`mx-4 mt-3 ${theme.cardPadding} rounded-3xl border border-white/20 bg-white/12 shadow-inner backdrop-blur transition-all duration-500 ${mounted ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-2"}`}
					>
						<div className="flex items-center justify-between mb-1.5">
							<div className="flex items-center gap-1.5">
								<Star
									className={`${isElementary ? "w-6 h-6" : "w-5 h-5"} text-yellow-300`}
								/>
								<span
									className={`${isElementary ? "text-lg" : "text-base"} font-bold text-white`}
								>
									{"Cấp " + level}
								</span>
							</div>
							<span className="text-sm font-semibold text-blue-100">
								{xp}/{xpForNextLevel} XP
							</span>
						</div>
						<div
							className={`w-full ${theme.progressHeight} rounded-full bg-white/20 overflow-hidden`}
						>
							<div
								className="h-full rounded-full bg-gradient-to-r from-emerald-300 to-cyan-300 transition-all duration-1000 ease-out"
								style={{ width: mounted ? `${xpProgress}%` : "0%" }}
							/>
						</div>
						{isElementary && (
							<p className="text-sm text-blue-100 mt-1.5 font-medium">
								{"Còn " + (xpForNextLevel - xp) + " XP để lên cấp!"}
							</p>
						)}
					</div>
				)}
				{collapsed && (
					<div className="mx-auto mt-3 text-center">
					<span className="text-base font-bold text-yellow-200 flex items-center gap-0.5">
						<Star className="w-4 h-4" />
							{level}
						</span>
					</div>
				)}

			<nav className="flex-1 overflow-y-auto p-4 mt-2 space-y-2">
					{navItems.map((item) => {
						const isActive =
							pathname === item.href ||
							(item.href !== "/dashboard" && pathname.startsWith(item.href));
						return (
							<Link
								key={item.href}
								href={item.href}
								onClick={() => setMobileOpen(false)}
								className={`group flex items-center gap-3 rounded-2xl px-3 ${isElementary ? "py-3" : "py-2.5"} text-lg font-bold transition-all duration-200 ${
									isActive
										? "bg-white text-[#1954aa] shadow-lg"
										: "text-blue-100 hover:bg-white/12 hover:text-white"
								}`}
							>
								<item.icon
									className={`${isElementary ? "w-6 h-6" : "w-5 h-5"}`}
								/>
								{!collapsed && (
									<span className={isElementary ? "text-xl" : ""}>
										{item.label}
									</span>
								)}
								{isActive && !collapsed && (
									<span className="ml-auto w-1.5 h-1.5 rounded-full bg-white/80" />
								)}
							</Link>
						);
					})}
				</nav>

				<div className="border-t border-white/10 p-4 space-y-3">
					{!collapsed && (
						<div
							className="flex items-center gap-2 rounded-3xl border border-white/20 bg-white/12 px-3 py-3 shadow-inner"
						>
							<Flame
								className={`${isElementary ? "w-7 h-7" : "w-6 h-6"} text-orange-300`}
							/>
							<div>
								<div
									className={`${isElementary ? "text-lg" : "text-base"} font-bold text-white`}
								>
									{dashboardData.current_streak_days > 0
										? `${dashboardData.current_streak_days} ngày liên tiếp!`
										: "Bắt đầu streak!"}
								</div>
								<div className="text-sm text-blue-100">
									{dashboardData.current_streak_days > 0
										? "Tiếp tục chuỗi streak"
										: "Học mỗi ngày để tạo streak"}
								</div>
							</div>
						</div>
					)}
					{collapsed && (
						<div className="text-center py-1 mb-1">
							<Flame className="w-5 h-5 text-orange-300" />
							<div className="text-sm font-bold text-orange-200">
								{dashboardData.current_streak_days}
							</div>
						</div>
					)}
					<button
						onClick={() => {
							localStorage.removeItem("user");
							localStorage.removeItem("token");
							localStorage.removeItem("mathai-user");
							window.location.href = "/login";
						}}
						className="flex w-full items-center gap-3 rounded-2xl bg-red-500 px-3 py-2.5 text-lg font-bold text-white shadow-lg transition-colors hover:bg-red-600"
					>
						<Hand className="w-5 h-5" />
						{!collapsed && <span>{"Đăng xuất"}</span>}
					</button>
				</div>
			</aside>

			<div
				className={`min-w-0 flex-1 transition-all duration-300 ${collapsed ? "lg:pl-[76px]" : "lg:pl-[264px]"}`}
			>
				<header className="sticky top-0 z-30 flex h-20 items-center bg-[#f6fbff]/90 px-4 backdrop-blur md:px-8">
					<div className="flex items-center gap-3">
						<button
							onClick={() => setMobileOpen(true)}
							className="lg:hidden h-9 w-9 flex items-center justify-center rounded-xl hover:bg-gray-100 transition-colors"
							aria-label="Mở menu điều hướng"
						>
							<svg
								className="w-5 h-5 text-gray-600"
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor"
							>
								<path
									strokeLinecap="round"
									strokeLinejoin="round"
									strokeWidth={2}
									d="M4 6h16M4 12h16M4 18h16"
								/>
							</svg>
						</button>
						<div className="hidden md:block">
							<h1 className="text-3xl font-black tracking-tight text-slate-950">
								Xin chào, bạn nhỏ!
							</h1>
							<div className="mt-1 flex items-center gap-2 text-base text-slate-500">
								{theme.showEmojis && <Hand className="w-4 h-4" />}
								<span>
									{(() => {
										const hour = new Date().getHours();
										if (hour < 12) return "Chào buổi sáng!";
										if (hour < 18) return "Chào buổi chiều!";
										return "Chào buổi tối!";
									})()} Hôm nay mình cùng chinh phục toán học nhé!
								</span>
							</div>
						</div>
					</div>
				</header>

				<main className={`${theme.cardPadding} md:px-8 md:pb-8 md:pt-2`}>{children}</main>
			</div>
		</div>
	);
}

export default function DashboardLayout({ children }: { children: ReactNode }) {
	const { user, loading } = useAuth(["student"]);

	if (loading) {
		return (
			<div className="flex min-h-screen items-center justify-center bg-gray-50">
				<div className="text-center">
					<div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent mx-auto mb-3" />
					<p className="text-sm text-gray-500">Đang tải...</p>
				</div>
			</div>
		);
	}

	if (!user) return null;

	return (
		<AgeThemeProvider>
			<DashboardShell user={user}>{children}</DashboardShell>
		</AgeThemeProvider>
	);
}
