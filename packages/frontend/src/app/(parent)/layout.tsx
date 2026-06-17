'use client';

import { useState } from 'react';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

const navItems = [
  { href: '/parent', label: 'Tổng quan', emoji: '📊' },
  { href: '/parent/children', label: 'Con em', emoji: '👦' },
  { href: '/parent/reports', label: 'Báo cáo', emoji: '📈' },
  { href: '/parent/notifications', label: 'Thông báo', emoji: '🔔' },
  { href: '/parent/settings', label: 'Cài đặt', emoji: '⚙️' },
];

export default function ParentLayout({ children }: { children: ReactNode }) {
  const { user, loading, logout } = useAuth(['parent']);
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent mx-auto mb-3" />
          <p className="text-sm text-gray-500">Đang tải...</p>
        </div>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header with horizontal nav */}
      <header className="sticky top-0 z-50 bg-white border-b border-gray-200 shadow-sm">
        <div className="mx-auto max-w-6xl px-6">
          <div className="flex h-16 items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-2xl">🧮</span>
              <span className="text-lg font-extrabold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">MathAI</span>
              <span className="text-xs font-medium bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full ml-2">Phụ huynh</span>
            </div>

            {/* Desktop nav */}
            <nav className="hidden md:flex items-center gap-1">
              {navItems.map((item) => {
                const isActive = pathname === item.href || (item.href !== '/parent' && pathname.startsWith(item.href));
                return (
                  <Link key={item.href} href={item.href} className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition ${
                    isActive
                      ? 'bg-indigo-100 text-indigo-700'
                      : 'text-gray-600 hover:bg-indigo-50 hover:text-indigo-700'
                  }`}>
                    <span>{item.emoji}</span>
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </nav>

            <div className="flex items-center gap-3">
              <button onClick={logout} className="text-sm text-red-500 hover:text-red-600 font-medium">
                Đăng xuất
              </button>
              <button onClick={() => setMobileOpen(!mobileOpen)} className="md:hidden h-10 w-10 flex items-center justify-center rounded-xl hover:bg-gray-100" aria-label="Mở menu điều hướng">
                <Menu className="w-5 h-5 text-gray-600" />
              </button>
            </div>
          </div>

          {/* Mobile nav */}
          {mobileOpen && (
            <nav className="md:hidden border-t border-gray-100 py-2 space-y-1">
              {navItems.map((item) => {
                const isActive = pathname === item.href || (item.href !== '/parent' && pathname.startsWith(item.href));
                return (
                  <Link key={item.href} href={item.href} onClick={() => setMobileOpen(false)} className={`flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                    isActive
                      ? 'bg-indigo-100 text-indigo-700'
                      : 'text-gray-600 hover:bg-indigo-50 hover:text-indigo-700'
                  }`}>
                    <span>{item.emoji}</span>
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </nav>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-6">
        {children}
      </main>
    </div>
  );
}
