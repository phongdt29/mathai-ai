'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { CheckCircle, XCircle, Clock, ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { apiClient, type ApiResponse } from '@/lib/api';

type TransactionStatus = 'pending' | 'succeeded' | 'failed' | 'expired';

interface TransactionInfo {
  intent_id: string;
  status: TransactionStatus;
  amount_vnd: number;
  gateway: string;
  paid_at: string | null;
}

function formatVND(amount: number): string {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
}

function resolveStatus(tx: TransactionInfo | null, pollExhausted: boolean): 'loading' | 'success' | 'failed' | 'pending' | 'error' {
  if (!tx) return pollExhausted ? 'error' : 'loading';
  if (tx.status === 'succeeded') return 'success';
  if (tx.status === 'failed' || tx.status === 'expired') return 'failed';
  return pollExhausted ? 'pending' : 'loading';
}

export default function BillingReturnPage() {
  const searchParams = useSearchParams();
  const [transaction, setTransaction] = useState<TransactionInfo | null>(null);
  const [pollExhausted, setPollExhausted] = useState(false);
  const pollCountRef = useRef(0);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const intentId = searchParams.get('intent_id') || searchParams.get('vnp_TxnRef') || searchParams.get('orderId');
  const noIntent = !intentId;

  const startPolling = useCallback(async (id: string, cancelled: { current: boolean }) => {
    async function poll() {
      if (cancelled.current) return;
      try {
        const res = await apiClient<ApiResponse<TransactionInfo>>(`/billing/transactions/${encodeURIComponent(id)}`);
        if (cancelled.current) return;
        const tx = res.data;
        setTransaction(tx);
        if (tx.status === 'pending') {
          pollCountRef.current += 1;
          if (pollCountRef.current >= 10) {
            setPollExhausted(true);
            return;
          }
          pollTimerRef.current = setTimeout(poll, 3000);
        }
      } catch {
        if (cancelled.current) return;
        pollCountRef.current += 1;
        if (pollCountRef.current >= 10) {
          setPollExhausted(true);
          return;
        }
        pollTimerRef.current = setTimeout(poll, 3000);
      }
    }
    poll();
  }, []);

  useEffect(() => {
    if (!intentId) return;

    const cancelled = { current: false };
    startPolling(intentId, cancelled);

    return () => {
      cancelled.current = true;
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
    };
  }, [intentId, startPolling]);

  const status = noIntent ? 'error' : resolveStatus(transaction, pollExhausted);
  const errorMsg = noIntent
    ? 'Không tìm thấy thông tin giao dịch'
    : pollExhausted && !transaction
      ? 'Không thể xác nhận giao dịch. Vui lòng kiểm tra lại sau.'
      : null;

  if (status === 'loading') {
    return (
      <div className="flex flex-col items-center justify-center py-20 space-y-4">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
        <p className="text-gray-600 font-medium">Đang xác nhận thanh toán...</p>
        <p className="text-sm text-gray-400">Vui lòng đợi trong giây lát</p>
      </div>
    );
  }

  if (status === 'success') {
    return (
      <div className="max-w-md mx-auto py-16 text-center space-y-6">
        <div className="mx-auto h-16 w-16 rounded-full bg-green-100 flex items-center justify-center">
          <CheckCircle className="w-10 h-10 text-green-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Thanh toán thành công!</h1>
          <p className="text-gray-600 mt-2">
            Gói dịch vụ đã được kích hoạt. Bạn có thể sử dụng ngay.
          </p>
        </div>
        {transaction && (
          <div className="rounded-xl bg-green-50 border border-green-200 p-4 text-sm text-left space-y-1">
            <div className="flex justify-between">
              <span className="text-gray-600">Số tiền:</span>
              <span className="font-medium text-gray-900">{formatVND(transaction.amount_vnd)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Cổng thanh toán:</span>
              <span className="font-medium text-gray-900 uppercase">{transaction.gateway}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Mã giao dịch:</span>
              <span className="font-mono text-xs text-gray-700">{transaction.intent_id}</span>
            </div>
          </div>
        )}
        <div className="flex flex-col gap-2">
          <Link
            href="/dashboard/billing"
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
          >
            Xem gói đăng ký <ArrowRight className="w-4 h-4" />
          </Link>
          <Link
            href="/dashboard"
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            Về trang chủ
          </Link>
        </div>
      </div>
    );
  }

  if (status === 'failed') {
    return (
      <div className="max-w-md mx-auto py-16 text-center space-y-6">
        <div className="mx-auto h-16 w-16 rounded-full bg-red-100 flex items-center justify-center">
          <XCircle className="w-10 h-10 text-red-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Thanh toán thất bại</h1>
          <p className="text-gray-600 mt-2">
            Giao dịch không thành công. Vui lòng thử lại hoặc chọn phương thức khác.
          </p>
        </div>
        {transaction && (
          <div className="rounded-xl bg-red-50 border border-red-200 p-4 text-sm text-left space-y-1">
            <div className="flex justify-between">
              <span className="text-gray-600">Trạng thái:</span>
              <span className="font-medium text-red-700 capitalize">{transaction.status === 'expired' ? 'Hết hạn' : 'Thất bại'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Mã giao dịch:</span>
              <span className="font-mono text-xs text-gray-700">{transaction.intent_id}</span>
            </div>
          </div>
        )}
        <div className="flex flex-col gap-2">
          <Link
            href="/dashboard/billing/checkout"
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
          >
            Thử lại
          </Link>
          <Link
            href="/dashboard/billing"
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            Quay lại Billing
          </Link>
        </div>
      </div>
    );
  }

  if (status === 'pending') {
    return (
      <div className="max-w-md mx-auto py-16 text-center space-y-6">
        <div className="mx-auto h-16 w-16 rounded-full bg-yellow-100 flex items-center justify-center">
          <Clock className="w-10 h-10 text-yellow-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Đang chờ xác nhận</h1>
          <p className="text-gray-600 mt-2">
            Giao dịch đang được xử lý. Hệ thống sẽ cập nhật khi nhận được xác nhận từ cổng thanh toán.
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <button
            onClick={() => {
              pollCountRef.current = 0;
              setPollExhausted(false);
              setTransaction(null);
              if (intentId) {
                startPolling(intentId, { current: false });
              }
            }}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
          >
            Kiểm tra lại
          </button>
          <Link
            href="/dashboard/billing"
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            Quay lại Billing
          </Link>
        </div>
      </div>
    );
  }

  // Error state
  return (
    <div className="max-w-md mx-auto py-16 text-center space-y-6">
      <div className="mx-auto h-16 w-16 rounded-full bg-gray-100 flex items-center justify-center">
        <XCircle className="w-10 h-10 text-gray-400" />
      </div>
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Lỗi</h1>
        <p className="text-gray-600 mt-2">{errorMsg || 'Đã xảy ra lỗi không xác định'}</p>
      </div>
      <Link
        href="/dashboard/billing"
        className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
      >
        Quay lại Billing
      </Link>
    </div>
  );
}
