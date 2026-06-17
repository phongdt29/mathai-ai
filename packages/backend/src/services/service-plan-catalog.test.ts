import { test } from "node:test";
import assert from "node:assert/strict";

import {
	DEFAULT_SERVICE_PLANS,
	normalizePlanEntitlements,
	serializeServicePlan,
} from "./service-plan-catalog";

test("default service plans define visible feature limits", () => {
	assert.equal(DEFAULT_SERVICE_PLANS.length, 3);
	for (const plan of DEFAULT_SERVICE_PLANS) {
		assert.ok(plan.plan_id.startsWith("mathai_"));
		assert.ok(plan.price_vnd > 0);
		assert.ok(plan.entitlements.length >= 4);
	}
});

test("normalizePlanEntitlements accepts empty limit as unlimited", () => {
	const entitlements = normalizePlanEntitlements([
		{ feature: "ai_solver_requests", limit: "80", period: "day" },
		{ feature: "advanced_analytics", limit: "", period: "" },
	]);

	assert.deepEqual(entitlements, [
		{ feature: "ai_solver_requests", limit: 80, period: "day" },
		{ feature: "advanced_analytics", limit: null, period: null },
	]);
});

test("serializeServicePlan returns Vietnamese limit labels", () => {
	const plan = {
		plan_id: "mathai_test_monthly",
		name: "Test",
		description: "Test plan",
		price_vnd: 99000,
		currency: "VND",
		billing_interval: "month",
		trial_days: 7,
		entitlements: [
			{ feature: "ai_solver_requests", limit: 80, period: "day" },
			{ feature: "advanced_analytics", limit: null, period: null },
		],
		is_active: true,
		metadata: { badge: "Test" },
		createdAt: new Date("2026-01-01T00:00:00.000Z"),
		updatedAt: new Date("2026-01-01T00:00:00.000Z"),
	} as any;

	const serialized = serializeServicePlan(plan, 2);
	assert.equal(serialized.active_subscribers, 2);
	assert.equal(serialized.entitlements[0]?.label, "AI Solver");
	assert.equal(serialized.entitlements[0]?.limit_label, "80 lượt/ngày");
	assert.equal(serialized.entitlements[1]?.limit_label, "Không giới hạn");
});
