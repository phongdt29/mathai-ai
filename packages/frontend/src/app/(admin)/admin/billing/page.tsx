'use client';

import { useCallback, useEffect, useState } from 'react';
import { CreditCard, TrendingUp, TrendingDown, DollarSign, Users, RefreshCw, Plus, Pencil, Wand2 } from 'lucide-react';
import { apiClient, type ApiResponse } from '@/lib/api';

interface RevenueMetrics {
  mrr_vnd: number;
  total_revenue_vnd: number;
  active_subscriptions: number;
  churned_this_month: number;
  new_subs_this_month: number;
  arpu_vnd: number;
}

interface TransactionSummary {
  id: string;
  intent_id: string;
  user_email: string;
  amount_vnd: number;
  gateway: string;
  status: 'pending' | 'succeeded' | 'failed' | 'expired';
  created_at: string;
  paid_at: string | null;
}

interface PlanSummary {
  plan_id: string;
  name: string;
  description: string;
  price_vnd: number;
  billing_interval: string;
  trial_days: number;
  entitlements: PlanEntitlement[];
  active_subscribers: number;
  is_active: boolean;
  metadata: Record<string, unknown>;
}

interface PlanEntitlement {
  feature: string;
  label?: string;
  description?: string;
  unit?: string;
  limit: number | null;
  period: 'day' | 'month' | 'year' | null;
  limit_label?: string;
}

interface FeatureDefinition {
  feature: string;
  label: string;
  description: string;
  unit: string;
}

interface PlanDraft {
  plan_id: string;
  name: string;
  description: string;
  price_vnd: string;
  billing_interval: 'month' | 'quarter' | 'year' | 'one_time';
  trial_days: string;
  is_active: boolean;
  badge: string;
  recommended: boolean;
  entitlements: Array<{
    feature: string;
    limit: string;
    period: '' | 'day' | 'month' | 'year';
  }>;
}

type PaymentGatewayName = 'vnpay' | 'momo' | 'sepay';
type GatewayEnvironment = 'sandbox' | 'production';

interface GatewayCredentialField {
  key: string;
  label: string;
  required: boolean;
  secret: boolean;
  env_key: string;
  sandbox_has_value: boolean;
  production_has_value: boolean;
  has_value: boolean;
  has_default: boolean;
}

interface GatewayConfig {
  mode: 'user_select' | 'auto_priority';
  environment: GatewayEnvironment;
  fallback_enabled: boolean;
  gateways: Array<{
    gateway: PaymentGatewayName;
    display_name: string;
    enabled: boolean;
    priority: number;
    configured: boolean;
    available: boolean;
    missing_credentials: string[];
    fields: GatewayCredentialField[];
  }>;
}

type CredentialDrafts = Partial<Record<PaymentGatewayName, Partial<Record<GatewayEnvironment, Record<string, string>>>>>;

const fallbackFeatureCatalog: FeatureDefinition[] = [
  { feature: 'ai_solver_requests', label: 'AI Solver', description: 'Số lượt xin gợi ý hoặc lời giải AI trong ngày.', unit: 'lượt' },
  { feature: 'image_ocr', label: 'OCR ảnh bài toán', description: 'Số lượt đọc đề toán từ ảnh trong ngày.', unit: 'ảnh' },
  { feature: 'curriculum_generation', label: 'Tạo lộ trình AI', description: 'Số lần tạo hoặc tái tạo lộ trình học cá nhân.', unit: 'lộ trình' },
  { feature: 'lesson_practice', label: 'Bài luyện tập', description: 'Số bài học/lượt luyện tập được mở theo gói.', unit: 'bài' },
  { feature: 'parent_reports', label: 'Báo cáo phụ huynh', description: 'Báo cáo tiến độ học tập gửi cho phụ huynh.', unit: 'báo cáo' },
  { feature: 'advanced_analytics', label: 'Phân tích nâng cao', description: 'Dashboard phân tích năng lực, tiến độ và rủi ro học tập.', unit: 'tính năng' },
  { feature: 'content_library_exports', label: 'Xuất học liệu', description: 'Số lượt xuất học liệu hoặc đề luyện từ thư viện nội dung.', unit: 'lượt xuất' },
  { feature: 'priority_support', label: 'Hỗ trợ ưu tiên', description: 'Yêu cầu hỗ trợ được ưu tiên xử lý.', unit: 'yêu cầu' },
  { feature: 'ai_solver_unlimited', label: 'AI Solver không giới hạn', description: 'Không giới hạn lượt dùng AI Solver trong phạm vi chính sách sử dụng hợp lý.', unit: 'tính năng' },
];

function emptyPlanDraft(): PlanDraft {
  return {
    plan_id: '',
    name: '',
    description: '',
    price_vnd: '99000',
    billing_interval: 'month',
    trial_days: '0',
    is_active: true,
    badge: '',
    recommended: false,
    entitlements: [],
  };
}

function planToDraft(plan: PlanSummary): PlanDraft {
  return {
    plan_id: plan.plan_id,
    name: plan.name,
    description: plan.description,
    price_vnd: String(plan.price_vnd),
    billing_interval: plan.billing_interval as PlanDraft['billing_interval'],
    trial_days: String(plan.trial_days),
    is_active: plan.is_active,
    badge: typeof plan.metadata?.badge === 'string' ? plan.metadata.badge : '',
    recommended: Boolean(plan.metadata?.recommended),
    entitlements: plan.entitlements.map((entitlement) => ({
      feature: entitlement.feature,
      limit: entitlement.limit === null ? '' : String(entitlement.limit),
      period: entitlement.period ?? '',
    })),
  };
}

function formatVND(amount: number): string {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('vi-VN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    succeeded: 'bg-green-50 text-green-700',
    pending: 'bg-yellow-50 text-yellow-700',
    failed: 'bg-red-50 text-red-700',
    expired: 'bg-gray-100 text-gray-500',
  };
  const labels: Record<string, string> = {
    succeeded: 'Thành công',
    pending: 'Đang chờ',
    failed: 'Thất bại',
    expired: 'Hết hạn',
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${styles[status] || 'bg-gray-100 text-gray-600'}`}>
      {labels[status] || status}
    </span>
  );
}

function MetricCard({
  label,
  value,
  icon: Icon,
  color,
  subtext,
}: {
  label: string;
  value: string;
  icon: typeof TrendingUp;
  color: string;
  subtext?: string;
}) {
  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-100">
      <div className="flex items-center gap-3">
        <div className={`h-10 w-10 rounded-lg ${color} flex items-center justify-center`}>
          <Icon className="w-5 h-5 text-white" />
        </div>
        <div>
          <p className="text-xs text-gray-500 uppercase tracking-wide">{label}</p>
          <p className="text-xl font-bold text-gray-900">{value}</p>
          {subtext && <p className="text-xs text-gray-400">{subtext}</p>}
        </div>
      </div>

    </div>
  );
}

export default function AdminBillingPage() {
  const [metrics, setMetrics] = useState<RevenueMetrics | null>(null);
  const [transactions, setTransactions] = useState<TransactionSummary[]>([]);
  const [plans, setPlans] = useState<PlanSummary[]>([]);
  const [featureCatalog, setFeatureCatalog] = useState<FeatureDefinition[]>(fallbackFeatureCatalog);
  const [gatewayConfig, setGatewayConfig] = useState<GatewayConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [planMessage, setPlanMessage] = useState<string | null>(null);
  const [savingPlan, setSavingPlan] = useState(false);
  const [editingPlanId, setEditingPlanId] = useState<string | null>(null);
  const [planDraft, setPlanDraft] = useState<PlanDraft | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'transactions' | 'plans' | 'gateways'>('overview');
  const [activeGatewayName, setActiveGatewayName] = useState<PaymentGatewayName>('vnpay');
  const [credentialDrafts, setCredentialDrafts] = useState<CredentialDrafts>({});
  const [credentialMessage, setCredentialMessage] = useState<string | null>(null);
  const [credentialSavingKey, setCredentialSavingKey] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [metricsRes, txRes, plansRes, gatewaysRes] = await Promise.all([
        apiClient<ApiResponse<RevenueMetrics>>('/admin/billing/metrics').catch(() => ({ success: false, data: null }) as unknown as ApiResponse<RevenueMetrics>),
        apiClient<ApiResponse<TransactionSummary[]>>('/admin/billing/transactions').catch(() => ({ success: false, data: [] }) as unknown as ApiResponse<TransactionSummary[]>),
        apiClient<ApiResponse<PlanSummary[]>>('/admin/billing/plans').catch(() => ({ success: false, data: [] }) as unknown as ApiResponse<PlanSummary[]>),
        apiClient<ApiResponse<GatewayConfig>>('/admin/billing/gateways/config').catch(() => ({ success: false, data: null }) as unknown as ApiResponse<GatewayConfig>),
      ]);
      const featuresRes = await apiClient<ApiResponse<FeatureDefinition[]>>('/admin/billing/plans/features')
        .catch(() => ({ success: false, data: fallbackFeatureCatalog }) as unknown as ApiResponse<FeatureDefinition[]>);
      setMetrics(metricsRes.data as RevenueMetrics | null);
      setTransactions((txRes.data as TransactionSummary[] | null) ?? []);
      setPlans((plansRes.data as PlanSummary[] | null) ?? []);
      setFeatureCatalog((featuresRes.data as FeatureDefinition[] | null) ?? fallbackFeatureCatalog);
      setGatewayConfig((gatewaysRes.data as GatewayConfig | null) ?? null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Không thể tải dữ liệu');
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

  function startCreatePlan() {
    setEditingPlanId(null);
    setPlanDraft(emptyPlanDraft());
    setPlanMessage(null);
    setActiveTab('plans');
  }

  function startEditPlan(plan: PlanSummary) {
    setEditingPlanId(plan.plan_id);
    setPlanDraft(planToDraft(plan));
    setPlanMessage(null);
    setActiveTab('plans');
  }

  function updatePlanDraft(patch: Partial<PlanDraft>) {
    setPlanDraft((current) => current ? { ...current, ...patch } : current);
  }

  function toggleDraftEntitlement(feature: string, enabled: boolean) {
    setPlanDraft((current) => {
      if (!current) return current;
      if (!enabled) {
        return {
          ...current,
          entitlements: current.entitlements.filter((item) => item.feature !== feature),
        };
      }
      if (current.entitlements.some((item) => item.feature === feature)) return current;
      return {
        ...current,
        entitlements: [...current.entitlements, { feature, limit: '', period: '' }],
      };
    });
  }

  function updateDraftEntitlement(
    feature: string,
    patch: Partial<PlanDraft['entitlements'][number]>,
  ) {
    setPlanDraft((current) => {
      if (!current) return current;
      return {
        ...current,
        entitlements: current.entitlements.map((item) =>
          item.feature === feature ? { ...item, ...patch } : item,
        ),
      };
    });
  }

  async function createDefaultPlans() {
    setPlanMessage(null);
    setSavingPlan(true);
    try {
      const res = await apiClient<ApiResponse<{ created: number; updated: number }>>('/admin/billing/plans/defaults', {
        method: 'POST',
        body: JSON.stringify({ sync_existing: false }),
      });
      await fetchData();
      setPlanMessage(`Đã tạo ${res.data.created} gói mẫu. ${res.data.updated ? `Đã cập nhật ${res.data.updated} gói.` : ''}`.trim());
    } catch (err) {
      setPlanMessage(err instanceof Error ? err.message : 'Không thể tạo gói mẫu');
    } finally {
      setSavingPlan(false);
    }
  }

  async function savePlan() {
    if (!planDraft) return;
    const price = Number(planDraft.price_vnd);
    const trialDays = Number(planDraft.trial_days);
    if (!planDraft.plan_id.trim() || !planDraft.name.trim()) {
      setPlanMessage('Nhập mã gói và tên gói trước khi lưu.');
      return;
    }
    if (!Number.isInteger(price) || price < 0 || !Number.isInteger(trialDays) || trialDays < 0) {
      setPlanMessage('Giá và số ngày dùng thử phải là số nguyên không âm.');
      return;
    }

    const payload = {
      plan_id: planDraft.plan_id.trim(),
      name: planDraft.name.trim(),
      description: planDraft.description.trim(),
      price_vnd: price,
      billing_interval: planDraft.billing_interval,
      trial_days: trialDays,
      is_active: planDraft.is_active,
      metadata: {
        badge: planDraft.badge.trim() || undefined,
        recommended: planDraft.recommended,
      },
      entitlements: planDraft.entitlements.map((item) => ({
        feature: item.feature,
        limit: item.limit.trim() === '' ? null : Number(item.limit),
        period: item.period === '' ? null : item.period,
      })),
    };

    if (payload.entitlements.some((item) => item.limit !== null && (!Number.isInteger(item.limit) || item.limit < 0))) {
      setPlanMessage('Hạn mức tính năng phải là số nguyên không âm hoặc để trống cho không giới hạn.');
      return;
    }

    setSavingPlan(true);
    setPlanMessage(null);
    try {
      await apiClient<ApiResponse<PlanSummary>>(
        editingPlanId
          ? `/admin/billing/plans/${encodeURIComponent(editingPlanId)}`
          : '/admin/billing/plans',
        {
          method: editingPlanId ? 'PUT' : 'POST',
          body: JSON.stringify(payload),
        },
      );
      await fetchData();
      setPlanMessage(editingPlanId ? 'Đã cập nhật gói dịch vụ.' : 'Đã tạo gói dịch vụ.');
      setPlanDraft(null);
      setEditingPlanId(null);
    } catch (err) {
      setPlanMessage(err instanceof Error ? err.message : 'Không thể lưu gói dịch vụ');
    } finally {
      setSavingPlan(false);
    }
  }

  async function saveGatewayConfig(nextConfig: GatewayConfig) {
    setGatewayConfig(nextConfig);
    const res = await apiClient<ApiResponse<GatewayConfig>>('/admin/billing/gateways/config', {
      method: 'PUT',
      body: JSON.stringify(nextConfig),
    });
    setGatewayConfig(res.data);
  }

  function updateGateway(gatewayName: string, patch: Partial<GatewayConfig['gateways'][number]>) {
    if (!gatewayConfig) return;
    void saveGatewayConfig({
      ...gatewayConfig,
      gateways: gatewayConfig.gateways.map((gateway) =>
        gateway.gateway === gatewayName ? { ...gateway, ...patch } : gateway,
      ),
    });
  }

  function updateCredentialDraft(
    gatewayName: PaymentGatewayName,
    environment: GatewayEnvironment,
    fieldKey: string,
    value: string,
  ) {
    setCredentialDrafts((current) => ({
      ...current,
      [gatewayName]: {
        ...current[gatewayName],
        [environment]: {
          ...(current[gatewayName]?.[environment] ?? {}),
          [fieldKey]: value,
        },
      },
    }));
  }

  async function saveGatewayCredentials(gatewayName: PaymentGatewayName, environment: GatewayEnvironment) {
    const draft = credentialDrafts[gatewayName]?.[environment] ?? {};
    const credentials = Object.fromEntries(
      Object.entries(draft).filter(([, value]) => value.trim().length > 0),
    );

    if (Object.keys(credentials).length === 0) {
      setCredentialMessage('Nhập ít nhất một giá trị mới trước khi lưu.');
      return;
    }

    const savingKey = `${gatewayName}:${environment}`;
    setCredentialSavingKey(savingKey);
    setCredentialMessage(null);
    try {
      const res = await apiClient<ApiResponse<GatewayConfig>>(`/admin/billing/gateways/${gatewayName}/credentials/${environment}`, {
        method: 'PUT',
        body: JSON.stringify({ credentials }),
      });
      setGatewayConfig(res.data);
      setCredentialDrafts((current) => ({
        ...current,
        [gatewayName]: {
          ...current[gatewayName],
          [environment]: {},
        },
      }));
      setCredentialMessage(`Đã lưu credentials ${environment} cho ${gatewayName.toUpperCase()}.`);
    } catch (err) {
      setCredentialMessage(err instanceof Error ? err.message : 'Không thể lưu credentials');
    } finally {
      setCredentialSavingKey(null);
    }
  }

  async function testGateway(gatewayName: PaymentGatewayName) {
    setCredentialSavingKey(`${gatewayName}:test`);
    setCredentialMessage(null);
    try {
      const res = await apiClient<ApiResponse<{ configured: boolean; missing_credentials: string[] }>>(`/admin/billing/gateways/${gatewayName}/test`, {
        method: 'POST',
      });
      setCredentialMessage(res.data.configured
        ? `${gatewayName.toUpperCase()} đã đủ thông tin chứng thực.`
        : `${gatewayName.toUpperCase()} còn thiếu: ${res.data.missing_credentials.join(', ') || 'credentials'}`);
    } catch (err) {
      setCredentialMessage(err instanceof Error ? err.message : 'Không thể kiểm tra gateway');
    } finally {
      setCredentialSavingKey(null);
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-gray-900">Thanh toán & Doanh thu 💰</h1>
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-800 border-t-transparent" />
        </div>
      </div>
    );
  }

  if (error && !metrics) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-gray-900">Thanh toán & Doanh thu 💰</h1>
        <div className="rounded-2xl bg-red-50 p-6 text-center text-red-600">{error}</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Thanh toán & Doanh thu 💰</h1>
        <button
          onClick={fetchData}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-4 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Làm mới
        </button>
      </div>

      {/* Metrics */}
      {metrics && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <MetricCard
            label="MRR"
            value={formatVND(metrics.mrr_vnd)}
            icon={TrendingUp}
            color="bg-blue-600"
          />
          <MetricCard
            label="Tổng doanh thu"
            value={formatVND(metrics.total_revenue_vnd)}
            icon={DollarSign}
            color="bg-green-600"
          />
          <MetricCard
            label="Đăng ký hoạt động"
            value={String(metrics.active_subscriptions)}
            icon={Users}
            color="bg-purple-600"
            subtext={`+${metrics.new_subs_this_month} mới tháng này`}
          />
          <MetricCard
            label="ARPU"
            value={formatVND(metrics.arpu_vnd)}
            icon={CreditCard}
            color="bg-indigo-600"
          />
          <MetricCard
            label="Churn tháng này"
            value={String(metrics.churned_this_month)}
            icon={TrendingDown}
            color="bg-red-500"
          />
          <MetricCard
            label="Mới tháng này"
            value={String(metrics.new_subs_this_month)}
            icon={TrendingUp}
            color="bg-emerald-600"
          />
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex gap-6">
          {(['overview', 'transactions', 'plans', 'gateways'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab === 'overview' && 'Tổng quan'}
              {tab === 'transactions' && `Giao dịch (${transactions.length})`}
              {tab === 'plans' && `Gói dịch vụ (${plans.length})`}
              {tab === 'gateways' && 'Cổng thanh toán'}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && metrics && (
        <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
          <h2 className="text-base font-semibold text-gray-900 mb-4">Tóm tắt tháng</h2>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="p-3 rounded-lg bg-gray-50">
              <p className="text-gray-500">MRR hiện tại</p>
              <p className="text-lg font-bold text-gray-900">{formatVND(metrics.mrr_vnd)}</p>
            </div>
            <div className="p-3 rounded-lg bg-gray-50">
              <p className="text-gray-500">Đăng ký hoạt động</p>
              <p className="text-lg font-bold text-gray-900">{metrics.active_subscriptions}</p>
            </div>
            <div className="p-3 rounded-lg bg-gray-50">
              <p className="text-gray-500">Tỷ lệ rời bỏ</p>
              <p className="text-lg font-bold text-gray-900">
                {metrics.active_subscriptions > 0
                  ? `${((metrics.churned_this_month / metrics.active_subscriptions) * 100).toFixed(1)}%`
                  : '0%'}
              </p>
            </div>
            <div className="p-3 rounded-lg bg-gray-50">
              <p className="text-gray-500">ARPU</p>
              <p className="text-lg font-bold text-gray-900">{formatVND(metrics.arpu_vnd)}</p>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'transactions' && (
        <div className="rounded-2xl bg-white shadow-sm ring-1 ring-gray-100 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 text-xs uppercase text-gray-500">
              <tr>
                <th className="px-4 py-3">Mã GD</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Số tiền</th>
                <th className="px-4 py-3">Gateway</th>
                <th className="px-4 py-3">Trạng thái</th>
                <th className="px-4 py-3">Ngày tạo</th>
                <th className="px-4 py-3">Ngày TT</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {transactions.map((tx) => (
                <tr key={tx.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono text-xs text-gray-700">{String(tx.intent_id ?? '').slice(0, 12)}...</td>
                  <td className="px-4 py-3 text-gray-600">{tx.user_email}</td>
                  <td className="px-4 py-3 font-medium text-gray-900">{formatVND(tx.amount_vnd)}</td>
                  <td className="px-4 py-3 text-xs uppercase text-gray-500">{tx.gateway}</td>
                  <td className="px-4 py-3"><StatusBadge status={tx.status} /></td>
                  <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">{formatDate(tx.created_at)}</td>
                  <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">{formatDate(tx.paid_at)}</td>
                </tr>
              ))}
              {transactions.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-gray-400">
                    Chưa có giao dịch nào
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === 'plans' && (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-gray-900">Gói dịch vụ và hạn mức chức năng</h2>
              <p className="text-sm text-gray-500">Mỗi gói có thể bật/tắt feature và đặt hạn mức theo ngày, tháng hoặc năm.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void createDefaultPlans()}
                disabled={savingPlan}
                className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
              >
                <Wand2 className="h-4 w-4" />
                Tạo gói mẫu
              </button>
              <button
                type="button"
                onClick={startCreatePlan}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                <Plus className="h-4 w-4" />
                Gói mới
              </button>
            </div>
          </div>

          {planMessage && (
            <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm font-medium text-blue-700">
              {planMessage}
            </div>
          )}

          {planDraft && (
            <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
              <div className="mb-5 flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-lg font-bold text-gray-900">{editingPlanId ? 'Sửa gói dịch vụ' : 'Tạo gói dịch vụ'}</h3>
                  <p className="text-sm text-gray-500">Thiết lập giá, chu kỳ và giới hạn từng chức năng cho gói.</p>
                </div>
                <button
                  type="button"
                  onClick={() => { setPlanDraft(null); setEditingPlanId(null); }}
                  className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50"
                >
                  Đóng
                </button>
              </div>

              <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                <label className="space-y-1.5 text-sm">
                  <span className="font-medium text-gray-700">Mã gói</span>
                  <input
                    value={planDraft.plan_id}
                    onChange={(event) => updatePlanDraft({ plan_id: event.target.value })}
                    disabled={Boolean(editingPlanId)}
                    placeholder="mathai_standard_monthly"
                    className="w-full rounded-xl border border-gray-200 px-3 py-2 text-gray-900 shadow-sm disabled:bg-gray-50 disabled:text-gray-500"
                  />
                </label>
                <label className="space-y-1.5 text-sm">
                  <span className="font-medium text-gray-700">Tên gói</span>
                  <input
                    value={planDraft.name}
                    onChange={(event) => updatePlanDraft({ name: event.target.value })}
                    placeholder="Standard"
                    className="w-full rounded-xl border border-gray-200 px-3 py-2 text-gray-900 shadow-sm"
                  />
                </label>
                <label className="space-y-1.5 text-sm">
                  <span className="font-medium text-gray-700">Nhãn hiển thị</span>
                  <input
                    value={planDraft.badge}
                    onChange={(event) => updatePlanDraft({ badge: event.target.value })}
                    placeholder="Phổ biến nhất"
                    className="w-full rounded-xl border border-gray-200 px-3 py-2 text-gray-900 shadow-sm"
                  />
                </label>
                <label className="space-y-1.5 text-sm lg:col-span-3">
                  <span className="font-medium text-gray-700">Mô tả</span>
                  <textarea
                    value={planDraft.description}
                    onChange={(event) => updatePlanDraft({ description: event.target.value })}
                    rows={2}
                    className="w-full rounded-xl border border-gray-200 px-3 py-2 text-gray-900 shadow-sm"
                  />
                </label>
                <label className="space-y-1.5 text-sm">
                  <span className="font-medium text-gray-700">Giá VND</span>
                  <input
                    type="number"
                    min={0}
                    value={planDraft.price_vnd}
                    onChange={(event) => updatePlanDraft({ price_vnd: event.target.value })}
                    className="w-full rounded-xl border border-gray-200 px-3 py-2 text-gray-900 shadow-sm"
                  />
                </label>
                <label className="space-y-1.5 text-sm">
                  <span className="font-medium text-gray-700">Chu kỳ</span>
                  <select
                    value={planDraft.billing_interval}
                    onChange={(event) => updatePlanDraft({ billing_interval: event.target.value as PlanDraft['billing_interval'] })}
                    className="w-full rounded-xl border border-gray-200 px-3 py-2 text-gray-900 shadow-sm"
                  >
                    <option value="month">Tháng</option>
                    <option value="quarter">Quý</option>
                    <option value="year">Năm</option>
                    <option value="one_time">Một lần</option>
                  </select>
                </label>
                <label className="space-y-1.5 text-sm">
                  <span className="font-medium text-gray-700">Dùng thử (ngày)</span>
                  <input
                    type="number"
                    min={0}
                    value={planDraft.trial_days}
                    onChange={(event) => updatePlanDraft({ trial_days: event.target.value })}
                    className="w-full rounded-xl border border-gray-200 px-3 py-2 text-gray-900 shadow-sm"
                  />
                </label>
                <label className="flex items-center gap-2 rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={planDraft.is_active}
                    onChange={(event) => updatePlanDraft({ is_active: event.target.checked })}
                  />
                  Gói đang hoạt động
                </label>
                <label className="flex items-center gap-2 rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={planDraft.recommended}
                    onChange={(event) => updatePlanDraft({ recommended: event.target.checked })}
                  />
                  Đánh dấu gói khuyến nghị
                </label>
              </div>

              <div className="mt-6 overflow-hidden rounded-2xl border border-gray-100">
                <div className="grid grid-cols-[minmax(220px,1fr)_150px_150px] bg-gray-50 px-4 py-3 text-xs font-semibold uppercase text-gray-500">
                  <div>Chức năng</div>
                  <div>Hạn mức</div>
                  <div>Chu kỳ</div>
                </div>
                <div className="divide-y divide-gray-100">
                  {featureCatalog.map((feature) => {
                    const entitlement = planDraft.entitlements.find((item) => item.feature === feature.feature);
                    const enabled = Boolean(entitlement);
                    return (
                      <div key={feature.feature} className="grid grid-cols-[minmax(220px,1fr)_150px_150px] gap-3 px-4 py-3 text-sm">
                        <label className="flex items-start gap-3">
                          <input
                            type="checkbox"
                            checked={enabled}
                            onChange={(event) => toggleDraftEntitlement(feature.feature, event.target.checked)}
                            className="mt-1"
                          />
                          <span>
                            <span className="block font-semibold text-gray-900">{feature.label}</span>
                            <span className="block text-xs text-gray-500">{feature.description}</span>
                          </span>
                        </label>
                        <input
                          type="number"
                          min={0}
                          disabled={!enabled}
                          value={entitlement?.limit ?? ''}
                          onChange={(event) => updateDraftEntitlement(feature.feature, { limit: event.target.value })}
                          placeholder="Trống = không giới hạn"
                          className="rounded-lg border border-gray-200 px-3 py-2 disabled:bg-gray-50 disabled:text-gray-400"
                        />
                        <select
                          disabled={!enabled}
                          value={entitlement?.period ?? ''}
                          onChange={(event) => updateDraftEntitlement(feature.feature, { period: event.target.value as PlanDraft['entitlements'][number]['period'] })}
                          className="rounded-lg border border-gray-200 px-3 py-2 disabled:bg-gray-50 disabled:text-gray-400"
                        >
                          <option value="">Không chu kỳ</option>
                          <option value="day">Theo ngày</option>
                          <option value="month">Theo tháng</option>
                          <option value="year">Theo năm</option>
                        </select>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="mt-5 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => { setPlanDraft(null); setEditingPlanId(null); }}
                  className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
                >
                  Hủy
                </button>
                <button
                  type="button"
                  onClick={() => void savePlan()}
                  disabled={savingPlan}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
                >
                  {savingPlan ? 'Đang lưu...' : 'Lưu gói dịch vụ'}
                </button>
              </div>
            </div>
          )}

          <div className="rounded-2xl bg-white shadow-sm ring-1 ring-gray-100 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                <tr>
                  <th className="px-4 py-3">Tên gói</th>
                  <th className="px-4 py-3">Giá</th>
                  <th className="px-4 py-3">Hạn mức chức năng</th>
                  <th className="px-4 py-3">Subscribers</th>
                  <th className="px-4 py-3">Trạng thái</th>
                  <th className="px-4 py-3">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {plans.map((plan) => (
                  <tr key={plan.plan_id} className="hover:bg-gray-50 align-top">
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-gray-900">{plan.name}</span>
                        {typeof plan.metadata?.badge === 'string' && plan.metadata.badge && (
                          <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700">{plan.metadata.badge}</span>
                        )}
                      </div>
                      <p className="mt-1 max-w-xs text-xs text-gray-500">{plan.description}</p>
                      <p className="mt-1 font-mono text-[11px] text-gray-400">{plan.plan_id}</p>
                    </td>
                    <td className="px-4 py-4 text-gray-900">
                      <div className="font-semibold">{formatVND(plan.price_vnd)}</div>
                      <div className="text-xs capitalize text-gray-500">{plan.billing_interval}</div>
                      {plan.trial_days > 0 && <div className="text-xs text-green-600">Dùng thử {plan.trial_days} ngày</div>}
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex max-w-md flex-wrap gap-1.5">
                        {plan.entitlements.map((entitlement) => (
                          <span key={entitlement.feature} className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700">
                            {entitlement.label ?? entitlement.feature}: {entitlement.limit_label ?? (entitlement.limit === null ? 'Không giới hạn' : entitlement.limit)}
                          </span>
                        ))}
                        {plan.entitlements.length === 0 && <span className="text-xs text-gray-400">Chưa đặt hạn mức</span>}
                      </div>
                    </td>
                    <td className="px-4 py-4 text-gray-900 font-medium">{plan.active_subscribers}</td>
                    <td className="px-4 py-4">
                      {plan.is_active ? (
                        <span className="inline-flex items-center rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">Hoạt động</span>
                      ) : (
                        <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">Không hoạt động</span>
                      )}
                    </td>
                    <td className="px-4 py-4">
                      <button
                        type="button"
                        onClick={() => startEditPlan(plan)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        Sửa
                      </button>
                    </td>
                  </tr>
                ))}
                {plans.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-gray-400">
                      Chưa có gói nào
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'gateways' && gatewayConfig && (
        <div className="space-y-4">
          <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
            <h2 className="text-base font-semibold text-gray-900 mb-4">Cấu hình điều phối cổng thanh toán</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
              <label className="space-y-1">
                <span className="text-gray-500">Chế độ checkout</span>
                <select
                  value={gatewayConfig.mode}
                  onChange={(event) => void saveGatewayConfig({ ...gatewayConfig, mode: event.target.value as GatewayConfig['mode'] })}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2"
                >
                  <option value="user_select">Người dùng tự chọn</option>
                  <option value="auto_priority">Ưu tiên + fallback</option>
                </select>
              </label>
              <label className="space-y-1">
                <span className="text-gray-500">Môi trường</span>
                <select
                  value={gatewayConfig.environment}
                  onChange={(event) => void saveGatewayConfig({ ...gatewayConfig, environment: event.target.value as GatewayConfig['environment'] })}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2"
                >
                  <option value="sandbox">Sandbox</option>
                  <option value="production">Production</option>
                </select>
              </label>
              <label className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2">
                <input
                  type="checkbox"
                  checked={gatewayConfig.fallback_enabled}
                  onChange={(event) => void saveGatewayConfig({ ...gatewayConfig, fallback_enabled: event.target.checked })}
                />
                Bật fallback khi gateway ưu tiên lỗi
              </label>
            </div>
          </div>

          <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-100">
            <div className="flex flex-wrap gap-2">
              {gatewayConfig.gateways.map((gateway) => (
                <button
                  key={gateway.gateway}
                  type="button"
                  onClick={() => setActiveGatewayName(gateway.gateway)}
                  className={`rounded-full border px-4 py-2 text-sm font-semibold transition-colors ${activeGatewayName === gateway.gateway ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'}`}
                >
                  {gateway.display_name} {gateway.configured ? '- đã đủ' : `- thiếu ${gateway.missing_credentials.length}`}
                </button>
              ))}
            </div>
          </div>

          {(() => {
            const gateway = gatewayConfig.gateways.find((item) => item.gateway === activeGatewayName) ?? gatewayConfig.gateways[0];
            if (!gateway) return null;

            return (
              <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100 space-y-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <h2 className="text-lg font-bold text-slate-900">{gateway.display_name} credentials</h2>
                    <p className="mt-1 text-sm text-slate-600">
                      Nhập credentials cho sandbox và production riêng. Giá trị đã lưu được mã hóa ở backend và không hiển thị lại trên UI.
                    </p>
                  </div>
                  <div className={`rounded-full px-3 py-1 text-xs font-semibold ${gateway.configured ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                    {gateway.configured ? 'Đã cấu hình đủ' : `Thiếu: ${gateway.missing_credentials.join(', ') || 'credentials'}`}
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                  <label className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={gateway.enabled}
                      onChange={(event) => updateGateway(gateway.gateway, { enabled: event.target.checked })}
                    />
                    Bật gateway này
                  </label>
                  <label className="block text-sm space-y-1">
                    <span className="font-medium text-slate-600">Thứ tự ưu tiên</span>
                    <input
                      type="number"
                      min={1}
                      value={gateway.priority}
                      onChange={(event) => updateGateway(gateway.gateway, { priority: Number(event.target.value) })}
                      className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => void testGateway(gateway.gateway)}
                    disabled={credentialSavingKey === `${gateway.gateway}:test`}
                    className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-60"
                  >
                    {credentialSavingKey === `${gateway.gateway}:test` ? 'Đang kiểm tra...' : 'Kiểm tra kết nối'}
                  </button>
                </div>

                <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
                  {(['sandbox', 'production'] as const).map((environment) => (
                    <div
                      key={environment}
                      className={`rounded-2xl border p-5 ${environment === 'production' ? 'border-orange-200 bg-orange-50/70' : 'border-slate-200 bg-slate-50'}`}
                    >
                      <div className="mb-4 flex items-center justify-between gap-3">
                        <div>
                          <h3 className="text-base font-bold capitalize text-slate-900">{environment}</h3>
                          <p className="text-xs text-slate-500">
                            {environment === gatewayConfig.environment ? 'Môi trường đang dùng cho checkout' : 'Lưu sẵn để chuyển môi trường khi cần'}
                          </p>
                        </div>
                        {environment === gatewayConfig.environment && (
                          <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">Đang dùng</span>
                        )}
                      </div>

                      <div className="space-y-3">
                        {gateway.fields.map((field) => {
                          const hasValue = environment === 'sandbox' ? field.sandbox_has_value : field.production_has_value;
                          const draftValue = credentialDrafts[gateway.gateway]?.[environment]?.[field.key] ?? '';

                          return (
                            <label key={`${environment}:${field.key}`} className="block space-y-1.5">
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-sm font-medium text-slate-700">
                                  {field.label} {field.required && <span className="text-red-500">*</span>}
                                </span>
                                <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${hasValue ? 'bg-emerald-50 text-emerald-700' : field.has_default && environment === 'sandbox' ? 'bg-blue-50 text-blue-700' : 'bg-slate-100 text-slate-500'}`}>
                                  {hasValue ? 'Đã lưu' : field.has_default && environment === 'sandbox' ? 'Có mặc định' : 'Chưa có'}
                                </span>
                              </div>
                              <input
                                type={field.secret ? 'password' : 'text'}
                                value={draftValue}
                                onChange={(event) => updateCredentialDraft(gateway.gateway, environment, field.key, event.target.value)}
                                placeholder={hasValue ? 'Đã lưu - nhập giá trị mới để thay đổi' : `Nhập ${field.label}`}
                                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                              />
                              <p className="text-[11px] text-slate-500">Env fallback: {field.env_key}</p>
                            </label>
                          );
                        })}
                      </div>

                      <button
                        type="button"
                        onClick={() => void saveGatewayCredentials(gateway.gateway, environment)}
                        disabled={credentialSavingKey === `${gateway.gateway}:${environment}`}
                        className="mt-5 w-full rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-60"
                      >
                        {credentialSavingKey === `${gateway.gateway}:${environment}` ? 'Đang lưu...' : `Lưu ${environment} credentials`}
                      </button>
                    </div>
                  ))}
                </div>

                {credentialMessage && (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700">
                    {credentialMessage}
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      )}


    </div>
  );
}
