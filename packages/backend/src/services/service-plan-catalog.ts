import type { BillingInterval, IPlan, IPlanEntitlement } from "../models/plan.model";
import { planRepository } from "../models/plan.model";

type EntitlementPeriod = IPlanEntitlement["period"];

export interface ServiceFeatureDefinition {
	feature: string;
	label: string;
	description: string;
	unit: string;
}

export interface SerializedPlanEntitlement extends IPlanEntitlement {
	label: string;
	description: string;
	unit: string;
	limit_label: string;
}

export interface SerializedPlan {
	plan_id: string;
	name: string;
	description: string;
	price_vnd: number;
	currency: "VND";
	billing_interval: BillingInterval;
	trial_days: number;
	entitlements: SerializedPlanEntitlement[];
	is_active: boolean;
	metadata: Record<string, unknown>;
	active_subscribers?: number;
	createdAt?: string;
	updatedAt?: string;
}

interface DefaultServicePlanInput {
	plan_id: string;
	name: string;
	description: string;
	price_vnd: number;
	billing_interval: BillingInterval;
	trial_days: number;
	entitlements: IPlanEntitlement[];
	is_active: boolean;
	metadata: Record<string, unknown>;
}

export const SERVICE_FEATURE_CATALOG: ServiceFeatureDefinition[] = [
	{
		feature: "ai_solver_requests",
		label: "AI Solver",
		description: "Số lượt xin gợi ý hoặc lời giải AI trong ngày.",
		unit: "lượt",
	},
	{
		feature: "image_ocr",
		label: "OCR ảnh bài toán",
		description: "Số lượt đọc đề toán từ ảnh trong ngày.",
		unit: "ảnh",
	},
	{
		feature: "curriculum_generation",
		label: "Tạo lộ trình AI",
		description: "Số lần tạo hoặc tái tạo lộ trình học cá nhân.",
		unit: "lộ trình",
	},
	{
		feature: "lesson_practice",
		label: "Bài luyện tập",
		description: "Số bài học/lượt luyện tập được mở theo gói.",
		unit: "bài",
	},
	{
		feature: "parent_reports",
		label: "Báo cáo phụ huynh",
		description: "Báo cáo tiến độ học tập gửi cho phụ huynh.",
		unit: "báo cáo",
	},
	{
		feature: "advanced_analytics",
		label: "Phân tích nâng cao",
		description: "Dashboard phân tích năng lực, tiến độ và rủi ro học tập.",
		unit: "tính năng",
	},
	{
		feature: "content_library_exports",
		label: "Xuất học liệu",
		description: "Số lượt xuất học liệu hoặc đề luyện từ thư viện nội dung.",
		unit: "lượt xuất",
	},
	{
		feature: "priority_support",
		label: "Hỗ trợ ưu tiên",
		description: "Yêu cầu hỗ trợ được ưu tiên xử lý.",
		unit: "yêu cầu",
	},
	{
		feature: "ai_solver_unlimited",
		label: "AI Solver không giới hạn",
		description: "Không giới hạn lượt dùng AI Solver trong phạm vi chính sách sử dụng hợp lý.",
		unit: "tính năng",
	},
];

export const DEFAULT_SERVICE_PLANS: DefaultServicePlanInput[] = [
	{
		plan_id: "mathai_starter_monthly",
		name: "Starter",
		description: "Dành cho học sinh mới bắt đầu học cùng MathAI.",
		price_vnd: 49000,
		billing_interval: "month",
		trial_days: 7,
		is_active: true,
		metadata: { sort_order: 10, badge: "Tiết kiệm", audience: "Học sinh cá nhân" },
		entitlements: [
			{ feature: "ai_solver_requests", limit: 30, period: "day" },
			{ feature: "image_ocr", limit: 10, period: "day" },
			{ feature: "curriculum_generation", limit: 3, period: "month" },
			{ feature: "lesson_practice", limit: 120, period: "month" },
		],
	},
	{
		plan_id: "mathai_standard_monthly",
		name: "Standard",
		description: "Gói cân bằng cho học sinh học đều mỗi ngày.",
		price_vnd: 99000,
		billing_interval: "month",
		trial_days: 7,
		is_active: true,
		metadata: { sort_order: 20, recommended: true, badge: "Phổ biến nhất", audience: "Học hằng ngày" },
		entitlements: [
			{ feature: "ai_solver_requests", limit: 80, period: "day" },
			{ feature: "image_ocr", limit: 30, period: "day" },
			{ feature: "curriculum_generation", limit: 8, period: "month" },
			{ feature: "lesson_practice", limit: 350, period: "month" },
			{ feature: "parent_reports", limit: 4, period: "month" },
		],
	},
	{
		plan_id: "mathai_premium_monthly",
		name: "Premium",
		description: "Mở toàn bộ năng lực AI, phân tích nâng cao và hỗ trợ ưu tiên.",
		price_vnd: 199000,
		billing_interval: "month",
		trial_days: 7,
		is_active: true,
		metadata: { sort_order: 30, badge: "Đầy đủ", audience: "Học tăng tốc" },
		entitlements: [
			{ feature: "ai_solver_unlimited", limit: null, period: null },
			{ feature: "image_ocr", limit: 120, period: "day" },
			{ feature: "curriculum_generation", limit: 30, period: "month" },
			{ feature: "lesson_practice", limit: null, period: null },
			{ feature: "advanced_analytics", limit: null, period: null },
			{ feature: "content_library_exports", limit: 50, period: "month" },
			{ feature: "priority_support", limit: 5, period: "month" },
		],
	},
];

const featureByKey = new Map(
	SERVICE_FEATURE_CATALOG.map((item) => [item.feature, item]),
);

export function normalizePlanEntitlements(input: unknown): IPlanEntitlement[] {
	if (input === undefined || input === null) return [];
	if (!Array.isArray(input)) {
		throw new Error("entitlements phải là một danh sách");
	}

	return input.map((item, index) => {
		if (!item || typeof item !== "object") {
			throw new Error(`entitlements[${index}] không hợp lệ`);
		}
		const raw = item as Record<string, unknown>;
		const feature = typeof raw.feature === "string" ? raw.feature.trim() : "";
		if (!/^[a-z0-9_:-]{2,80}$/.test(feature)) {
			throw new Error(`entitlements[${index}].feature không hợp lệ`);
		}

		let limit: number | null = null;
		if (raw.limit !== null && raw.limit !== undefined && raw.limit !== "") {
			const numericLimit = Number(raw.limit);
			if (!Number.isInteger(numericLimit) || numericLimit < 0) {
				throw new Error(`entitlements[${index}].limit phải là số nguyên không âm hoặc null`);
			}
			limit = numericLimit;
		}

		const period = normalizePeriod(raw.period);
		return { feature, limit, period };
	});
}

export function serializeServicePlan(
	plan: IPlan,
	activeSubscribers?: number,
): SerializedPlan {
	const metadata = normalizeMetadata(plan.metadata);
	return {
		plan_id: plan.plan_id,
		name: plan.name,
		description: plan.description,
		price_vnd: plan.price_vnd,
		currency: plan.currency,
		billing_interval: plan.billing_interval,
		trial_days: plan.trial_days,
		entitlements: plan.entitlements.map(serializeEntitlement),
		is_active: plan.is_active,
		metadata,
		...(activeSubscribers !== undefined ? { active_subscribers: activeSubscribers } : {}),
		createdAt: plan.createdAt?.toISOString?.(),
		updatedAt: plan.updatedAt?.toISOString?.(),
	};
}

export async function ensureDefaultServicePlans(options: { syncExisting?: boolean } = {}) {
	let created = 0;
	let updated = 0;

	for (const defaultPlan of DEFAULT_SERVICE_PLANS) {
		const existing = await planRepository.findByPlanId(defaultPlan.plan_id);
		if (!existing) {
			await planRepository.create(defaultPlan as Partial<IPlan>);
			created++;
			continue;
		}

		if (options.syncExisting) {
			await planRepository.update(existing._id.toString(), defaultPlan as Partial<IPlan>);
			updated++;
		}
	}

	return { created, updated };
}

export function featureCatalogResponse() {
	return SERVICE_FEATURE_CATALOG.map((feature) => ({ ...feature }));
}

function serializeEntitlement(entitlement: IPlanEntitlement): SerializedPlanEntitlement {
	const definition = featureByKey.get(entitlement.feature) ?? {
		feature: entitlement.feature,
		label: entitlement.feature,
		description: "Tính năng tuỳ chỉnh",
		unit: "lượt",
	};
	return {
		feature: entitlement.feature,
		limit: entitlement.limit,
		period: entitlement.period,
		label: definition.label,
		description: definition.description,
		unit: definition.unit,
		limit_label: formatEntitlementLimit(entitlement, definition.unit),
	};
}

function formatEntitlementLimit(entitlement: IPlanEntitlement, unit: string): string {
	if (entitlement.limit === null) return "Không giới hạn";
	const period = periodLabel(entitlement.period);
	return `${entitlement.limit.toLocaleString("vi-VN")} ${unit}${period ? `/${period}` : ""}`;
}

function periodLabel(period: EntitlementPeriod): string {
	if (period === "day") return "ngày";
	if (period === "month") return "tháng";
	if (period === "year") return "năm";
	return "";
}

function normalizePeriod(value: unknown): EntitlementPeriod {
	if (value === null || value === undefined || value === "") return null;
	if (value === "day" || value === "month" || value === "year") return value;
	throw new Error("period phải là 'day', 'month', 'year' hoặc null");
}

function normalizeMetadata(value: unknown): Record<string, unknown> {
	if (!value || typeof value !== "object" || Array.isArray(value)) return {};
	return value as Record<string, unknown>;
}
