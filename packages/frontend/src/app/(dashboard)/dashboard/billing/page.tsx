'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { CreditCard, Calendar, FileText, ArrowRight } from 'lucide-react';
import { apiClient, type ApiResponse } from '@/lib/api';

interface PlanInfo {
  plan_id: string;
  name: string;
  price_vnd: number;
  billing_interval: 'month' | 'quarter' | 'year' | 'one_time';
}

interface SubscriptionInfo {
  id: string;
  plan: PlanInfo;
  status: 'active' | 'trialing' | 'past_due' | 'cancelled' | 'expired';
  current_period_start: string;
  current_period_end: string;
  next_billing_at: string | null;
  cancelled_at: string | null;
  cancel_at_period_end: boolean;
}

interface InvoiceSummary {
  id: string;
  invoice_number: string;
  status: 'open' | 'paid' | 'void' | 'uncollectible';
  amount_total_vnd: number;
  created_at: string;
  paid_at: string | null;
}

function formatVND(amount: number): string {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('vi-VN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    active: 'bg-green-50 text-green-700',
    trialing: 'bg-blue-50 text-blue-700',
    past_due: 'bg-yellow-50 text-yellow-700',
    cancelled: 'bg-gray-100 text-gray-600',
    expired: 'bg-red-50 text-red-700',
    paid: 'bg-green-50 text-green-700',
    open: 'bg-yellow-50 text-yellow-700',
    void: 'bg-gray-100 text-gray-500',
  };
  const labels: Record<string, string> = {
    active: 'Đang hoạt động',
    trialing: 'Dùng thử',
    past_due: 'Quá hạn',
    cancelled: 'Đã huỷ',
    expired: 'Hết hạn',
    paid: 'Đã thanh toán',
    open: 'Chờ thanh toán',
    void: 'Đã huỷ',
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${styles[status] || 'bg-gray-100 text-gray-600'}`}>
      {labels[status] || status}
    </span>
  );
}

function IntervalLabel({ interval }: { interval: string }) {
  const labels: Record<string, string> = {
    month: '/tháng',
    quarter: '/quý',
    year: '/năm',
    one_time: '(một lần)',
  };
  return <span className="text-sm text-gray-500">{labels[interval] || interval}</span>;
}

export default function BillingPage() {
  const [subscription, setSubscription] = useState<SubscriptionInfo | null>(null);
  const [invoices, setInvoices] = useState<InvoiceSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [subRes, invRes] = await Promise.all([
        apiClient<ApiResponse<SubscriptionInfo | null>>('/billing/me/subscription').catch(() => ({ success: true, data: null }) as ApiResponse<null>),
        apiClient<ApiResponse<InvoiceSummary[]>>('/billing/me/invoices').catch(() => ({ success: true, data: [] }) as ApiResponse<InvoiceSummary[]>),
      ]);
      setSubscription(subRes.data);
      setInvoices(invRes.data ?? []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Không thể tải dữ liệu billing');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let isActive = true;
    queueMicrotask(() => {
      if (isActive) fetchData();
    });
    return () => { isActive = false; };
  }, [fetchData]);

  async function handleCancel() {
    if (!confirm('Bạn có chắc muốn huỷ gói đăng ký? Gói sẽ hết hiệu lực vào cuối kỳ hiện tại.')) return;
    setCancelling(true);
    try {
      await apiClient('/billing/me/subscription/cancel', {
        method: 'POST',
        body: JSON.stringify({ at_period_end: true, reason: 'user_requested' }),
      });
      await fetchData();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Không thể huỷ gói');
    } finally {
      setCancelling(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl bg-red-50 p-6 text-center text-red-600">{error}</div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Thanh toán & Gói dịch vụ</h1>
        {!subscription && (
          <Link
            href="/dashboard/billing/checkout"
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
          >
            <CreditCard className="w-4 h-4" />
            Nâng cấp
          </Link>
        )}
      </div>

      {/* Current Plan */}
      <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <CreditCard className="w-5 h-5 text-blue-600" />
              Gói hiện tại
            </h2>
            {subscription ? (
              <div className="mt-3 space-y-2">
                <div className="flex items-center gap-3">
                  <span className="text-xl font-bold text-gray-900">{subscription.plan.name}</span>
                  <StatusBadge status={subscription.status} />
                </div>
                <div className="text-2xl font-bold text-blue-600">
                  {formatVND(subscription.plan.price_vnd)}
                  <IntervalLabel interval={subscription.plan.billing_interval} />
                </div>
              </div>
            ) : (
              <div className="mt-3">
                <span className="text-lg font-medium text-gray-600">Gói miễn phí</span>
                <p className="text-sm text-gray-500 mt-1">Nâng cấp để mở khoá tính năng AI không giới hạn</p>
              </div>
            )}
          </div>
          {subscription && subscription.status === 'active' && !subscription.cancel_at_period_end && (
            <button
              onClick={handleCancel}
              disabled={cancelling}
              className="rounded-lg border border-red-200 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors disabled:opacity-40"
            >
              {cancelling ? 'Đang huỷ...' : 'Huỷ gói'}
            </button>
          )}
        </div>

        {subscription && (
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4 border-t border-gray-100">
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide">Kỳ hiện tại</p>
              <p className="text-sm font-medium text-gray-900 mt-1">
                {formatDate(subscription.current_period_start)} — {formatDate(subscription.current_period_end)}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide flex items-center gap-1">
                <Calendar className="w-3 h-3" /> Gia hạn tiếp theo
              </p>
              <p className="text-sm font-medium text-gray-900 mt-1">
                {subscription.cancel_at_period_end ? 'Sẽ huỷ cuối kỳ' : formatDate(subscription.next_billing_at)}
              </p>
            </div>
            {subscription.cancelled_at && (
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wide">Ngày huỷ</p>
                <p className="text-sm font-medium text-red-600 mt-1">{formatDate(subscription.cancelled_at)}</p>
              </div>
            )}
          </div>
        )}

        {subscription && subscription.cancel_at_period_end && (
          <div className="mt-4 rounded-lg bg-yellow-50 border border-yellow-200 p-3 text-sm text-yellow-800">
            Gói của bạn sẽ hết hiệu lực vào {formatDate(subscription.current_period_end)}. Bạn vẫn có thể sử dụng đến hết kỳ.
          </div>
        )}
      </div>

      {/* Invoices */}
      <div className="rounded-2xl bg-white shadow-sm ring-1 ring-gray-100">
        <div className="flex items-center justify-between p-6 pb-4">
          <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <FileText className="w-5 h-5 text-gray-600" />
            Lịch sử hoá đơn
          </h2>
        </div>
        {invoices.length === 0 ? (
          <div className="px-6 pb-6 text-center text-sm text-gray-400">
            Chưa có hoá đơn nào
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                <tr>
                  <th className="px-6 py-3">Mã hoá đơn</th>
                  <th className="px-6 py-3">Ngày tạo</th>
                  <th className="px-6 py-3">Số tiền</th>
                  <th className="px-6 py-3">Trạng thái</th>
                  <th className="px-6 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {invoices.map((inv) => (
                  <tr key={inv.id} className="hover:bg-gray-50">
                    <td className="px-6 py-3 font-mono text-xs text-gray-700">{inv.invoice_number}</td>
                    <td className="px-6 py-3 text-gray-600">{formatDate(inv.created_at)}</td>
                    <td className="px-6 py-3 font-medium text-gray-900">{formatVND(inv.amount_total_vnd)}</td>
                    <td className="px-6 py-3"><StatusBadge status={inv.status} /></td>
                    <td className="px-6 py-3">
                      <Link
                        href={`/dashboard/billing/invoices/${inv.id}`}
                        className="text-blue-600 hover:text-blue-700 inline-flex items-center gap-1 text-xs font-medium"
                      >
                        Chi tiết <ArrowRight className="w-3 h-3" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
