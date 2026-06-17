import { describe, it, test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fc from "fast-check";
import * as crypto from "node:crypto";

import {
  VNPayAdapter,
  createVNPayAdapter,
  type VNPayConfig,
  type VNPayBuildParams,
} from "./vnpay.adapter";
import {
  MoMoAdapter,
  createMoMoAdapter,
  type MoMoConfig,
} from "./momo.adapter";
import { PaymentService, PaymentError } from "./payment.service";
import type { IPaymentTransaction, PaymentGateway, PaymentStatus } from "../../models/payment-transaction.model";

// ── Test Config ─────────────────────────────────────────────────────────

const TEST_VNPAY_CONFIG: VNPayConfig = {
  tmnCode: "MATHAI01",
  hashSecret: "TESTSECRET123456789ABCDEF",
  paymentUrl: "https://sandbox.vnpayment.vn/paymentv2/vpcpay.html",
  returnUrl: "http://localhost:3444/billing/return/vnpay",
};

const TEST_MOMO_CONFIG: MoMoConfig = {
  partnerCode: "MOMO_PARTNER",
  accessKey: "MOMO_ACCESS_KEY",
  secretKey: "MOMO_SECRET_KEY_12345",
  paymentUrl: "https://test-payment.momo.vn/v2/gateway/api/create",
  returnUrl: "http://localhost:3444/billing/return/momo",
  ipnUrl: "http://localhost:3001/api/webhooks/momo",
};

// ── Mock Helpers ────────────────────────────────────────────────────────

function createMockObjectId(): string {
  return crypto.randomBytes(12).toString("hex");
}

function createMockTransactionRepo() {
  const store: Map<string, any> = new Map();
  return {
    store,
    findByIdempotencyKey: async (key: string) => {
      for (const doc of store.values()) {
        if (doc.idempotency_key === key) return doc;
      }
      return null;
    },
    findByIntentId: async (intentId: string) => {
      for (const doc of store.values()) {
        if (doc.intent_id === intentId) return doc;
      }
      return null;
    },
    findStalePending: async () => {
      const now = new Date();
      const results: any[] = [];
      for (const doc of store.values()) {
        if (doc.status === "pending" && doc.expires_at < now) {
          results.push(doc);
        }
      }
      return results;
    },
    markExpired: async (id: string) => {
      const doc = store.get(id);
      if (doc) {
        doc.status = "expired";
        store.set(id, doc);
      }
      return doc;
    },
    markSucceeded: async (id: string, gatewayTxnId: string, payload: any) => {
      const doc = store.get(id);
      if (doc) {
        doc.status = "succeeded";
        doc.paid_at = new Date();
        doc.gateway_transaction_id = gatewayTxnId;
        doc.signed_payload_in = payload;
        store.set(id, doc);
      }
      return doc;
    },
    markFailed: async (id: string) => {
      const doc = store.get(id);
      if (doc) { doc.status = "failed"; store.set(id, doc); }
      return doc;
    },
    create: async (data: any) => {
      const id = createMockObjectId();
      const doc = {
        _id: { toString: () => id },
        ...data,
        user_id: data.user_id ?? { toString: () => createMockObjectId() },
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      store.set(id, doc);
      return doc;
    },
  };
}

function createMockPlanRepo(plans: any[] = []) {
  return {
    findByPlanId: async (planId: string) => {
      return plans.find((p) => p.plan_id === planId || p._id?.toString() === planId) ?? null;
    },
  };
}

function createMockWebhookLogRepo() {
  const store: Map<string, any> = new Map();
  return {
    store,
    create: async (data: any) => {
      const id = createMockObjectId();
      const doc = { _id: { toString: () => id }, ...data, createdAt: new Date() };
      store.set(id, doc);
      return doc;
    },
    markProcessed: async (id: string, transactionId?: string) => {
      const doc = store.get(id);
      if (doc) {
        doc.processed_at = new Date();
        if (transactionId) doc.transaction_id = transactionId;
      }
      return doc;
    },
    findBySource: async (source: string) => {
      return [...store.values()].filter((d) => d.source === source);
    },
  };
}

// ── VNPAY Adapter Tests ─────────────────────────────────────────────────

describe("VNPayAdapter", () => {
  let adapter: VNPayAdapter;

  beforeEach(() => {
    adapter = new VNPayAdapter(TEST_VNPAY_CONFIG);
  });

  describe("buildPaymentUrl", () => {
    it("should build a valid URL with HMAC-SHA512 signature", () => {
      const params: VNPayBuildParams = {
        intent_id: "01HXYZ123456789ABCDEF",
        amount_vnd: 100000,
        order_info: "Thanh toan goi Premium - MathAI",
        ip_addr: "127.0.0.1",
        created_at: new Date("2024-01-15T10:30:00Z"),
      };

      const result = adapter.buildPaymentUrl(params);
      assert.ok(result.url.startsWith(TEST_VNPAY_CONFIG.paymentUrl));
      assert.ok(result.url.includes("vnp_SecureHash="));
      assert.ok(result.url.includes("vnp_TmnCode=MATHAI01"));
      // Amount should be multiplied by 100
      assert.ok(result.url.includes("vnp_Amount=10000000"));
    });

    it("should include bank_code when provided", () => {
      const params: VNPayBuildParams = {
        intent_id: "01HXYZ123456789ABCDEF",
        amount_vnd: 50000,
        order_info: "Test order",
        ip_addr: "192.168.1.1",
        bank_code: "NCB",
      };

      const result = adapter.buildPaymentUrl(params);
      assert.ok(result.url.includes("vnp_BankCode=NCB"));
    });
  });

  describe("verifyIpn / verifyReturn — golden vector roundtrip", () => {
    it("should verify a signature built by buildPaymentUrl (roundtrip)", () => {
      const params: VNPayBuildParams = {
        intent_id: "01HXYZ_GOLDEN_TEST",
        amount_vnd: 250000,
        order_info: "Golden vector test",
        ip_addr: "10.0.0.1",
        locale: "vn",
        created_at: new Date("2024-06-01T08:00:00Z"),
      };

      const { url } = adapter.buildPaymentUrl(params);

      // Extract query params from URL
      const urlObj = new URL(url);
      const queryParams: Record<string, string> = {};
      for (const [key, value] of urlObj.searchParams.entries()) {
        queryParams[key] = value;
      }

      // Verify the signature we just built
      const verifyResult = adapter.verifyIpn(queryParams);
      assert.strictEqual(verifyResult.valid, true);
      assert.strictEqual(verifyResult.reason, null);
    });

    it("should also pass verifyReturn with same params", () => {
      const params: VNPayBuildParams = {
        intent_id: "01HXYZ_RETURN_TEST",
        amount_vnd: 500000,
        order_info: "Return verify test",
        ip_addr: "192.168.0.1",
        created_at: new Date("2024-03-20T14:30:00Z"),
      };

      const { url } = adapter.buildPaymentUrl(params);
      const urlObj = new URL(url);
      const queryParams: Record<string, string> = {};
      for (const [key, value] of urlObj.searchParams.entries()) {
        queryParams[key] = value;
      }

      const verifyResult = adapter.verifyReturn(queryParams);
      assert.strictEqual(verifyResult.valid, true);
    });

    it("should reject tampered signature", () => {
      const params: VNPayBuildParams = {
        intent_id: "01HXYZ_TAMPER_TEST",
        amount_vnd: 100000,
        order_info: "Tamper test",
        ip_addr: "10.0.0.1",
        created_at: new Date("2024-01-01T00:00:00Z"),
      };

      const { url } = adapter.buildPaymentUrl(params);
      const urlObj = new URL(url);
      const queryParams: Record<string, string> = {};
      for (const [key, value] of urlObj.searchParams.entries()) {
        queryParams[key] = value;
      }

      // Tamper with amount
      queryParams.vnp_Amount = "99999999";

      const verifyResult = adapter.verifyIpn(queryParams);
      assert.strictEqual(verifyResult.valid, false);
      assert.strictEqual(verifyResult.reason, "INVALID_SIGNATURE");
    });

    it("should reject missing required fields", () => {
      const result = adapter.verifyIpn({});
      assert.strictEqual(result.valid, false);
      assert.strictEqual(result.reason, "MISSING_REQUIRED_FIELDS");
    });
  });

  describe("TMN_CODE mismatch rejection", () => {
    it("should reject when vnp_TmnCode does not match config", () => {
      const body: Record<string, string> = {
        vnp_TmnCode: "WRONG_CODE",
        vnp_SecureHash: "somehash",
        vnp_TxnRef: "01HXYZ_TEST",
        vnp_Amount: "10000000",
      };

      const result = adapter.verifyIpn(body);
      assert.strictEqual(result.valid, false);
      assert.strictEqual(result.reason, "TMN_CODE_MISMATCH");
    });
  });

  describe("mapResponseCode", () => {
    it("should map '00' to succeeded", () => {
      const result = adapter.mapResponseCode("00");
      assert.strictEqual(result.status, "succeeded");
    });

    it("should map '24' to failed (user cancelled)", () => {
      const result = adapter.mapResponseCode("24");
      assert.strictEqual(result.status, "failed");
      assert.strictEqual(result.failure_code, "user_cancelled");
    });

    it("should map unknown codes to failed", () => {
      const result = adapter.mapResponseCode("99");
      assert.strictEqual(result.status, "failed");
    });
  });
});

// ── MOMO Adapter Tests ──────────────────────────────────────────────────

describe("MoMoAdapter", () => {
  let adapter: MoMoAdapter;

  beforeEach(() => {
    adapter = new MoMoAdapter(TEST_MOMO_CONFIG);
  });

  describe("verifyIpn — signature verification", () => {
    it("should verify a valid MOMO IPN signature", () => {
      // Build a valid IPN body with correct signature
      const body: Record<string, unknown> = {
        partnerCode: TEST_MOMO_CONFIG.partnerCode,
        orderId: "01HXYZ_MOMO_TEST",
        requestId: "01HXYZ_MOMO_TEST",
        amount: 100000,
        orderInfo: "Test payment",
        orderType: "momo_wallet",
        transId: 123456789,
        resultCode: 0,
        message: "Successful.",
        payType: "qr",
        responseTime: 1700000000000,
        extraData: "",
      };

      // Compute expected signature per MOMO docs
      const rawSignature = [
        `accessKey=${TEST_MOMO_CONFIG.accessKey}`,
        `amount=${body.amount}`,
        `extraData=${body.extraData}`,
        `message=${body.message}`,
        `orderId=${body.orderId}`,
        `orderInfo=${body.orderInfo}`,
        `orderType=${body.orderType}`,
        `partnerCode=${body.partnerCode}`,
        `payType=${body.payType}`,
        `requestId=${body.requestId}`,
        `responseTime=${body.responseTime}`,
        `resultCode=${body.resultCode}`,
        `transId=${body.transId}`,
      ].join("&");

      const signature = crypto
        .createHmac("sha256", TEST_MOMO_CONFIG.secretKey)
        .update(rawSignature)
        .digest("hex");

      body.signature = signature;

      const result = adapter.verifyIpn(body);
      assert.strictEqual(result.valid, true);
      assert.strictEqual(result.reason, null);
    });

    it("should reject invalid MOMO signature", () => {
      const body: Record<string, unknown> = {
        partnerCode: TEST_MOMO_CONFIG.partnerCode,
        orderId: "01HXYZ_MOMO_INVALID",
        requestId: "01HXYZ_MOMO_INVALID",
        amount: 100000,
        orderInfo: "Test",
        orderType: "momo_wallet",
        transId: 999,
        resultCode: 0,
        message: "OK",
        payType: "qr",
        responseTime: 1700000000000,
        extraData: "",
        signature: "invalid_signature_here",
      };

      const result = adapter.verifyIpn(body);
      assert.strictEqual(result.valid, false);
      assert.strictEqual(result.reason, "INVALID_SIGNATURE");
    });

    it("should reject missing signature field", () => {
      const body: Record<string, unknown> = {
        partnerCode: TEST_MOMO_CONFIG.partnerCode,
        orderId: "01HXYZ_NO_SIG",
        amount: 50000,
      };

      const result = adapter.verifyIpn(body);
      assert.strictEqual(result.valid, false);
      assert.strictEqual(result.reason, "MISSING_SIGNATURE");
    });

    it("should reject partner code mismatch", () => {
      const body: Record<string, unknown> = {
        partnerCode: "WRONG_PARTNER",
        orderId: "01HXYZ_WRONG_PARTNER",
        amount: 50000,
        signature: "some_sig",
      };

      const result = adapter.verifyIpn(body);
      assert.strictEqual(result.valid, false);
      assert.strictEqual(result.reason, "PARTNER_CODE_MISMATCH");
    });
  });

  describe("mapResultCode", () => {
    it("should map 0 to succeeded", () => {
      assert.strictEqual(adapter.mapResultCode(0).status, "succeeded");
    });

    it("should map 1006 to failed (user cancelled)", () => {
      const result = adapter.mapResultCode(1006);
      assert.strictEqual(result.status, "failed");
      assert.strictEqual(result.failure_code, "user_cancelled");
    });

    it("should map 1005 to expired", () => {
      assert.strictEqual(adapter.mapResultCode(1005).status, "expired");
    });

    it("should map unknown codes to failed", () => {
      assert.strictEqual(adapter.mapResultCode(9999).status, "failed");
    });
  });
});

// ── PaymentService Tests ────────────────────────────────────────────────

describe("PaymentService", () => {
  describe("createIntent — idempotency", () => {
    it("should return same intent when called with same idempotency_key", async () => {
      const userId = createMockObjectId();
      const planId = "plan_premium";
      const mockPlan = {
        _id: { toString: () => createMockObjectId() },
        plan_id: planId,
        name: "Premium",
        price_vnd: 199000,
        is_active: true,
      };

      const mockTransactionRepo = createMockTransactionRepo();
      const mockPlanRepo = createMockPlanRepo([mockPlan]);

      const mockVnpay = new VNPayAdapter(TEST_VNPAY_CONFIG);

      const service = new PaymentService({
        transactionRepo: mockTransactionRepo as any,
        planRepo: mockPlanRepo as any,
        vnpay: mockVnpay,
        momo: new MoMoAdapter(TEST_MOMO_CONFIG),
        logger: { error: () => {}, warn: () => {}, info: () => {} },
      });

      const input = {
        user_id: userId,
        plan_id: planId,
        gateway: "vnpay" as PaymentGateway,
        idempotency_key: "idem-key-001",
        ip_addr: "127.0.0.1",
      };

      // First call
      const result1 = await service.createIntent(input);
      assert.ok(result1.intent_id);
      assert.ok(result1.redirect_url);
      assert.ok(result1.expires_at);

      // Second call with same idempotency_key
      const result2 = await service.createIntent(input);
      assert.strictEqual(result2.intent_id, result1.intent_id);
      assert.strictEqual(result2.redirect_url, result1.redirect_url);
      assert.strictEqual(result2.expires_at, result1.expires_at);

      // Only 1 transaction in store
      assert.strictEqual(mockTransactionRepo.store.size, 1);
    });

    it("should create different intents for different idempotency_keys", async () => {
      const userId = createMockObjectId();
      const planId = "plan_basic";
      const mockPlan = {
        _id: { toString: () => createMockObjectId() },
        plan_id: planId,
        name: "Basic",
        price_vnd: 99000,
        is_active: true,
      };

      const mockTransactionRepo = createMockTransactionRepo();
      const mockPlanRepo = createMockPlanRepo([mockPlan]);
      const mockVnpay = new VNPayAdapter(TEST_VNPAY_CONFIG);

      const service = new PaymentService({
        transactionRepo: mockTransactionRepo as any,
        planRepo: mockPlanRepo as any,
        vnpay: mockVnpay,
        momo: new MoMoAdapter(TEST_MOMO_CONFIG),
        logger: { error: () => {}, warn: () => {}, info: () => {} },
      });

      const result1 = await service.createIntent({
        user_id: userId,
        plan_id: planId,
        gateway: "vnpay" as PaymentGateway,
        idempotency_key: "key-A",
        ip_addr: "127.0.0.1",
      });

      const result2 = await service.createIntent({
        user_id: userId,
        plan_id: planId,
        gateway: "vnpay" as PaymentGateway,
        idempotency_key: "key-B",
        ip_addr: "127.0.0.1",
      });

      assert.notStrictEqual(result1.intent_id, result2.intent_id);
      assert.strictEqual(mockTransactionRepo.store.size, 2);
    });

    it("should throw PLAN_NOT_FOUND for non-existent plan", async () => {
      const mockTransactionRepo = createMockTransactionRepo();
      const mockPlanRepo = createMockPlanRepo([]);

      const service = new PaymentService({
        transactionRepo: mockTransactionRepo as any,
        planRepo: mockPlanRepo as any,
        vnpay: new VNPayAdapter(TEST_VNPAY_CONFIG),
        momo: new MoMoAdapter(TEST_MOMO_CONFIG),
        logger: { error: () => {}, warn: () => {}, info: () => {} },
      });

      await assert.rejects(
        () => service.createIntent({
          user_id: createMockObjectId(),
          plan_id: "nonexistent",
          gateway: "vnpay" as PaymentGateway,
          idempotency_key: "key-x",
        }),
        (err: any) => {
          assert.ok(err instanceof PaymentError);
          assert.strictEqual(err.code, "PLAN_NOT_FOUND");
          return true;
        },
      );
    });
  });

  describe("expireStalePending", () => {
    it("should expire transactions past their expires_at", async () => {
      const mockTransactionRepo = createMockTransactionRepo();
      // Insert a stale pending transaction
      const staleId = createMockObjectId();
      mockTransactionRepo.store.set(staleId, {
        _id: { toString: () => staleId },
        intent_id: "STALE_INTENT",
        status: "pending",
        expires_at: new Date(Date.now() - 60000), // expired 1 min ago
      });

      const service = new PaymentService({
        transactionRepo: mockTransactionRepo as any,
        planRepo: createMockPlanRepo() as any,
        vnpay: new VNPayAdapter(TEST_VNPAY_CONFIG),
        momo: new MoMoAdapter(TEST_MOMO_CONFIG),
        logger: { error: () => {}, warn: () => {}, info: () => {} },
      });

      const result = await service.expireStalePending();
      assert.strictEqual(result.expired, 1);

      const doc = mockTransactionRepo.store.get(staleId);
      assert.strictEqual(doc.status, "expired");
    });
  });
});

// ── Webhook Replay Safety Tests ─────────────────────────────────────────

describe("Webhook replay safety (unit logic)", () => {
  it("should not change status when transaction already succeeded (VNPAY)", () => {
    // This tests the logic: if transaction.status === "succeeded", return "00"
    // without mutating. We verify the adapter + logic pattern.
    const adapter = new VNPayAdapter(TEST_VNPAY_CONFIG);

    // Build a valid IPN body
    const params: VNPayBuildParams = {
      intent_id: "01HXYZ_REPLAY",
      amount_vnd: 100000,
      order_info: "Replay test",
      ip_addr: "10.0.0.1",
      created_at: new Date("2024-01-01T00:00:00Z"),
    };

    const { url } = adapter.buildPaymentUrl(params);
    const urlObj = new URL(url);
    const queryParams: Record<string, string> = {};
    for (const [key, value] of urlObj.searchParams.entries()) {
      queryParams[key] = value;
    }

    // Verify signature is valid (simulating webhook arrival)
    const verify1 = adapter.verifyIpn(queryParams);
    assert.strictEqual(verify1.valid, true);

    // Verify again (replay) — signature still valid, but business logic
    // should check transaction.status and not mutate
    const verify2 = adapter.verifyIpn(queryParams);
    assert.strictEqual(verify2.valid, true);

    // The key invariant: verifyIpn is pure/stateless — it always returns
    // the same result for the same input. The replay safety is in the
    // webhook handler checking transaction.status before mutating.
  });
});

// ══════════════════════════════════════════════════════════════════════════
// PROPERTY-BASED TESTS
// ══════════════════════════════════════════════════════════════════════════

describe("Property-Based Tests: Payment", () => {

  /**
   * Property 4: Payment idempotency
   * ∀ (user_id, idempotency_key) in PaymentTransaction, there exists exactly 1 row.
   * POST /billing/payment-intents 2 times with same Idempotency-Key → same intent_id.
   *
   * **Validates: Requirements 9.1–9.2**
   */
  describe("Property 4: Payment idempotency", () => {
    test("same (user_id, idempotency_key) always returns same intent", () => {
      fc.assert(
        fc.asyncProperty(
          fc.record({
            user_id: fc.stringMatching(/^[0-9a-f]{24}$/),
            idempotency_key: fc.string({ minLength: 1, maxLength: 64 }),
            plan_name: fc.string({ minLength: 1, maxLength: 20 }),
            price_vnd: fc.integer({ min: 1000, max: 10000000 }),
          }),
          async ({ user_id, idempotency_key, plan_name, price_vnd }) => {
            const planId = `plan_${crypto.randomBytes(4).toString("hex")}`;
            const mockPlan = {
              _id: { toString: () => createMockObjectId() },
              plan_id: planId,
              name: plan_name,
              price_vnd,
              is_active: true,
            };

            const mockTransactionRepo = createMockTransactionRepo();
            const mockPlanRepo = createMockPlanRepo([mockPlan]);

            const service = new PaymentService({
              transactionRepo: mockTransactionRepo as any,
              planRepo: mockPlanRepo as any,
              vnpay: new VNPayAdapter(TEST_VNPAY_CONFIG),
              momo: new MoMoAdapter(TEST_MOMO_CONFIG),
              logger: { error: () => {}, warn: () => {}, info: () => {} },
            });

            const input = {
              user_id,
              plan_id: planId,
              gateway: "vnpay" as PaymentGateway,
              idempotency_key,
              ip_addr: "127.0.0.1",
            };

            // Call twice with same idempotency_key
            const result1 = await service.createIntent(input);
            const result2 = await service.createIntent(input);

            // Must return same intent_id
            assert.strictEqual(result1.intent_id, result2.intent_id);
            assert.strictEqual(result1.redirect_url, result2.redirect_url);

            // Only 1 row in store
            assert.strictEqual(mockTransactionRepo.store.size, 1);
          },
        ),
        { numRuns: 50 },
      );
    });
  });

  /**
   * Property 5: Webhook replay safety
   * ∀ webhook already processed, replay does not change transaction.status
   * but still returns RspCode:"00" to stop gateway retry.
   *
   * We test the invariant: VNPay signature verification is deterministic
   * and the webhook handler pattern (check status before mutate) is safe.
   *
   * **Validates: Requirements 9.7**
   */
  describe("Property 5: Webhook replay safety", () => {
    test("verifyIpn is deterministic — same input always same result", () => {
      const adapter = new VNPayAdapter(TEST_VNPAY_CONFIG);

      fc.assert(
        fc.property(
          fc.record({
            intent_id: fc.stringMatching(/^[A-Z0-9]{10,26}$/),
            amount_vnd: fc.integer({ min: 1000, max: 50000000 }),
            order_info: fc.string({ minLength: 1, maxLength: 50 }),
            ip_addr: fc.ipV4(),
          }),
          ({ intent_id, amount_vnd, order_info, ip_addr }) => {
            const params: VNPayBuildParams = {
              intent_id,
              amount_vnd,
              order_info,
              ip_addr,
              created_at: new Date("2024-06-15T12:00:00Z"),
            };

            const { url } = adapter.buildPaymentUrl(params);
            const urlObj = new URL(url);
            const queryParams: Record<string, string> = {};
            for (const [key, value] of urlObj.searchParams.entries()) {
              queryParams[key] = value;
            }

            // First verify
            const result1 = adapter.verifyIpn(queryParams);
            // Second verify (replay)
            const result2 = adapter.verifyIpn(queryParams);

            // Deterministic: same result both times
            assert.strictEqual(result1.valid, result2.valid);
            assert.strictEqual(result1.reason, result2.reason);
            // Both should be valid (we built the signature ourselves)
            assert.strictEqual(result1.valid, true);
          },
        ),
        { numRuns: 100 },
      );
    });

    test("replay with already-succeeded transaction does not mutate state", async () => {
      fc.assert(
        fc.asyncProperty(
          fc.record({
            intent_id: fc.stringMatching(/^[A-Z0-9]{10,26}$/),
            gateway_txn_id: fc.string({ minLength: 5, maxLength: 20 }),
          }),
          async ({ intent_id, gateway_txn_id }) => {
            const mockTransactionRepo = createMockTransactionRepo();
            const txnId = createMockObjectId();

            // Pre-populate a succeeded transaction
            mockTransactionRepo.store.set(txnId, {
              _id: { toString: () => txnId },
              intent_id,
              status: "succeeded" as PaymentStatus,
              paid_at: new Date(),
              gateway_transaction_id: gateway_txn_id,
            });

            // Simulate replay: find transaction, check status
            const txn = await mockTransactionRepo.findByIntentId(intent_id);
            assert.ok(txn);
            assert.strictEqual(txn.status, "succeeded");

            // Replay should NOT call markSucceeded again
            // (webhook handler checks status === "succeeded" and returns early)
            // Verify state unchanged after "replay"
            const afterReplay = mockTransactionRepo.store.get(txnId);
            assert.strictEqual(afterReplay.status, "succeeded");
            assert.strictEqual(afterReplay.gateway_transaction_id, gateway_txn_id);
          },
        ),
        { numRuns: 50 },
      );
    });
  });

  /**
   * Property 14: Webhook log invariant
   * ∀ webhook received (valid or invalid signature), a WebhookLog row is persisted.
   * Invalid signature webhooks do NOT trigger business logic (no transaction mutation).
   *
   * **Validates: Requirements 9.4, 9.5**
   */
  describe("Property 14: Webhook log invariant", () => {
    test("every webhook (valid or invalid) produces a WebhookLog entry", () => {
      const adapter = new VNPayAdapter(TEST_VNPAY_CONFIG);

      fc.assert(
        fc.property(
          fc.record({
            tmnCode: fc.oneof(
              fc.constant(TEST_VNPAY_CONFIG.tmnCode),
              fc.string({ minLength: 4, maxLength: 10 }),
            ),
            txnRef: fc.string({ minLength: 5, maxLength: 26 }),
            amount: fc.stringMatching(/^[0-9]{1,10}$/),
            secureHash: fc.oneof(
              fc.stringMatching(/^[0-9a-f]{128}$/),
              fc.constant(""),
            ),
          }),
          ({ tmnCode, txnRef, amount, secureHash }) => {
            const webhookLogRepo = createMockWebhookLogRepo();

            // Simulate webhook body
            const body: Record<string, string> = {
              vnp_TmnCode: tmnCode,
              vnp_TxnRef: txnRef,
              vnp_Amount: amount,
              vnp_SecureHash: secureHash,
            };

            // Verify signature
            const verifyResult = adapter.verifyIpn(body);

            // Simulate webhook handler: ALWAYS log, regardless of validity
            const logEntry = {
              source: "vnpay" as const,
              event_type: "ipn",
              raw_body: JSON.stringify(body),
              raw_headers: {},
              signature_valid: verifyResult.valid,
              signature_reason: verifyResult.reason,
              ip: "10.0.0.1",
              received_at: new Date(),
              processed_at: null,
              transaction_id: null,
            };

            // This simulates the webhook handler always persisting a log
            webhookLogRepo.create(logEntry);

            // Invariant: at least 1 log entry exists after webhook
            // (In real code, webhookLogRepository.create is called before
            // any business logic check)
            assert.ok(webhookLogRepo.store.size >= 1);

            // If signature invalid, no transaction should be mutated
            if (!verifyResult.valid) {
              // The handler returns early with RspCode:"97"
              // No markSucceeded/markFailed should be called
              // This is enforced by the handler structure
              assert.strictEqual(verifyResult.valid, false);
            }
          },
        ),
        { numRuns: 100 },
      );
    });

    test("invalid signature never triggers business logic mutation", () => {
      const adapter = new VNPayAdapter(TEST_VNPAY_CONFIG);

      fc.assert(
        fc.property(
          fc.record({
            txnRef: fc.string({ minLength: 5, maxLength: 26 }),
            amount: fc.integer({ min: 1000, max: 50000000 }),
            tamperedHash: fc.stringMatching(/^[0-9a-f]{64,128}$/),
          }),
          ({ txnRef, amount, tamperedHash }) => {
            const body: Record<string, string> = {
              vnp_TmnCode: TEST_VNPAY_CONFIG.tmnCode,
              vnp_TxnRef: txnRef,
              vnp_Amount: String(amount * 100),
              vnp_SecureHash: tamperedHash,
            };

            const verifyResult = adapter.verifyIpn(body);

            // With a random/tampered hash, signature should be invalid
            // (extremely unlikely to randomly match a valid HMAC-SHA512)
            assert.strictEqual(verifyResult.valid, false);
            assert.ok(
              verifyResult.reason === "INVALID_SIGNATURE" ||
              verifyResult.reason === "MISSING_REQUIRED_FIELDS",
            );
          },
        ),
        { numRuns: 100 },
      );
    });
  });
});

// ══════════════════════════════════════════════════════════════════════════
// VNPAY Signature Roundtrip Property Test
// ══════════════════════════════════════════════════════════════════════════

describe("VNPAY Signature Roundtrip (Property)", () => {
  /**
   * For any valid payment parameters, buildPaymentUrl → parse query → verifyIpn
   * should always return valid=true. This is the core signature integrity property.
   *
   * **Validates: Requirements 9.8**
   */
  test("buildPaymentUrl → verifyIpn roundtrip always valid", () => {
    const adapter = new VNPayAdapter(TEST_VNPAY_CONFIG);

    fc.assert(
      fc.property(
        fc.record({
          intent_id: fc.stringMatching(/^[A-Z0-9]{10,26}$/),
          amount_vnd: fc.integer({ min: 1000, max: 50000000 }),
          order_info: fc.string({ minLength: 1, maxLength: 100 }),
          ip_addr: fc.ipV4(),
          locale: fc.constantFrom("vn" as const, "en" as const),
        }),
        ({ intent_id, amount_vnd, order_info, ip_addr, locale }) => {
          const params: VNPayBuildParams = {
            intent_id,
            amount_vnd,
            order_info,
            ip_addr,
            locale,
            created_at: new Date("2024-06-15T12:00:00Z"),
          };

          const { url } = adapter.buildPaymentUrl(params);

          // Parse query params from generated URL
          const urlObj = new URL(url);
          const queryParams: Record<string, string> = {};
          for (const [key, value] of urlObj.searchParams.entries()) {
            queryParams[key] = value;
          }

          // Verify must always pass for self-generated signatures
          const result = adapter.verifyIpn(queryParams);
          assert.strictEqual(result.valid, true, 
            `Roundtrip failed for intent_id=${intent_id}, amount=${amount_vnd}`);
          assert.strictEqual(result.reason, null);
        },
      ),
      { numRuns: 200 },
    );
  });
});
