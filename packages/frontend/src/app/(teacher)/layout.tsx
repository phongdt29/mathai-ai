'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { useAuth } from '@/hooks/useAuth';
import {
  LayoutDashboard,
  Users,
  BookOpen,
  ClipboardList,
  BarChart3,
  Settings,
  LogOut,
  GraduationCap,
  Menu,
  ChevronLeft,
  FileText,
} from 'lucide-react';

const navItems = [
  { href: '/teacher', label: 'Tổng quan', icon: LayoutDashboard },
  { href: '/teacher/classes', label: 'Lớp học', icon: BookOpen },
  { href: '/teacher/content-library', label: 'Thư viện AI', icon: BookOpen },
  { href: '/teacher/students', label: 'Học sinh', icon: Users },
  { href: '/teacher/assignments', label: 'Bài tập', icon: ClipboardList },
  { href: '/teacher/gradebook', label: 'Sổ điểm', icon: BarChart3 },
  { href: '/teacher/analytics', label: 'Thống kê', icon: BarChart3 },
  { href: '/teacher/proposals', label: 'Đề xuất', icon: FileText },
  { href: '/teacher/settings', label: 'Cài đặt', icon: Settings },
];

export default function TeacherLayout({ children }: { children: ReactNode }) {
  const { user, loading, logout } = useAuth(['teacher']);
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-emerald-600 border-t-transparent mx-auto mb-3" />
          <p className="text-sm text-gray-500">Đang tải...</p>
        </div>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="flex min-h-screen bg-gray-50">
      {mobileOpen && (
        <div className="fixed inset-0 z-40 bg-black/40 lg:hidden" onClick={() => setMobileOpen(false)} />
      )}

      <aside className={`fixed inset-y-0 left-0 z-50 flex flex-col bg-white border-r border-gray-200 shadow-sm transition-all duration-300 ${collapsed ? 'w-[72px]' : 'w-[256px]'} ${mobileOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0`}>
        <div className="flex h-16 items-center justify-between px-4 border-b border-gray-200">
          {!collapsed && (
            <Link href="/teacher" className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-600 text-white">
                <GraduationCap className="w-5 h-5" />
              </div>
              <div>
                <span className="text-lg font-bold text-gray-900">MathAI</span>
                <span className="ml-1.5 text-xs font-medium text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">Giáo viên</span>
              </div>
            </Link>
          )}
          {collapsed && (
            <Link href="/teacher" className="mx-auto">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-600 text-white">
                <GraduationCap className="w-5 h-5" />
              </div>
            </Link>
          )}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="hidden lg:flex h-7 w-7 items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
          >
            <ChevronLeft className={`w-4 h-4 transition-transform duration-300 ${collapsed ? 'rotate-180' : ''}`} />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto p-3 space-y-1">
          {navItems.map((item) => {
            const isActive = pathname === item.href || (item.href !== '/teacher' && pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className={`group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors duration-200 ${
                  isActive
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`}
              >
                <item.icon className={`w-5 h-5 flex-shrink-0 ${isActive ? 'text-emerald-600' : 'text-gray-400 group-hover:text-gray-600'}`} />
                {!collapsed && <span>{item.label}</span>}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-gray-200 p-3">
          {!collapsed && (
            <div className="flex items-center gap-3 px-3 py-2 mb-2">
              <div className="h-8 w-8 rounded-full bg-emerald-600 flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
                {user.full_name?.charAt(0)?.toUpperCase() || 'T'}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{user.full_name}</p>
                <p className="text-xs text-gray-500 truncate">{user.email}</p>
              </div>
            </div>
          )}
          <button
            onClick={logout}
            className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-gray-500 transition-colors hover:bg-red-50 hover:text-red-600 w-full`}
          >
            <LogOut className="w-5 h-5 flex-shrink-0" />
            {!collapsed && <span>Đăng xuất</span>}
          </button>
        </div>
      </aside>

      <div className={`flex-1 transition-all duration-300 ${collapsed ? 'lg:pl-[72px]' : 'lg:pl-[256px]'}`}>
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-gray-200 bg-white/80 backdrop-blur-xl px-4 md:px-6">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileOpen(true)}
              className="lg:hidden h-9 w-9 flex items-center justify-center rounded-lg hover:bg-gray-100 transition-colors"
            >
              <Menu className="w-5 h-5 text-gray-600" />
            </button>
            <h1 className="text-sm font-medium text-gray-700">
              {navItems.find((item) => pathname === item.href || (item.href !== '/teacher' && pathname.startsWith(item.href)))?.label || 'Tổng quan'}
            </h1>
          </div>
        </header>

        <main className="p-4 md:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
