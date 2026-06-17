'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Key, GraduationCap, Backpack, Users, BriefcaseBusiness } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { apiClient, getStudentProfile } from '@/lib/api';
import { completeAuthSession } from '@/lib/auth-onboarding';
import { getDemoLoginPassword, isDemoLoginEnabled } from '@/lib/demo-auth';

const demoLoginPassword = getDemoLoginPassword();

const demoAccounts: { role: string; icon: LucideIcon; email: string; password: string; redirect: string }[] = [
  { role: 'Admin', icon: Key, email: 'admin@mathai.vn', password: demoLoginPassword, redirect: '/admin' },
  { role: 'Giáo viên', icon: GraduationCap, email: 'teacher@mathai.vn', password: demoLoginPassword, redirect: '/teacher' },
  { role: 'Nhân viên', icon: BriefcaseBusiness, email: 'staff@mathai.vn', password: demoLoginPassword, redirect: '/admin' },
  { role: 'Học sinh', icon: Backpack, email: 'student@mathai.vn', password: demoLoginPassword, redirect: '/dashboard' },
  { role: 'Phụ huynh', icon: Users, email: 'parent@mathai.vn', password: demoLoginPassword, redirect: '/parent' },
];

interface LoginResponse {
  success: boolean;
  message: string;
  data: {
    user: { email: string; full_name: string; role: string; id: string };
    tokens: { access_token: string; refresh_token: string };
  } | null;
}

export default function LoginPage() {
  const router = useRouter();
  const showDemoAccounts = isDemoLoginEnabled();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const performLogin = async (loginEmail: string, loginPassword: string) => {
    setLoading(true);
    setError('');

    try {
      const body = await apiClient<LoginResponse>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: loginEmail, password: loginPassword }),
      });

      if (!body.success || !body.data) {
        setError(body.message || 'Đăng nhập thất bại');
        setLoading(false);
        return;
      }

      const { user, tokens } = body.data;
      const redirect = await completeAuthSession({
        user,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        storage: localStorage,
        fetchStudentProfile: getStudentProfile,
      });
      router.replace(redirect);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Đăng nhập thất bại. Vui lòng thử lại.';
      setError(message);
      setLoading(false);
    }
  };

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    performLogin(email, password);
  };

  const fillDemo = (account: typeof demoAccounts[0]) => {
    setEmail(account.email);
    setPassword(account.password);
    setError('');
    performLogin(account.email, account.password);
  };

  return (
    <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-sm ring-1 ring-gray-200">
      <h1 className="mb-2 text-2xl font-bold text-gray-900">Đăng nhập</h1>
      <p className="mb-6 text-sm text-gray-500">
        Truy cập tài khoản MathAI để tiếp tục hành trình học tập.
      </p>

      {error && (
        <div className="mb-4 rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-600">
          {error}
        </div>
      )}

      <form onSubmit={handleLogin} className="space-y-4">
        <div>
          <label htmlFor="email" className="mb-2 block text-sm font-medium text-gray-700">
            Email
          </label>
          <input
            id="email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="w-full rounded-xl border border-gray-300 px-4 py-3 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label htmlFor="password" className="block text-sm font-medium text-gray-700">
              Mật khẩu
            </label>
            <a href="/forgot-password" className="text-xs text-indigo-600 hover:text-indigo-500">
              Quên mật khẩu?
            </a>
          </div>
          <input
            id="password"
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="********"
            className="w-full rounded-xl border border-gray-300 px-4 py-3 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-xl bg-indigo-600 px-4 py-3 font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-50"
        >
          {loading ? 'Đang đăng nhập...' : 'Đăng nhập'}
        </button>
      </form>

      <div className="mt-4 text-center text-sm text-gray-500">
        Chưa có tài khoản?{' '}
        <a href="/register" className="font-medium text-indigo-600 hover:text-indigo-500">Đăng ký</a>
      </div>

      {showDemoAccounts && (
        <div className="mt-8 border-t border-gray-100 pt-6">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-400">
            Tài khoản demo
          </p>
          <div className="grid grid-cols-2 gap-2">
            {demoAccounts.map((account) => (
              <button
                key={account.role}
                type="button"
                disabled={loading}
                className="group flex flex-col items-start rounded-xl border border-gray-200 px-3 py-2.5 text-left transition hover:border-indigo-300 hover:bg-indigo-50 disabled:opacity-50"
                onClick={() => fillDemo(account)}
              >
                <span className="text-base flex items-center gap-1.5"><account.icon className="w-4 h-4" /> {account.role}</span>
                <span className="mt-0.5 text-xs text-gray-400 group-hover:text-indigo-500">
                  {account.email}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
