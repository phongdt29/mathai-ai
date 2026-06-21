import crypto from "node:crypto";
import { Router, type Request, type Response, type NextFunction } from "express";
import { authenticate } from "../middleware/auth";
import { paymentService, PaymentError } from "../services/payment/payment.service";
import { vnpayAdapter } from "../services/payment/vnpay.adapter";
import { momoAdapter } from "../services/payment/momo.adapter";
import { paymentGatewayRegistry } from "../services/payment/payment-gateway.registry";
import { auditService } from "../services/audit.service";
import { billingService, BillingError } from "../services/billing.service";
import { planRepository } from "../models/plan.model";
import { subscriptionRepository } from "../models/subscription.model";
import { invoiceRepository } from "../models/invoice.model";
import { ValidationError, NotFoundError } from "../utils/errors";
import {
  ensureDefaultServicePlans,
  serializeServicePlan,
} from "../services/service-plan-catalog";

const router = Router();

// ── Helper ──────────────────────────────────────────────────────────────

function userId(req: Request): string {
  return req.user?.id ?? "";
}

const SUPPORTED_GATEWAY_SELECTIONS = ["auto", "vnpay", "momo", "sepay"];

function validateGatewaySelection(gateway: unknown): string {
  if (typeof gateway !== "string" || !SUPPORTED_GATEWAY_SELECTIONS.includes(gateway)) {
    throw new ValidationError("gateway phải là 'auto', 'vnpay', 'momo' hoặc 'sepay'");
  }
  return gateway;
}

function paymentResponse(paymentResult: Awaited<ReturnType<typeof paymentService.createIntent>>) {
  return {
    intent_id: paymentResult.intent_id,
    redirect_url: paymentResult.redirect_url,
    expires_at: paymentResult.expires_at,
    type: paymentResult.type,
    gateway_used: paymentResult.gateway_used,
    bank_transfer: paymentResult.bank_transfer ?? null,
  };
}

// ══════════════════════════════════════════════════════════════════════════
// PAYMENT INTENT ROUTES (existing)
// ══════════════════════════════════════════════════════════════════════════


// ── GET /api/billing/gateways/available ─────────────────────────────────
// Public checkout config for authenticated users. Secrets are never returned.

router.get(
  "/gateways/available",
  authenticate,
  async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const config = await paymentGatewayRegistry.getPublicConfig();
      res.status(200).json({ success: true, data: config });
    } catch (error) {
      next(error);
    }
  },
);

// ── POST /api/billing/payment-intents ───────────────────────────────────
// Create a payment intent and return redirect_url for the gateway.
// Requires authentication. Idempotency via Idempotency-Key header.

router.post(
  "/payment-intents",
  authenticate,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const uid = userId(req);
      if (!uid) {
        res.status(401).json({ success: false, error: "Unauthorized" });
        return;
      }

      const { plan_id, gateway } = req.body;

      // Validate required fields
      if (!plan_id || typeof plan_id !== "string") {
        throw new ValidationError("plan_id là bắt buộc");
      }

      const gatewaySelection = validateGatewaySelection(gateway ?? "auto");

      // Idempotency key from header or generate
      const idempotencyKey =
        (req.headers["idempotency-key"] as string) ||
        (req.headers["x-idempotency-key"] as string) ||
        crypto.randomUUID();

      const result = await paymentService.createIntent({
        user_id: uid,
        plan_id,
        gateway: gatewaySelection as any,
        idempotency_key: idempotencyKey,
        ip_addr: req.ip || req.socket?.remoteAddress || "127.0.0.1",
      });

      // Audit log for payment intent creation
      await auditService.recordFromRequest(req, {
        action: "billing.payment_intent.created",
        resourceType: "payment_transaction",
        resourceId: result.intent_id,
        after: { intent_id: result.intent_id, gateway: result.gateway_used, plan_id },
        result: "success",
        metadata: { gateway: result.gateway_used, requested_gateway: gatewaySelection, plan_id, idempotency_key: idempotencyKey },
      });

      res.status(201).json({
        success: true,
        data: {
          ...paymentResponse(result),
        },
      });
    } catch (error) {
      if (error instanceof PaymentError) {
        const statusMap: Record<string, number> = {
          PLAN_NOT_FOUND: 404,
          PLAN_INACTIVE: 422,
          UNSUPPORTED_GATEWAY: 400,
          GATEWAY_DISABLED: 400,
          GATEWAY_NOT_CONFIGURED: 422,
          PAYMENT_GATEWAYS_UNAVAILABLE: 503,
        };
        const status = statusMap[error.code] || 400;
        res.status(status).json({
          success: false,
          error: error.message,
          code: error.code,
        });
        return;
      }
      next(error);
    }
  },
);

// ── GET /api/billing/transactions/:id ───────────────────────────────────
// Poll transaction status by intent_id.

router.get(
  "/transactions/:id",
  authenticate,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const uid = userId(req);
      if (!uid) {
        res.status(401).json({ success: false, error: "Unauthorized" });
        return;
      }

      const intentId = req.params.id;
      if (!intentId) {
        throw new ValidationError("Transaction ID là bắt buộc");
      }

      const transaction = await paymentService.getTransaction(intentId);

      if (!transaction) {
        throw new NotFoundError("Giao dịch không tồn tại");
      }

      // Ensure user can only see their own transactions
      if (transaction.user_id.toString() !== uid) {
        res.status(403).json({
          success: false,
          error: "Bạn không có quyền xem giao dịch này",
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: {
          intent_id: transaction.intent_id,
          gateway: transaction.gateway,
          amount_vnd: transaction.amount_vnd,
          status: transaction.status,
          paid_at: transaction.paid_at?.toISOString() ?? null,
          expires_at: transaction.expires_at.toISOString(),
          createdAt: transaction.createdAt.toISOString(),
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

// ── GET /api/billing/return/vnpay ───────────────────────────────────────
// Verify VNPAY return query params after user is redirected back.

router.get(
  "/return/vnpay",
  authenticate,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const uid = userId(req);
      if (!uid) {
        res.status(401).json({ success: false, error: "Unauthorized" });
        return;
      }

      const query = req.query as Record<string, string>;

      // Verify signature
      const verifyResult = vnpayAdapter.verifyReturn(query);

      const intentId = query.vnp_TxnRef || null;

      // Audit the return verification
      await auditService.recordFromRequest(req, {
        action: "billing.return.vnpay.verified",
        resourceType: "payment_transaction",
        resourceId: intentId,
        after: { valid: verifyResult.valid, reason: verifyResult.reason },
        result: verifyResult.valid ? "success" : "failure",
        metadata: { gateway: "vnpay", intent_id: intentId },
      });

      if (!verifyResult.valid) {
        res.status(400).json({
          success: false,
          error: "Chữ ký không hợp lệ",
          code: "INVALID_SIGNATURE",
          reason: verifyResult.reason,
        });
        return;
      }

      // Map response code to status
      const responseCode = query.vnp_ResponseCode || "";
      const mappedStatus = vnpayAdapter.mapResponseCode(responseCode);

      // Look up the transaction
      let transaction = null;
      if (intentId) {
        transaction = await paymentService.getTransaction(intentId);
      }

      // Verify ownership
      if (transaction && transaction.user_id.toString() !== uid) {
        res.status(403).json({
          success: false,
          error: "Bạn không có quyền xem giao dịch này",
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: {
          valid: true,
          intent_id: intentId,
          status: mappedStatus.status,
          response_code: responseCode,
          transaction_status: transaction?.status ?? null,
          failure_message: mappedStatus.failure_message ?? null,
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

// ── GET /api/billing/return/momo ────────────────────────────────────────
// Verify MOMO return query params after user is redirected back.

router.get(
  "/return/momo",
  authenticate,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const uid = userId(req);
      if (!uid) {
        res.status(401).json({ success: false, error: "Unauthorized" });
        return;
      }

      const query = req.query as Record<string, unknown>;

      // Verify MOMO signature
      const verifyResult = momoAdapter.verifyIpn(query);

      const intentId = (query.orderId as string) || null;

      // Audit the return verification
      await auditService.recordFromRequest(req, {
        action: "billing.return.momo.verified",
        resourceType: "payment_transaction",
        resourceId: intentId,
        after: { valid: verifyResult.valid, reason: verifyResult.reason },
        result: verifyResult.valid ? "success" : "failure",
        metadata: { gateway: "momo", intent_id: intentId },
      });

      if (!verifyResult.valid) {
        res.status(400).json({
          success: false,
          error: "Chữ ký không hợp lệ",
          code: "INVALID_SIGNATURE",
          reason: verifyResult.reason,
        });
        return;
      }

      // Map result code to status
      const resultCode = Number(query.resultCode ?? -1);
      const mappedStatus = momoAdapter.mapResultCode(resultCode);

      // Look up the transaction
      let transaction = null;
      if (intentId) {
        transaction = await paymentService.getTransaction(intentId);
      }

      // Verify ownership
      if (transaction && transaction.user_id.toString() !== uid) {
        res.status(403).json({
          success: false,
          error: "Bạn không có quyền xem giao dịch này",
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: {
          valid: true,
          intent_id: intentId,
          status: mappedStatus.status,
          result_code: resultCode,
          transaction_status: transaction?.status ?? null,
          failure_message: mappedStatus.failure_message ?? null,
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

// ══════════════════════════════════════════════════════════════════════════
// USER-FACING SUBSCRIPTION & INVOICE ROUTES
// ══════════════════════════════════════════════════════════════════════════

// ── GET /api/billing/plans ─────────────────────────────────────────────
// Public active plan list for checkout. Seeds default service plans on first use.

router.get(
  "/plans",
  authenticate,
  async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      let plans = await planRepository.findActivePlans();
      if (plans.length === 0) {
        await ensureDefaultServicePlans();
        plans = await planRepository.findActivePlans();
      }

      res.status(200).json({
        success: true,
        data: plans.map((plan) => serializeServicePlan(plan)),
      });
    } catch (error) {
      next(error);
    }
  },
);

// ── POST /api/billing/me/subscription ───────────────────────────────────
// Create a new subscription for the authenticated user.

router.post(
  "/me/subscription",
  authenticate,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const uid = userId(req);
      if (!uid) {
        res.status(401).json({ success: false, error: "Unauthorized" });
        return;
      }

      const { plan_id, gateway } = req.body;

      if (!plan_id || typeof plan_id !== "string") {
        throw new ValidationError("plan_id là bắt buộc");
      }

      const gatewaySelection = validateGatewaySelection(gateway ?? "auto");

      // Create subscription + invoice via billing service
      const { subscription, invoice } = await billingService.createSubscription({
        user_id: uid,
        plan_id,
      });

      // Create payment intent for the invoice
      const idempotencyKey =
        (req.headers["idempotency-key"] as string) ||
        (req.headers["x-idempotency-key"] as string) ||
        crypto.randomUUID();

      const paymentResult = await paymentService.createIntent({
        user_id: uid,
        plan_id,
        gateway: gatewaySelection as any,
        idempotency_key: idempotencyKey,
        ip_addr: req.ip || req.socket?.remoteAddress || "127.0.0.1",
      });

      // Audit log
      await auditService.recordFromRequest(req, {
        action: "billing.subscription.created",
        resourceType: "subscription",
        resourceId: subscription.subscription_id,
        after: {
          subscription_id: subscription.subscription_id,
          plan_id,
          status: subscription.status,
        },
        result: "success",
        metadata: { plan_id, gateway: paymentResult.gateway_used, requested_gateway: gatewaySelection, invoice_number: invoice.invoice_number },
      });

      res.status(201).json({
        success: true,
        data: {
          subscription_id: subscription.subscription_id,
          plan_id: subscription.plan_id,
          status: subscription.status,
          current_period_start: subscription.current_period_start.toISOString(),
          current_period_end: subscription.current_period_end.toISOString(),
          invoice: {
            invoice_id: invoice.invoice_id,
            invoice_number: invoice.invoice_number,
            amount_total_vnd: invoice.amount_total_vnd,
            status: invoice.status,
          },
          payment: paymentResponse(paymentResult),
        },
      });
    } catch (error) {
      if (error instanceof BillingError) {
        const statusMap: Record<string, number> = {
          PLAN_NOT_FOUND: 404,
          PLAN_INACTIVE: 422,
          SUBSCRIPTION_EXISTS: 409,
        };
        const status = statusMap[error.code] || 400;
        res.status(status).json({
          success: false,
          error: error.message,
          code: error.code,
        });
        return;
      }
      if (error instanceof PaymentError) {
        const statusMap: Record<string, number> = {
          PLAN_NOT_FOUND: 404,
          PLAN_INACTIVE: 422,
          UNSUPPORTED_GATEWAY: 400,
          GATEWAY_DISABLED: 400,
          GATEWAY_NOT_CONFIGURED: 422,
          PAYMENT_GATEWAYS_UNAVAILABLE: 503,
        };
        const status = statusMap[error.code] || 400;
        res.status(status).json({
          success: false,
          error: error.message,
          code: error.code,
        });
        return;
      }
      next(error);
    }
  },
);

// ── GET /api/billing/me/subscription ────────────────────────────────────
// Get the current user's active subscription.

router.get(
  "/me/subscription",
  authenticate,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const uid = userId(req);
      if (!uid) {
        res.status(401).json({ success: false, error: "Unauthorized" });
        return;
      }

      const subscription = await subscriptionRepository.findActiveByUserId(uid);

      if (!subscription) {
        res.status(200).json({
          success: true,
          data: null,
          message: "Không có gói đăng ký đang hoạt động",
        });
        return;
      }

      // Fetch plan details
      const plan = await planRepository.findByPlanId(subscription.plan_id);

      res.status(200).json({
        success: true,
        data: {
          id: subscription.subscription_id,
          subscription_id: subscription.subscription_id,
          plan_id: subscription.plan_id,
          plan_name: plan?.name ?? null,
          plan: plan
            ? {
                plan_id: plan.plan_id,
                name: plan.name,
                price_vnd: plan.price_vnd,
                billing_interval: plan.billing_interval,
              }
            : null,
          status: subscription.status,
          current_period_start: subscription.current_period_start.toISOString(),
          current_period_end: subscription.current_period_end.toISOString(),
          next_billing_at: subscription.next_billing_at?.toISOString() ?? null,
          cancelled_at: subscription.cancelled_at?.toISOString() ?? null,
          cancel_at_period_end: subscription.cancel_at_period_end,
          trial_end_at: subscription.trial_end_at?.toISOString() ?? null,
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

// ── GET /api/billing/me/invoices ────────────────────────────────────────
// Get the current user's invoices.

router.get(
  "/me/invoices",
  authenticate,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const uid = userId(req);
      if (!uid) {
        res.status(401).json({ success: false, error: "Unauthorized" });
        return;
      }

      const limit = Math.min(
        Math.max(parseInt(req.query.limit as string) || 20, 1),
        100,
      );

      const invoices = await invoiceRepository.findByUserId(uid, limit);

      res.status(200).json({
        success: true,
        data: invoices.map((inv) => ({
          invoice_id: inv.invoice_id,
          invoice_number: inv.invoice_number,
          status: inv.status,
          amount_total_vnd: inv.amount_total_vnd,
          amount_paid_vnd: inv.amount_paid_vnd,
          period_start: inv.period_start.toISOString(),
          period_end: inv.period_end.toISOString(),
          due_at: inv.due_at.toISOString(),
          paid_at: inv.paid_at?.toISOString() ?? null,
          line_items: inv.line_items,
          createdAt: inv.createdAt.toISOString(),
        })),
      });
    } catch (error) {
      next(error);
    }
  },
);

// ── POST /api/billing/me/subscription/cancel ────────────────────────────
// Cancel the current user's active subscription.

router.post(
  "/me/subscription/cancel",
  authenticate,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const uid = userId(req);
      if (!uid) {
        res.status(401).json({ success: false, error: "Unauthorized" });
        return;
      }

      const { at_period_end, reason } = req.body;

      // Validate at_period_end (default true for safety)
      const cancelAtPeriodEnd =
        at_period_end !== undefined ? Boolean(at_period_end) : true;
      const cancelReason =
        typeof reason === "string" ? reason.trim() : "";

      const subscription = await billingService.cancelSubscription(uid, {
        at_period_end: cancelAtPeriodEnd,
        reason: cancelReason,
      });

      res.status(200).json({
        success: true,
        data: {
          subscription_id: subscription.subscription_id,
          status: subscription.status,
          cancelled_at: subscription.cancelled_at?.toISOString() ?? null,
          cancel_at_period_end: subscription.cancel_at_period_end,
          current_period_end: subscription.current_period_end.toISOString(),
        },
        message: cancelAtPeriodEnd
          ? "Gói đăng ký sẽ hết hiệu lực vào cuối kỳ thanh toán"
          : "Gói đăng ký đã được huỷ ngay lập tức",
      });
    } catch (error) {
      if (error instanceof BillingError) {
        const statusMap: Record<string, number> = {
          NO_ACTIVE_SUBSCRIPTION: 404,
        };
        const status = statusMap[error.code] || 400;
        res.status(status).json({
          success: false,
          error: error.message,
          code: error.code,
        });
        return;
      }
      next(error);
    }
  },
);

export default router;
