'use client';

import { useEffect, useState, useCallback } from 'react';
import { apiClient } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { canManageUserStatus } from './access';

interface User {
  _id: string;
  full_name: string;
  email: string;
  role: string;
  is_active: boolean;
  createdAt: string;
}

interface UsersResponse {
  success: boolean;
  data: User[];
  message?: string;
}

interface ToggleUserResponse {
  success: boolean;
  data: User;
  message?: string;
}

const roleDisplayMap: Record<string, string> = {
  student: 'Học sinh',
  teacher: 'Giáo viên',
  parent: 'Phụ huynh',
  admin: 'Admin',
  staff: 'Nhân viên',
};

const roleColors: Record<string, string> = {
  Admin: 'bg-red-100 text-red-700',
  'Giáo viên': 'bg-blue-100 text-blue-700',
  'Học sinh': 'bg-green-100 text-green-700',
  'Phụ huynh': 'bg-purple-100 text-purple-700',
  'Nhân viên': 'bg-amber-100 text-amber-700',
};

const roleOptions = ['all', 'admin', 'staff', 'teacher', 'student', 'parent'] as const;
const roleOptionLabels: Record<string, string> = {
  all: 'Tất cả',
  admin: 'Admin',
  staff: 'Nhân viên',
  teacher: 'Giáo viên',
  student: 'Học sinh',
  parent: 'Phụ huynh',
};

const statusOptions = ['', 'active', 'locked'] as const;
const statusOptionLabels: Record<string, string> = {
  '': 'Tất cả',
  active: 'Hoạt động',
  locked: 'Tạm khóa',
};

export default function UsersPage() {
  const { user } = useAuth(['admin', 'staff']);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await apiClient<UsersResponse>(
        `/admin/users?role=${roleFilter}&status=${statusFilter}&search=${encodeURIComponent(search)}`,
      );
      if (res.success) {
        setUsers(res.data);
      }
    } catch {
      setError('Không thể tải danh sách người dùng.');
    } finally {
      setLoading(false);
    }
  }, [roleFilter, statusFilter, search]);

  useEffect(() => {
    void Promise.resolve().then(fetchUsers);
  }, [fetchUsers]);

  const handleToggle = async (id: string) => {
    setTogglingId(id);
    try {
      const res = await apiClient<ToggleUserResponse>(`/admin/users/${id}/toggle`, {
        method: 'PUT',
      });
      if (res.success) {
        setUsers((prev) => prev.map((u) => (u._id === id ? res.data : u)));
      }
    } catch {
      setError('Không thể cập nhật trạng thái người dùng.');
    } finally {
      setTogglingId(null);
    }
  };

  const getRoleDisplay = (role: string) => roleDisplayMap[role] || role;
  const canToggleUsers = canManageUserStatus(user?.role);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Quản lý người dùng 👥</h1>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm text-gray-700 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        >
          {roleOptions.map((r) => (
            <option key={r} value={r}>
              {roleOptionLabels[r]}
            </option>
          ))}
        </select>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm text-gray-700 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        >
          {statusOptions.map((s) => (
            <option key={s} value={s}>
              {statusOptionLabels[s]}
            </option>
          ))}
        </select>

        <input
          type="text"
          placeholder="Tìm kiếm theo tên hoặc email..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm text-gray-700 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 min-w-[250px]"
        />
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>
      )}

      {/* Table */}
      <div className="rounded-2xl bg-white shadow-sm ring-1 ring-gray-100 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20 text-sm text-gray-400">
            Đang tải...
          </div>
        ) : users.length === 0 ? (
          <div className="flex items-center justify-center py-20 text-sm text-gray-400">
            Không tìm thấy người dùng nào.
          </div>
        ) : (
          <table className="w-full text-left">
            <thead className="bg-gray-50 text-xs uppercase text-gray-500">
              <tr>
                <th className="px-5 py-3">Người dùng</th>
                <th className="px-5 py-3">Vai trò</th>
                <th className="px-5 py-3">Trạng thái</th>
                <th className="px-5 py-3">Ngày tham gia</th>
                <th className="px-5 py-3">Hành động</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {users.map((u) => {
                const displayRole = getRoleDisplay(u.role);
                return (
                  <tr key={u._id} className="hover:bg-gray-50">
                    <td className="px-5 py-4">
                      <div className="font-medium text-gray-900">{u.full_name}</div>
                      <div className="mt-1 break-all text-sm text-gray-500">{u.email}</div>
                    </td>
                    <td className="px-5 py-4">
                      <span
                        className={`text-xs font-medium px-2 py-1 rounded-full ${roleColors[displayRole] || 'bg-gray-100 text-gray-700'}`}
                      >
                        {displayRole}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-sm">
                      {u.is_active ? (
                        <span className="text-green-600">● Hoạt động</span>
                      ) : (
                        <span className="text-red-500">● Tạm khóa</span>
                      )}
                    </td>
                    <td className="px-5 py-4 text-sm text-gray-400">
                      {new Date(u.createdAt).toLocaleDateString('vi-VN')}
                    </td>
                    <td className="px-5 py-4">
                      {canToggleUsers ? (
                        <button
                          onClick={() => handleToggle(u._id)}
                          disabled={togglingId === u._id}
                          className={`rounded-lg px-3 py-1.5 text-xs font-medium transition disabled:opacity-50 ${
                            u.is_active
                              ? 'bg-red-50 text-red-600 hover:bg-red-100'
                              : 'bg-green-50 text-green-600 hover:bg-green-100'
                          }`}
                        >
                          {togglingId === u._id
                            ? '...'
                            : u.is_active
                              ? 'Khóa'
                              : 'Mở khóa'}
                        </button>
                      ) : (
                        <span className="rounded-lg bg-gray-50 px-3 py-1.5 text-xs font-medium text-gray-500">
                          Chỉ xem
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
