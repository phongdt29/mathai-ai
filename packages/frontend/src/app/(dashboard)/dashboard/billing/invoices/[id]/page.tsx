'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { FileText, ArrowLeft, Download } from 'lucide-react';
import { apiClient, type ApiResponse } from '@/lib/api';

interface InvoiceLineItem {
  description: string;
  quantity: number;
  unit_price_vnd: number;
  amount_vnd: number;
}

interface InvoiceDetail {
  id: string;
  invoice_number: string;
  status: 'open' | 'paid' | 'void' | 'uncollectible';
  amount_total_vnd: number;
  amount_tax_vnd: number;
  amount_paid_vnd: number;
  line_items: InvoiceLineItem[];
  subscription_id: string | null;
  plan_name: string | null;
  billing_interval: string | null;
  created_at: string;
  paid_at: string | null;
  due_at: string | null;
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
    hour: '2-digit',
    minute: '2-digit',
  });
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    paid: 'bg-green-50 text-green-700',
    open: 'bg-yellow-50 text-yellow-700',
    void: 'bg-gray-100 text-gray-500',
    uncollectible: 'bg-red-50 text-red-700',
  };
  const labels: Record<string, string> = {
    paid: 'Đã thanh toán',
    open: 'Chờ thanh toán',
    void: 'Đã huỷ',
    uncollectible: 'Không thu được',
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${styles[status] || 'bg-gray-100 text-gray-600'}`}>
      {labels[status] || status}
    </span>
  );
}

export default function InvoiceDetailPage() {
  const params = useParams();
  const router = useRouter();
  const invoiceId = params.id as string;

  const [invoice, setInvoice] = useState<InvoiceDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchInvoice = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient<ApiResponse<InvoiceDetail>>(`/billing/me/invoices/${encodeURIComponent(invoiceId)}`);
      setInvoice(res.data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Không thể tải hoá đơn');
    } finally {
      setLoading(false);
    }
  }, [invoiceId]);

  useEffect(() => {
    let isActive = true;
    queueMicrotask(() => {
      if (isActive) fetchInvoice();
    });
    return () => { isActive = false; };
  }, [fetchInvoice]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
      </div>
    );
  }

  if (error || !invoice) {
    return (
      <div className="max-w-2xl mx-auto space-y-4">
        <button onClick={() => router.push('/dashboard/billing')} className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1">
          <ArrowLeft className="w-4 h-4" /> Quay lại
        </button>
        <div className="rounded-2xl bg-red-50 p-6 text-center text-red-600">
          {error || 'Không tìm thấy hoá đơn'}
        </div>
      </div>
    );
  }

  const subtotal = invoice.line_items.reduce((sum, item) => sum + item.amount_vnd, 0);

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <button
        onClick={() => router.push('/dashboard/billing')}
        className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1"
      >
        <ArrowLeft className="w-4 h-4" /> Quay lại Billing
      </button>

      {/* Invoice Header */}
      <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-blue-100 flex items-center justify-center">
              <FileText className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-gray-900">Hoá đơn {invoice.invoice_number}</h1>
              <p className="text-sm text-gray-500">
                {invoice.plan_name && `Gói ${invoice.plan_name}`}
                {invoice.billing_interval && ` — ${invoice.billing_interval}`}
              </p>
            </div>
          </div>
          <StatusBadge status={invoice.status} />
        </div>

        <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-4 pt-4 border-t border-gray-100">
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wide">Ngày tạo</p>
            <p className="text-sm font-medium text-gray-900 mt-1">{formatDate(invoice.created_at)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wide">Hạn thanh toán</p>
            <p className="text-sm font-medium text-gray-900 mt-1">{formatDate(invoice.due_at)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wide">Ngày thanh toán</p>
            <p className="text-sm font-medium text-gray-900 mt-1">{formatDate(invoice.paid_at)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wide">Tổng cộng</p>
            <p className="text-lg font-bold text-blue-600 mt-1">{formatVND(invoice.amount_total_vnd)}</p>
          </div>
        </div>
      </div>

      {/* Line Items */}
      <div className="rounded-2xl bg-white shadow-sm ring-1 ring-gray-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">Chi tiết</h2>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              <th className="px-6 py-3 text-left">Mô tả</th>
              <th className="px-6 py-3 text-right">SL</th>
              <th className="px-6 py-3 text-right">Đơn giá</th>
              <th className="px-6 py-3 text-right">Thành tiền</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {invoice.line_items.map((item, idx) => (
              <tr key={idx}>
                <td className="px-6 py-3 text-gray-900">{item.description}</td>
                <td className="px-6 py-3 text-right text-gray-600">{item.quantity}</td>
                <td className="px-6 py-3 text-right text-gray-600">{formatVND(item.unit_price_vnd)}</td>
                <td className="px-6 py-3 text-right font-medium text-gray-900">{formatVND(item.amount_vnd)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-gray-50">
            <tr>
              <td colSpan={3} className="px-6 py-2 text-right text-sm text-gray-600">Tạm tính</td>
              <td className="px-6 py-2 text-right font-medium text-gray-900">{formatVND(subtotal)}</td>
            </tr>
            {invoice.amount_tax_vnd > 0 && (
              <tr>
                <td colSpan={3} className="px-6 py-2 text-right text-sm text-gray-600">Thuế</td>
                <td className="px-6 py-2 text-right font-medium text-gray-900">{formatVND(invoice.amount_tax_vnd)}</td>
              </tr>
            )}
            <tr className="border-t border-gray-200">
              <td colSpan={3} className="px-6 py-3 text-right text-sm font-semibold text-gray-900">Tổng cộng</td>
              <td className="px-6 py-3 text-right text-lg font-bold text-blue-600">{formatVND(invoice.amount_total_vnd)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
