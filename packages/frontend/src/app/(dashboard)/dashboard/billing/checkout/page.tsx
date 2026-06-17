'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CreditCard, Check, Zap, Landmark } from 'lucide-react';
import { apiClient, type ApiResponse } from '@/lib/api';

interface Plan {
  plan_id: string;
  name: string;
  description: string;
  price_vnd: number;
  billing_interval: 'month' | 'quarter' | 'year' | 'one_time';
  trial_days: number;
  entitlements: Array<{
    feature: string;
    label?: string;
    description?: string;
    limit: number | null;
    period: string | null;
    limit_label?: string;
  }>;
  is_active: boolean;
  metadata?: Record<string, unknown>;
}

type Gateway = 'auto' | 'vnpay' | 'momo' | 'sepay';

interface GatewayConfig {
  mode: 'user_select' | 'auto_priority';
  environment: 'sandbox' | 'production';
  fallback_enabled: boolean;
  gateways: Array<{
    gateway: Exclude<Gateway, 'auto'>;
    display_name: string;
    enabled: boolean;
    available: boolean;
    configured: boolean;
    priority: number;
    missing_credentials: string[];
  }>;
}

interface BankTransferInstruction {
  amount_vnd: number;
  bank_code: string;
  bank_name: string;
  account_number: string;
  account_name: string;
  transfer_content: string;
  qr_url: string | null;
  expires_at: string;
}

interface PaymentResult {
  intent_id: string;
  redirect_url: string;
  expires_at: string;
  type: 'redirect' | 'bank_transfer';
  gateway_used: Exclude<Gateway, 'auto'>;
  bank_transfer: BankTransferInstruction | null;
}

function formatVND(amount: number): string {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
}

function IntervalLabel({ interval }: { interval: string }) {
  const labels: Record<string, string> = {
    month: '/tháng',
    quarter: '/quý',
    year: '/năm',
    one_time: '(một lần)',
  };
  return <span>{labels[interval] || interval}</span>;
}

function PlanCard({ plan, selected, onSelect }: { plan: Plan; selected: boolean; onSelect: () => void }) {
  const badge = typeof plan.metadata?.badge === 'string' ? plan.metadata.badge : '';
  const recommended = Boolean(plan.metadata?.recommended);

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`relative rounded-2xl border-2 p-5 text-left transition-all ${
        selected ? 'border-blue-600 bg-blue-50 ring-2 ring-blue-200' : 'border-gray-200 bg-white hover:border-gray-300'
      }`}
    >
      {selected && (
        <div className="absolute top-3 right-3 h-6 w-6 rounded-full bg-blue-600 flex items-center justify-center">
          <Check className="w-4 h-4 text-white" />
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2 pr-7">
        <h3 className="text-lg font-bold text-gray-900">{plan.name}</h3>
        {(badge || recommended) && (
          <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
            {badge || 'Khuyến nghị'}
          </span>
        )}
      </div>
      {plan.description && <p className="mt-1 text-sm text-gray-500">{plan.description}</p>}
      <div className="mt-2">
        <span className="text-2xl font-bold text-blue-600">{formatVND(plan.price_vnd)}</span>
        <IntervalLabel interval={plan.billing_interval} />
      </div>
      {plan.trial_days > 0 && <p className="mt-1 text-sm text-green-600 font-medium">Dùng thử {plan.trial_days} ngày miễn phí</p>}
      {plan.entitlements.length > 0 && (
        <ul className="mt-3 space-y-1">
          {plan.entitlements.map((ent) => (
            <li key={ent.feature} className="flex items-center gap-2 text-sm text-gray-600">
              <Zap className="w-3.5 h-3.5 text-blue-500" />
              <span className="font-medium text-gray-700">{ent.label ?? ent.feature}</span>
              <span className="text-gray-400">{ent.limit_label ?? (ent.limit === null ? 'Không giới hạn' : ent.limit)}</span>
            </li>
          ))}
        </ul>
      )}
    </button>
  );
}

export default function CheckoutPage() {
  const router = useRouter();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [gatewayConfig, setGatewayConfig] = useState<GatewayConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
  const [selectedGateway, setSelectedGateway] = useState<Gateway>('auto');
  const [payment, setPayment] = useState<PaymentResult | null>(null);
  const [transactionStatus, setTransactionStatus] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const fetchCheckoutData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [plansRes, gatewaysRes] = await Promise.all([
        apiClient<ApiResponse<Plan[]>>('/billing/plans'),
        apiClient<ApiResponse<GatewayConfig>>('/billing/gateways/available'),
      ]);
      const activePlans = (plansRes.data ?? []).filter((p) => p.is_active);
      const config = gatewaysRes.data;
      const firstAvailable = config.gateways.find((gateway) => gateway.enabled && gateway.available);
      setPlans(activePlans);
      setGatewayConfig(config);
      setSelectedGateway(config.mode === 'auto_priority' ? 'auto' : firstAvailable?.gateway ?? 'vnpay');
      if (activePlans.length > 0) setSelectedPlan(activePlans[0].plan_id);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Không thể tải dữ liệu thanh toán');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let isActive = true;
    queueMicrotask(() => {
      if (isActive) fetchCheckoutData();
    });
    return () => { isActive = false; };
  }, [fetchCheckoutData]);

  useEffect(() => {
    if (!payment || payment.type !== 'bank_transfer') return;
    let isActive = true;
    const timer = window.setInterval(async () => {
      try {
        const res = await apiClient<ApiResponse<{ status: string }>>(`/billing/transactions/${payment.intent_id}`);
        if (!isActive) return;
        setTransactionStatus(res.data.status);
        if (['succeeded', 'failed', 'expired'].includes(res.data.status)) window.clearInterval(timer);
      } catch {
        if (isActive) setTransactionStatus('pending');
      }
    }, 5000);
    return () => {
      isActive = false;
      window.clearInterval(timer);
    };
  }, [payment]);

  async function handleCheckout() {
    if (!selectedPlan) return;
    setSubmitting(true);
    setPayment(null);
    try {
      const gateway = gatewayConfig?.mode === 'auto_priority' ? 'auto' : selectedGateway;
      const res = await apiClient<ApiResponse<{ payment: PaymentResult }>>('/billing/me/subscription', {
        method: 'POST',
        body: JSON.stringify({ plan_id: selectedPlan, gateway }),
      });
      const paymentResult = res.data.payment;
      if (paymentResult.type === 'redirect' && paymentResult.redirect_url) {
        window.location.href = paymentResult.redirect_url;
        return;
      }
      setPayment(paymentResult);
      setTransactionStatus('pending');
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Không thể tạo thanh toán');
    } finally {
      setSubmitting(false);
    }
  }

  const availableGateways = gatewayConfig?.gateways.filter((gateway) => gateway.enabled && gateway.available) ?? [];

  if (loading) {
    return <div className="flex items-center justify-center py-20"><div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" /></div>;
  }

  if (error) {
    return <div className="max-w-2xl mx-auto"><div className="rounded-2xl bg-red-50 p-6 text-center text-red-600">{error}</div></div>;
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <button onClick={() => router.push('/dashboard/billing')} className="text-sm text-gray-500 hover:text-gray-700 mb-2">
          ← Quay lại Billing
        </button>
        <h1 className="text-2xl font-bold text-gray-900">Chọn gói đăng ký</h1>
        <p className="text-sm text-gray-500 mt-1">Chọn gói phù hợp và phương thức thanh toán</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {plans.map((plan) => <PlanCard key={plan.plan_id} plan={plan} selected={selectedPlan === plan.plan_id} onSelect={() => setSelectedPlan(plan.plan_id)} />)}
      </div>

      {plans.length === 0 && <div className="rounded-2xl bg-gray-50 p-8 text-center text-gray-500">Chưa có gói nào khả dụng</div>}

      {plans.length > 0 && gatewayConfig?.mode === 'user_select' && (
        <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
          <h2 className="text-base font-semibold text-gray-900 mb-4">Phương thức thanh toán</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {availableGateways.map((gateway) => (
              <button
                key={gateway.gateway}
                type="button"
                onClick={() => setSelectedGateway(gateway.gateway)}
                className={`rounded-xl border-2 p-4 text-center transition-all ${selectedGateway === gateway.gateway ? 'border-blue-600 bg-blue-50' : 'border-gray-200 hover:border-gray-300'}`}
              >
                <div className="text-lg font-bold text-gray-900">{gateway.display_name}</div>
                <p className="text-xs text-gray-500 mt-1">{gateway.gateway === 'sepay' ? 'Chuyển khoản/QR' : 'Redirect thanh toán'}</p>
              </button>
            ))}
          </div>
        </div>
      )}

      {plans.length > 0 && gatewayConfig?.mode === 'auto_priority' && (
        <div className="rounded-2xl bg-blue-50 p-5 text-sm text-blue-700 ring-1 ring-blue-100">
          Hệ thống sẽ tự chọn cổng thanh toán khả dụng theo cấu hình ưu tiên/fallback của quản trị viên.
        </div>
      )}

      {payment?.type === 'bank_transfer' && payment.bank_transfer && (
        <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100 space-y-4">
          <div className="flex items-center gap-2 text-lg font-semibold text-gray-900"><Landmark className="w-5 h-5" /> Thanh toán chuyển khoản SePay</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            <div><span className="text-gray-500">Ngân hàng:</span> <b>{payment.bank_transfer.bank_name}</b></div>
            <div><span className="text-gray-500">Số tài khoản:</span> <b>{payment.bank_transfer.account_number}</b></div>
            <div><span className="text-gray-500">Chủ tài khoản:</span> <b>{payment.bank_transfer.account_name}</b></div>
            <div><span className="text-gray-500">Số tiền:</span> <b>{formatVND(payment.bank_transfer.amount_vnd)}</b></div>
          </div>
          <div className="rounded-xl bg-amber-50 p-4 text-sm text-amber-800">
            Nội dung chuyển khoản bắt buộc: <b>{payment.bank_transfer.transfer_content}</b>
          </div>
          {payment.bank_transfer.qr_url && (
            // Dynamic QR image from the SePay payment gateway; next/image is not applicable.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={payment.bank_transfer.qr_url} alt="QR thanh toán SePay" className="mx-auto h-56 w-56 rounded-xl border object-contain" />
          )}
          <p className="text-sm text-gray-500">Trạng thái giao dịch: <b>{transactionStatus ?? 'pending'}</b></p>
        </div>
      )}

      {plans.length > 0 && (
        <div className="flex justify-end">
          <button
            onClick={handleCheckout}
            disabled={!selectedPlan || submitting || (gatewayConfig?.mode === 'user_select' && availableGateways.length === 0)}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-6 py-3 text-sm font-medium text-white hover:bg-blue-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <CreditCard className="w-4 h-4" />
            {submitting ? 'Đang xử lý...' : 'Thanh toán ngay'}
          </button>
        </div>
      )}
    </div>
  );
}
