import { describe, it, test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fc from "fast-check";
import * as crypto from "node:crypto";

import {
  BillingService,
  BillingError,
  type BillingServiceDependencies,
  type CreateSubscriptionInput,
  type CancelSubscriptionInput,
} from "./billing.service";

// ── Mock Helpers ────────────────────────────────────────────────────────

function createMockObjectId(): string {
  return crypto.randomBytes(12).toString("hex");
}

function mockId(id?: string) {
  const val = id ?? createMockObjectId();
  return { toString: () => val, equals: (other: any) => other?.toString() === val };
}

// ── Mock Plan ───────────────────────────────────────────────────────────

function createMockPlan(overrides: Partial<any> = {}) {
  return {
    _id: mockId(),
    plan_id: overrides.plan_id ?? "plan_premium_monthly",
    name: overrides.name ?? "Premium Monthly",
    description: "Premium plan",
    price_vnd: overrides.price_vnd ?? 199000,
    currency: "VND",
    billing_interval: overrides.billing_interval ?? "month",
    trial_days: overrides.trial_days ?? 0,
    entitlements: overrides.entitlements ?? [
      { feature: "ai_solver_unlimited", limit: null, period: null },
      { feature: "advanced_analytics", limit: null, period: "month" },
    ],
    is_active: overrides.is_active ?? true,
    metadata: {},
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

// ── Mock Repositories ───────────────────────────────────────────────────

function createMockSubscriptionRepo() {
  const store: Map<string, any> = new Map();
  return {
    store,
    create: async (data: any) => {
      const id = createMockObjectId();
      const doc = {
        _id: mockId(id),
        ...data,
        user_id: data.user_id ?? mockId(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      store.set(id, doc);
      return doc;
    },
    findById: async (id: string) => {
      return store.get(id) ?? null;
    },
    findActiveByUserId: async (userId: string) => {
      for (const doc of store.values()) {
        if (
          doc.user_id?.toString() === userId &&
          (doc.status === "active" || doc.status === "trialing")
        ) {
          return doc;
        }
      }
      return null;
    },
    findByUserId: async (userId: string) => {
      return [...store.values()].filter(
        (d) => d.user_id?.toString() === userId,
      );
    },
    findDueForRenewal: async (now: Date) => {
      return [...store.values()].filter(
        (d) =>
          d.status === "active" &&
          d.next_billing_at &&
          d.next_billing_at <= now &&
          !d.cancel_at_period_end,
      );
    },
    findOverdueForExpiry: async (gracePeriodEnd: Date) => {
      return [...store.values()].filter(
        (d) =>
          d.status === "past_due" &&
          d.current_period_end < gracePeriodEnd,
      );
    },
    update: async (id: string, data: any) => {
      const doc = store.get(id);
      if (doc) {
        Object.assign(doc, data, { updatedAt: new Date() });
        store.set(id, doc);
      }
      return doc;
    },
  };
}

function createMockInvoiceRepo() {
  const store: Map<string, any> = new Map();
  let invoiceCounter = 0;
  return {
    store,
    create: async (data: any) => {
      const id = createMockObjectId();
      const doc = {
        _id: mockId(id),
        ...data,
        payment_transaction_ids: data.payment_transaction_ids ?? [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      store.set(id, doc);
      return doc;
    },
    findById: async (id: string) => {
      return store.get(id) ?? null;
    },
    findByUserId: async (userId: string, limit?: number) => {
      return [...store.values()]
        .filter((d) => d.user_id?.toString() === userId)
        .slice(0, limit ?? 20);
    },
    findBySubscriptionId: async (subId: string) => {
      return [...store.values()].filter(
        (d) => d.subscription_id?.toString() === subId,
      );
    },
    update: async (id: string, data: any) => {
      const doc = store.get(id);
      if (doc) {
        Object.assign(doc, data, { updatedAt: new Date() });
        store.set(id, doc);
      }
      return doc;
    },
    getLatestInvoiceNumberForMonth: async (prefix: string) => {
      invoiceCounter++;
      return null; // Always start fresh for tests
    },
  };
}

function createMockPlanRepo(plans: any[] = []) {
  return {
    findByPlanId: async (planId: string) => {
      return plans.find((p) => p.plan_id === planId) ?? null;
    },
    findActivePlans: async () => plans.filter((p) => p.is_active),
  };
}

function createMockBillingTxnRepo() {
  const store: Map<string, any> = new Map();
  return {
    store,
    create: async (data: any) => {
      const id = createMockObjectId();
      const doc = { _id: mockId(id), ...data, createdAt: new Date() };
      store.set(id, doc);
      return doc;
    },
    findByPaymentTransactionId: async (paymentTxnId: string) => {
      return [...store.values()].filter(
        (d) => d.payment_transaction_id?.toString() === paymentTxnId,
      );
    },
    findByUserId: async (userId: string) => {
      return [...store.values()].filter(
        (d) => d.user_id?.toString() === userId,
      );
    },
  };
}

function createMockEntitlementRepo() {
  const store: Map<string, any> = new Map();
  return {
    store,
    create: async (data: any) => {
      const id = createMockObjectId();
      const doc = { _id: mockId(id), ...data, createdAt: new Date(), updatedAt: new Date() };
      store.set(id, doc);
      return doc;
    },
    findBySubscriptionId: async (subId: string) => {
      return [...store.values()].filter(
        (d) => d.subscription_id?.toString() === subId,
      );
    },
    findActiveByUserId: async (userId: string) => {
      const now = new Date();
      return [...store.values()].filter(
        (d) =>
          d.user_id?.toString() === userId &&
          d.is_active === true &&
          d.starts_at <= now &&
          (d.ends_at === null || d.ends_at > now),
      );
    },
    hasActiveEntitlement: async (userId: string, feature: string) => {
      const now = new Date();
      return [...store.values()].some(
        (d) =>
          d.user_id?.toString() === userId &&
          d.feature === feature &&
          d.is_active === true &&
          d.starts_at <= now &&
          (d.ends_at === null || d.ends_at > now),
      );
    },
    deactivateBySubscriptionId: async (subId: string) => {
      let count = 0;
      for (const [key, doc] of store.entries()) {
        if (doc.subscription_id?.toString() === subId && doc.is_active) {
          doc.is_active = false;
          store.set(key, doc);
          count++;
        }
      }
      return count;
    },
    update: async (id: string, data: any) => {
      const doc = store.get(id);
      if (doc) {
        Object.assign(doc, data, { updatedAt: new Date() });
        store.set(id, doc);
      }
      return doc;
    },
  };
}

function createMockPaymentTxnRepo() {
  const store: Map<string, any> = new Map();
  return {
    store,
    findByIntentId: async (intentId: string) => {
      for (const doc of store.values()) {
        if (doc.intent_id === intentId) return doc;
      }
      return null;
    },
    create: async (data: any) => {
      const id = createMockObjectId();
      const doc = { _id: mockId(id), ...data, createdAt: new Date() };
      store.set(id, doc);
      return doc;
    },
  };
}

function createMockAuditService() {
  const logs: any[] = [];
  return {
    logs,
    record: async (input: any) => {
      logs.push(input);
      return { _id: mockId(), ...input, createdAt: new Date() };
    },
  };
}

function createMockNotificationService() {
  const sent: any[] = [];
  return {
    sent,
    send: async (input: any) => {
      sent.push(input);
      return { delivery_id: createMockObjectId(), channel_results: [] };
    },
  };
}

const silentLogger = { error: () => {}, warn: () => {}, info: () => {} };

// ── Helper: create a full billing service with mocks ────────────────────

function createTestBillingService(plans: any[] = [createMockPlan()]) {
  const subscriptionRepo = createMockSubscriptionRepo();
  const invoiceRepo = createMockInvoiceRepo();
  const planRepo = createMockPlanRepo(plans);
  const billingTxnRepo = createMockBillingTxnRepo();
  const entitlementRepo = createMockEntitlementRepo();
  const paymentTxnRepo = createMockPaymentTxnRepo();
  const auditSvc = createMockAuditService();
  const notificationSvc = createMockNotificationService();

  const service = new BillingService({
    subscriptionRepo: subscriptionRepo as any,
    invoiceRepo: invoiceRepo as any,
    planRepo: planRepo as any,
    billingTxnRepo: billingTxnRepo as any,
    entitlementRepo: entitlementRepo as any,
    paymentTxnRepo: paymentTxnRepo as any,
    auditSvc: auditSvc as any,
    notificationSvc: notificationSvc as any,
    logger: silentLogger,
    gracePeriodDays: 7,
  });

  return {
    service,
    subscriptionRepo,
    invoiceRepo,
    planRepo,
    billingTxnRepo,
    entitlementRepo,
    paymentTxnRepo,
    auditSvc,
    notificationSvc,
  };
}

// ══════════════════════════════════════════════════════════════════════════
// UNIT TESTS
// ══════════════════════════════════════════════════════════════════════════

describe("BillingService — Unit Tests", () => {
  describe("Subscription Lifecycle: start → renewal → cancel → expire", () => {
    it("should create a subscription with status=active and generate invoice", async () => {
      const plan = createMockPlan();
      const { service, subscriptionRepo, invoiceRepo } = createTestBillingService([plan]);
      const userId = createMockObjectId();

      const result = await service.createSubscription({
        user_id: userId,
        plan_id: plan.plan_id,
      });

      assert.ok(result.subscription);
      assert.ok(result.invoice);
      assert.strictEqual(result.subscription.status, "active");
      assert.strictEqual(result.subscription.plan_id, plan.plan_id);
      assert.strictEqual(result.invoice.amount_total_vnd, plan.price_vnd);
      assert.strictEqual(result.invoice.status, "open");
    });

    it("should create a trialing subscription when trial=true and plan has trial_days", async () => {
      const plan = createMockPlan({ trial_days: 14 });
      const { service } = createTestBillingService([plan]);
      const userId = createMockObjectId();

      const result = await service.createSubscription({
        user_id: userId,
        plan_id: plan.plan_id,
        trial: true,
      });

      assert.strictEqual(result.subscription.status, "trialing");
      assert.ok(result.subscription.trial_end_at);
      // Trial end should be ~14 days from now
      const diffMs = result.subscription.trial_end_at.getTime() - Date.now();
      assert.ok(diffMs > 13 * 24 * 60 * 60 * 1000); // at least 13 days
      assert.ok(diffMs < 15 * 24 * 60 * 60 * 1000); // at most 15 days
    });

    it("should throw SUBSCRIPTION_EXISTS if user already has active subscription", async () => {
      const plan = createMockPlan();
      const { service } = createTestBillingService([plan]);
      const userId = createMockObjectId();

      // Create first subscription
      await service.createSubscription({ user_id: userId, plan_id: plan.plan_id });

      // Attempt second subscription
      await assert.rejects(
        () => service.createSubscription({ user_id: userId, plan_id: plan.plan_id }),
        (err: any) => {
          assert.ok(err instanceof BillingError);
          assert.strictEqual(err.code, "SUBSCRIPTION_EXISTS");
          return true;
        },
      );
    });

    it("should throw PLAN_NOT_FOUND for non-existent plan", async () => {
      const { service } = createTestBillingService([]);
      await assert.rejects(
        () => service.createSubscription({ user_id: createMockObjectId(), plan_id: "nonexistent" }),
        (err: any) => {
          assert.ok(err instanceof BillingError);
          assert.strictEqual(err.code, "PLAN_NOT_FOUND");
          return true;
        },
      );
    });

    it("should throw PLAN_INACTIVE for inactive plan", async () => {
      const plan = createMockPlan({ is_active: false });
      const { service } = createTestBillingService([plan]);
      await assert.rejects(
        () => service.createSubscription({ user_id: createMockObjectId(), plan_id: plan.plan_id }),
        (err: any) => {
          assert.ok(err instanceof BillingError);
          assert.strictEqual(err.code, "PLAN_INACTIVE");
          return true;
        },
      );
    });

    it("should process renewals for due subscriptions", async () => {
      const plan = createMockPlan();
      const { service, subscriptionRepo, invoiceRepo } = createTestBillingService([plan]);
      const userId = createMockObjectId();

      // Create a subscription that is due for renewal
      const subId = createMockObjectId();
      const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000); // yesterday
      subscriptionRepo.store.set(subId, {
        _id: mockId(subId),
        subscription_id: "sub_renewal_test",
        user_id: mockId(userId),
        plan_id: plan.plan_id,
        status: "active",
        current_period_start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        current_period_end: pastDate,
        next_billing_at: pastDate,
        cancel_at_period_end: false,
        cancelled_at: null,
        metadata: {},
      });

      const result = await service.processRenewals();
      assert.strictEqual(result.processed, 1);
      assert.strictEqual(result.failed, 0);

      // Subscription should be set to past_due (awaiting payment)
      const updatedSub = subscriptionRepo.store.get(subId);
      assert.strictEqual(updatedSub.status, "past_due");
    });

    it("should cancel subscription immediately when at_period_end=false", async () => {
      const plan = createMockPlan();
      const { service, subscriptionRepo, entitlementRepo } = createTestBillingService([plan]);
      const userId = createMockObjectId();

      // Create active subscription
      const result = await service.createSubscription({
        user_id: userId,
        plan_id: plan.plan_id,
      });
      const subId = result.subscription._id.toString();

      const cancelled = await service.cancelSubscription(userId, {
        at_period_end: false,
        reason: "Too expensive",
      });

      assert.strictEqual(cancelled.status, "cancelled");
      assert.ok(cancelled.cancelled_at);
      assert.strictEqual(cancelled.cancel_reason, "Too expensive");
    });

    it("should keep status=active when cancel at_period_end=true", async () => {
      const plan = createMockPlan();
      const { service } = createTestBillingService([plan]);
      const userId = createMockObjectId();

      await service.createSubscription({ user_id: userId, plan_id: plan.plan_id });

      const cancelled = await service.cancelSubscription(userId, {
        at_period_end: true,
        reason: "Switching plans",
      });

      assert.strictEqual(cancelled.status, "active");
      assert.ok(cancelled.cancelled_at);
      assert.strictEqual(cancelled.cancel_at_period_end, true);
    });

    it("should expire overdue subscriptions past grace period", async () => {
      const plan = createMockPlan();
      const { service, subscriptionRepo, entitlementRepo } = createTestBillingService([plan]);
      const userId = createMockObjectId();

      // Create a past_due subscription with period_end well in the past
      const subId = createMockObjectId();
      const oldDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 days ago
      subscriptionRepo.store.set(subId, {
        _id: mockId(subId),
        subscription_id: "sub_expire_test",
        user_id: mockId(userId),
        plan_id: plan.plan_id,
        status: "past_due",
        current_period_start: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000),
        current_period_end: oldDate,
        next_billing_at: oldDate,
        cancel_at_period_end: false,
        metadata: {},
      });

      const result = await service.expireOverdue();
      assert.strictEqual(result.expired, 1);

      const updatedSub = subscriptionRepo.store.get(subId);
      assert.strictEqual(updatedSub.status, "expired");
    });
  });

  describe("activateAfterPayment — idempotency", () => {
    it("should activate subscription after successful payment", async () => {
      const plan = createMockPlan();
      const { service, subscriptionRepo, invoiceRepo, paymentTxnRepo, entitlementRepo } =
        createTestBillingService([plan]);
      const userId = createMockObjectId();

      // Create subscription + invoice
      const { subscription, invoice } = await service.createSubscription({
        user_id: userId,
        plan_id: plan.plan_id,
      });

      // Create a succeeded payment transaction
      const txnId = createMockObjectId();
      const intentId = "INTENT_ACTIVATE_TEST";
      paymentTxnRepo.store.set(txnId, {
        _id: mockId(txnId),
        intent_id: intentId,
        user_id: mockId(userId),
        amount_vnd: plan.price_vnd,
        status: "succeeded",
        paid_at: new Date(),
      });

      const activated = await service.activateAfterPayment(intentId);
      assert.strictEqual(activated.status, "active");
    });

    it("should be idempotent — second call returns same state without duplicate billing txn", async () => {
      const plan = createMockPlan();
      const { service, subscriptionRepo, invoiceRepo, paymentTxnRepo, billingTxnRepo } =
        createTestBillingService([plan]);
      const userId = createMockObjectId();

      // Create subscription + invoice
      await service.createSubscription({ user_id: userId, plan_id: plan.plan_id });

      // Create a succeeded payment transaction
      const txnId = createMockObjectId();
      const intentId = "INTENT_IDEMPOTENT_TEST";
      paymentTxnRepo.store.set(txnId, {
        _id: mockId(txnId),
        intent_id: intentId,
        user_id: mockId(userId),
        amount_vnd: plan.price_vnd,
        status: "succeeded",
        paid_at: new Date(),
      });

      // First activation
      const result1 = await service.activateAfterPayment(intentId);
      const billingTxnCountAfterFirst = billingTxnRepo.store.size;

      // Second activation (idempotent)
      const result2 = await service.activateAfterPayment(intentId);
      const billingTxnCountAfterSecond = billingTxnRepo.store.size;

      // Should return same subscription state
      assert.strictEqual(result1.status, "active");
      assert.strictEqual(result2.status, "active");

      // Should NOT create a second payment_received billing transaction
      const paymentReceivedTxns = [...billingTxnRepo.store.values()].filter(
        (t) => t.type === "payment_received",
      );
      assert.strictEqual(paymentReceivedTxns.length, 1);
    });

    it("should throw TRANSACTION_NOT_FOUND for non-existent intent", async () => {
      const { service } = createTestBillingService();
      await assert.rejects(
        () => service.activateAfterPayment("NONEXISTENT_INTENT"),
        (err: any) => {
          assert.ok(err instanceof BillingError);
          assert.strictEqual(err.code, "TRANSACTION_NOT_FOUND");
          return true;
        },
      );
    });

    it("should throw TRANSACTION_NOT_SUCCEEDED for pending transaction", async () => {
      const { service, paymentTxnRepo } = createTestBillingService();
      const txnId = createMockObjectId();
      paymentTxnRepo.store.set(txnId, {
        _id: mockId(txnId),
        intent_id: "INTENT_PENDING",
        user_id: mockId(),
        amount_vnd: 100000,
        status: "pending",
      });

      await assert.rejects(
        () => service.activateAfterPayment("INTENT_PENDING"),
        (err: any) => {
          assert.ok(err instanceof BillingError);
          assert.strictEqual(err.code, "TRANSACTION_NOT_SUCCEEDED");
          return true;
        },
      );
    });
  });

  describe("Invoice amount integrity", () => {
    it("should generate invoice where total = sum(line_items) + tax", async () => {
      const plan = createMockPlan({ price_vnd: 299000 });
      const { service, invoiceRepo } = createTestBillingService([plan]);
      const userId = createMockObjectId();

      const { invoice } = await service.createSubscription({
        user_id: userId,
        plan_id: plan.plan_id,
      });

      // Verify amount integrity
      const lineItemsSum = invoice.line_items.reduce(
        (sum: number, item: any) => sum + item.amount_vnd,
        0,
      );
      assert.strictEqual(
        invoice.amount_total_vnd,
        lineItemsSum + invoice.amount_tax_vnd,
      );
      assert.strictEqual(invoice.amount_subtotal_vnd, lineItemsSum);
    });

    it("should have invoice_number in format INV-YYYYMM-NNNNN", async () => {
      const plan = createMockPlan();
      const { service } = createTestBillingService([plan]);
      const userId = createMockObjectId();

      const { invoice } = await service.createSubscription({
        user_id: userId,
        plan_id: plan.plan_id,
      });

      assert.match(invoice.invoice_number, /^INV-\d{6}-\d{5}$/);
    });
  });

  describe("Entitlement consistency", () => {
    it("should create entitlement grants for all plan features after activation", async () => {
      const plan = createMockPlan({
        entitlements: [
          { feature: "ai_solver_unlimited", limit: null, period: null },
          { feature: "advanced_analytics", limit: null, period: "month" },
          { feature: "priority_support", limit: 10, period: "day" },
        ],
      });
      const { service, paymentTxnRepo, entitlementRepo } = createTestBillingService([plan]);
      const userId = createMockObjectId();

      // Create subscription
      await service.createSubscription({ user_id: userId, plan_id: plan.plan_id });

      // Create succeeded payment
      const txnId = createMockObjectId();
      const intentId = "INTENT_ENTITLEMENT_TEST";
      paymentTxnRepo.store.set(txnId, {
        _id: mockId(txnId),
        intent_id: intentId,
        user_id: mockId(userId),
        amount_vnd: plan.price_vnd,
        status: "succeeded",
        paid_at: new Date(),
      });

      await service.activateAfterPayment(intentId);

      // Verify all features have active entitlements
      const grants = [...entitlementRepo.store.values()];
      const activeGrants = grants.filter((g) => g.is_active === true);
      assert.strictEqual(activeGrants.length, 3);

      const features = activeGrants.map((g) => g.feature).sort();
      assert.deepStrictEqual(features, [
        "advanced_analytics",
        "ai_solver_unlimited",
        "priority_support",
      ]);
    });

    it("should deactivate entitlements when subscription is cancelled immediately", async () => {
      const plan = createMockPlan();
      const { service, entitlementRepo, paymentTxnRepo } = createTestBillingService([plan]);
      const userId = createMockObjectId();

      // Create and activate subscription
      await service.createSubscription({ user_id: userId, plan_id: plan.plan_id });
      const txnId = createMockObjectId();
      paymentTxnRepo.store.set(txnId, {
        _id: mockId(txnId),
        intent_id: "INTENT_CANCEL_ENT",
        user_id: mockId(userId),
        amount_vnd: plan.price_vnd,
        status: "succeeded",
        paid_at: new Date(),
      });
      await service.activateAfterPayment("INTENT_CANCEL_ENT");

      // Cancel immediately
      await service.cancelSubscription(userId, {
        at_period_end: false,
        reason: "Test cancel",
      });

      // All entitlements should be deactivated
      const grants = [...entitlementRepo.store.values()];
      const activeGrants = grants.filter((g) => g.is_active === true);
      assert.strictEqual(activeGrants.length, 0);
    });
  });
});


// ══════════════════════════════════════════════════════════════════════════
// PROPERTY-BASED TESTS (fast-check)
// ══════════════════════════════════════════════════════════════════════════

describe("Property-Based Tests: Billing", () => {

  /**
   * Property 6: Subscription consistency
   * If subscription.status = "active" then current_period_end > now().
   * If current_period_end <= now() and status is still "active", there is a bug
   * in the renewal job.
   *
   * **Validates: Requirements 10.1–10.15**
   */
  describe("Property 6: Subscription consistency", () => {
    test("active subscription always has current_period_end > now()", () => {
      fc.assert(
        fc.asyncProperty(
          fc.record({
            plan_price: fc.integer({ min: 10000, max: 10000000 }),
            plan_name: fc.string({ minLength: 1, maxLength: 30 }),
            billing_interval: fc.constantFrom("month", "quarter", "year"),
            trial_days: fc.constantFrom(0, 7, 14, 30),
            use_trial: fc.boolean(),
          }),
          async ({ plan_price, plan_name, billing_interval, trial_days, use_trial }) => {
            const plan = createMockPlan({
              plan_id: `plan_${crypto.randomBytes(4).toString("hex")}`,
              name: plan_name,
              price_vnd: plan_price,
              billing_interval,
              trial_days,
            });
            const { service } = createTestBillingService([plan]);
            const userId = createMockObjectId();

            const { subscription } = await service.createSubscription({
              user_id: userId,
              plan_id: plan.plan_id,
              trial: use_trial,
            });

            // Property: if status is active or trialing, period_end > now
            const now = new Date();
            if (subscription.status === "active" || subscription.status === "trialing") {
              assert.ok(
                subscription.current_period_end > now,
                `Expected current_period_end (${subscription.current_period_end.toISOString()}) > now (${now.toISOString()}) for status="${subscription.status}"`,
              );
            }
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  /**
   * Property 7: Entitlement consistency
   * If user has active subscription → all features in plan have
   * entitlement_grant.is_active = true.
   *
   * **Validates: Requirements 10.1–10.15**
   */
  describe("Property 7: Entitlement consistency", () => {
    test("active subscription grants all plan features as active entitlements", () => {
      fc.assert(
        fc.asyncProperty(
          fc.record({
            plan_price: fc.integer({ min: 10000, max: 5000000 }),
            features: fc.array(
              fc.record({
                feature: fc.stringMatching(/^[a-z_]{3,20}$/),
                limit: fc.oneof(fc.constant(null), fc.integer({ min: 1, max: 1000 })),
                period: fc.constantFrom(null, "day", "month", "year"),
              }),
              { minLength: 1, maxLength: 5 },
            ),
          }),
          async ({ plan_price, features }) => {
            // Deduplicate features by name
            const uniqueFeatures = features.filter(
              (f, i, arr) => arr.findIndex((x) => x.feature === f.feature) === i,
            );

            const plan = createMockPlan({
              plan_id: `plan_${crypto.randomBytes(4).toString("hex")}`,
              price_vnd: plan_price,
              entitlements: uniqueFeatures,
            });

            const { service, paymentTxnRepo, entitlementRepo } = createTestBillingService([plan]);
            const userId = createMockObjectId();

            // Create subscription
            await service.createSubscription({ user_id: userId, plan_id: plan.plan_id });

            // Simulate payment success
            const txnId = createMockObjectId();
            const intentId = `INTENT_${crypto.randomBytes(6).toString("hex")}`;
            paymentTxnRepo.store.set(txnId, {
              _id: mockId(txnId),
              intent_id: intentId,
              user_id: mockId(userId),
              amount_vnd: plan_price,
              status: "succeeded",
              paid_at: new Date(),
            });

            await service.activateAfterPayment(intentId);

            // Property: every feature in plan has an active entitlement grant
            const grants = [...entitlementRepo.store.values()];
            for (const planFeature of uniqueFeatures) {
              const grant = grants.find(
                (g) => g.feature === planFeature.feature && g.is_active === true,
              );
              assert.ok(
                grant,
                `Expected active entitlement for feature "${planFeature.feature}"`,
              );
            }
          },
        ),
        { numRuns: 50 },
      );
    });
  });

  /**
   * Property 8: Amount integrity
   * invoice.amount_total_vnd = sum(line_items.amount_vnd) + amount_tax_vnd
   * Recomputing from line_items always yields the same total.
   *
   * **Validates: Requirements 10.1–10.15**
   */
  describe("Property 8: Amount integrity", () => {
    test("invoice total always equals sum of line_items + tax", () => {
      fc.assert(
        fc.asyncProperty(
          fc.record({
            plan_price: fc.integer({ min: 1000, max: 50000000 }),
            billing_interval: fc.constantFrom("month", "quarter", "year", "one_time"),
          }),
          async ({ plan_price, billing_interval }) => {
            const plan = createMockPlan({
              plan_id: `plan_${crypto.randomBytes(4).toString("hex")}`,
              price_vnd: plan_price,
              billing_interval,
            });

            const { service } = createTestBillingService([plan]);
            const userId = createMockObjectId();

            const { invoice } = await service.createSubscription({
              user_id: userId,
              plan_id: plan.plan_id,
            });

            // Property: amount_total_vnd = sum(line_items.amount_vnd) + amount_tax_vnd
            const lineItemsSum = invoice.line_items.reduce(
              (sum: number, item: any) => sum + item.amount_vnd,
              0,
            );
            assert.strictEqual(
              invoice.amount_total_vnd,
              lineItemsSum + invoice.amount_tax_vnd,
              `Expected total ${invoice.amount_total_vnd} = lineItems(${lineItemsSum}) + tax(${invoice.amount_tax_vnd})`,
            );

            // Also verify subtotal consistency
            assert.strictEqual(
              invoice.amount_subtotal_vnd,
              lineItemsSum,
              `Expected subtotal ${invoice.amount_subtotal_vnd} = lineItems(${lineItemsSum})`,
            );

            // All amounts must be non-negative integers
            assert.ok(Number.isInteger(invoice.amount_total_vnd));
            assert.ok(Number.isInteger(invoice.amount_subtotal_vnd));
            assert.ok(Number.isInteger(invoice.amount_tax_vnd));
            assert.ok(invoice.amount_total_vnd >= 0);
            assert.ok(invoice.amount_subtotal_vnd >= 0);
            assert.ok(invoice.amount_tax_vnd >= 0);
          },
        ),
        { numRuns: 100 },
      );
    });
  });
});
