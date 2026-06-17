'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

export interface AuthUser {
  id: string;
  email: string;
  full_name: string;
  role: string;
  is_active: boolean;
}

export function useAuth(allowedRoles?: string[]) {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const allowedRolesKey = allowedRoles?.join(',') ?? '';
  useEffect(() => {
    let active = true;

    queueMicrotask(() => {
      if (!active) return;
      const roles = allowedRolesKey ? allowedRolesKey.split(',') : undefined;
      const token = localStorage.getItem('token');
      const stored = localStorage.getItem('user') ?? localStorage.getItem('mathai-user');

      if (!token || !stored) {
        router.replace('/login');
        return;
      }

      try {
        const parsed: AuthUser = JSON.parse(stored);
        localStorage.setItem('user', JSON.stringify(parsed));

        if (roles && !roles.includes(parsed.role)) {
          // Redirect to correct area based on role
          const redirects: Record<string, string> = {
            admin: '/admin',
            student: '/dashboard',
            teacher: '/teacher',
            parent: '/parent',
            staff: '/admin',
          };
          router.replace(redirects[parsed.role] || '/login');
          return;
        }

        setUser(parsed);
      } catch {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        localStorage.removeItem('mathai-user');
        router.replace('/login');
      } finally {
        if (active) setLoading(false);
      }
    });

    return () => {
      active = false;
    };
  }, [router, allowedRolesKey]);

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('mathai-user');
    router.replace('/login');
  };

  return { user, loading, logout };
}
