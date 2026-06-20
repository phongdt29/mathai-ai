import mongoose from "mongoose";
import { Router, type Request, type Response, type NextFunction } from "express";
import { authenticate } from "../middleware/auth";
import { auditService } from "../services/audit.service";
import { planRepository } from "../models/plan.model";
import { subscriptionRepository } from "../models/subscription.model";
import { invoiceRepository } from "../models/invoice.model";
import { billingTransactionRepository } from "../models/billing-transaction.model";
import { paymentTransactionRepository } from "../models/payment-transaction.model";
import { UserModel } from "../models/user.model";
import { ValidationError, NotFoundError, ForbiddenError } from "../utils/errors";
import { paymentGatewayRegistry } from "../services/payment/payment-gateway.registry";
import { createDefaultGatewayConfig } from "../models/payment-gateway-config.model";
import {
  ensureDefaultServicePlans,
  featureCatalogResponse,
  normalizePlanEntitlements,
  serializeServicePlan,
} from "../services/service-plan-catalog";

const router = Router();

// ── Middleware ───────────────────────────────────────────────────────────

function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  if (req.user?.role !== "admin") {
    return next(
      new ForbiddenError(
        "Chỉ quản trị viên mới có quyền thực hiện thao tác này",
      ),
    );
  }
  next();
}

router.use(authenticate, requireAdmin);


// ── GET /api/admin/billing/gateways/config ───────────────────────────────

router.get(
  "/gateways/config",
  async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const config = await paymentGatewayRegistry.getPublicConfig();
      res.status(200).json({ success: true, data: config });
    } catch (error) {
      next(error);
    }
  },
);

// ── PUT /api/admin/billing/gateways/config ───────────────────────────────

router.put(
  "/gateways/config",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { mode, environment, fallback_enabled, gateways } = req.body;

      if (mode !== undefined && !["user_select", "auto_priority"].includes(mode)) {
        throw new ValidationError("mode phải là 'user_select' hoặc 'auto_priority'");
      }
      if (environment !== undefined && !["sandbox", "production"].includes(environment)) {
        throw new ValidationError("environment phải là 'sandbox' hoặc 'production'");
      }
      if (gateways !== undefined && !Array.isArray(gateways)) {
        throw new ValidationError("gateways phải là một danh sách");
      }

      const defaults = createDefaultGatewayConfig();
      const currentConfig = await paymentGatewayRegistry.getConfig();
      const currentByGateway = new Map(currentConfig.gateways.map((gateway) => [gateway.gateway, gateway]));
      const normalizedGateways = gateways
        ? gateways.map((gateway: any) => {
            if (!["vnpay", "momo", "sepay"].includes(gateway.gateway)) {
              throw new ValidationError("gateway không được hỗ trợ");
            }
            const current = currentByGateway.get(gateway.gateway);
            return {
              gateway: gateway.gateway,
              enabled: Boolean(gateway.enabled),
              priority: Number.isInteger(gateway.priority) ? gateway.priority : 100,
              display_name: typeof gateway.display_name === "string" ? gateway.display_name : gateway.gateway.toUpperCase(),
              sandbox_config: gateway.sandbox_config && typeof gateway.sandbox_config === "object" ? gateway.sandbox_config : current?.sandbox_config ?? {},
              credentials: current?.credentials ?? { sandbox: {}, production: {} },
              last_health_check: gateway.last_health_check ?? current?.last_health_check ?? { status: "unknown", checked_at: null, message: null },
            };
          })
        : defaults.gateways;

      const config = await paymentGatewayRegistry.updateConfig({
        mode: mode ?? defaults.mode,
        environment: environment ?? defaults.environment,
        fallback_enabled: fallback_enabled !== undefined ? Boolean(fallback_enabled) : defaults.fallback_enabled,
        gateways: normalizedGateways,
        updated_by: req.user?.id ? new mongoose.Types.ObjectId(req.user.id) : null,
      } as any);

      await auditService.recordFromRequest(req, {
        action: "billing.gateway_config.updated",
        resourceType: "payment_gateway_config",
        resourceId: "default",
        after: { mode: config.mode, environment: config.environment, fallback_enabled: config.fallback_enabled },
        result: "success",
        metadata: { gateways: config.gateways.map((gateway) => ({ gateway: gateway.gateway, enabled: gateway.enabled, configured: gateway.configured })) },
      });

      res.status(200).json({ success: true, data: config, message: "Đã cập nhật cấu hình cổng thanh toán" });
    } catch (error) {
      next(error);
    }
  },
);


// ── PUT /api/admin/billing/gateways/:gateway/credentials/:environment ─────

router.put(
  "/gateways/:gateway/credentials/:environment",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const gateway = req.params.gateway as "vnpay" | "momo" | "sepay";
      const environment = req.params.environment as "sandbox" | "production";

      if (!["vnpay", "momo", "sepay"].includes(gateway)) {
        throw new ValidationError("gateway không được hỗ trợ");
      }
      if (!["sandbox", "production"].includes(environment)) {
        throw new ValidationError("environment phải là 'sandbox' hoặc 'production'");
      }
      if (!req.body?.credentials || typeof req.body.credentials !== "object") {
        throw new ValidationError("credentials phải là một object");
      }

      const config = await paymentGatewayRegistry.updateGatewayCredentials(
        gateway,
        environment,
        req.body.credentials,
      );

      await auditService.recordFromRequest(req, {
        action: "billing.gateway_credentials.updated",
        resourceType: "payment_gateway_config",
        resourceId: gateway,
        after: { gateway, environment },
        result: "success",
        metadata: { gateway, environment, fields: Object.keys(req.body.credentials) },
      });

      res.status(200).json({
        success: true,
        data: config,
        message: "Đã cập nhật thông tin chứng thực cổng thanh toán",
      });
    } catch (error) {
      next(error);
    }
  },
);

// ── POST /api/admin/billing/gateways/:gateway/test ───────────────────────

router.post(
  "/gateways/:gateway/test",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const gateway = req.params.gateway as "vnpay" | "momo" | "sepay";
      if (!["vnpay", "momo", "sepay"].includes(gateway)) {
        throw new ValidationError("gateway không được hỗ trợ");
      }
      const credentials = await paymentGatewayRegistry.resolveGatewayCredentials(gateway);
      const healthy = credentials.missing.length === 0;
      res.status(200).json({
        success: true,
        data: {
          gateway,
          status: healthy ? "healthy" : "unhealthy",
          configured: healthy,
          missing_credentials: credentials.missing,
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

// ── GET /api/admin/billing/plans ────────────────────────────────────────
// List all plans (admin).

router.get(
  "/plans",
  async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      let plans = await planRepository.model
        .find()
        .sort({ "metadata.sort_order": 1, price_vnd: 1, createdAt: 1 })
        .exec();
      if (plans.length === 0) {
        await ensureDefaultServicePlans();
        plans = await planRepository.model
          .find()
          .sort({ "metadata.sort_order": 1, price_vnd: 1, createdAt: 1 })
          .exec();
      }

      const subscriberCounts = await Promise.all(
        plans.map((plan) =>
          subscriptionRepository.model.countDocuments({
            plan_id: plan.plan_id,
            status: { $in: ["active", "trialing"] },
          }),
        ),
      );

      res.status(200).json({
        success: true,
        data: plans.map((plan, index) =>
          serializeServicePlan(plan, subscriberCounts[index] ?? 0),
        ),
      });
    } catch (error) {
      next(error);
    }
  },
);

// ── GET /api/admin/billing/plans/features ──────────────────────────────
// Feature catalog used by the admin plan editor.

router.get(
  "/plans/features",
  async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      res.status(200).json({ success: true, data: featureCatalogResponse() });
    } catch (error) {
      next(error);
    }
  },
);

// ── POST /api/admin/billing/plans/defaults ─────────────────────────────
// Create or restore the built-in service packages.

router.post(
  "/plans/defaults",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await ensureDefaultServicePlans({
        syncExisting: Boolean(req.body?.sync_existing),
      });

      await auditService.recordFromRequest(req, {
        action: "billing.plan.defaults_upserted",
        resourceType: "plan",
        resourceId: "default_service_plans",
        after: result,
        result: "success",
        metadata: result,
      });

      res.status(200).json({
        success: true,
        data: result,
        message: "Đã tạo/cập nhật các gói dịch vụ mẫu",
      });
    } catch (error) {
      next(error);
    }
  },
);

// ── POST /api/admin/billing/plans ───────────────────────────────────────
// Create a new plan (admin).

router.post(
  "/plans",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const {
        plan_id,
        name,
        description,
        price_vnd,
        billing_interval,
        trial_days,
        entitlements,
        is_active,
        metadata,
      } = req.body;

      // Validate required fields
      if (!plan_id || typeof plan_id !== "string") {
        throw new ValidationError("plan_id là bắt buộc");
      }
      if (!name || typeof name !== "string") {
        throw new ValidationError("name là bắt buộc");
      }
      if (price_vnd === undefined || !Number.isInteger(price_vnd) || price_vnd < 0) {
        throw new ValidationError("price_vnd phải là số nguyên không âm");
      }
      if (
        !billing_interval ||
        !["month", "quarter", "year", "one_time"].includes(billing_interval)
      ) {
        throw new ValidationError(
          "billing_interval phải là 'month', 'quarter', 'year', hoặc 'one_time'",
        );
      }

      let normalizedEntitlements;
      try {
        normalizedEntitlements = normalizePlanEntitlements(entitlements);
      } catch (err) {
        throw new ValidationError(err instanceof Error ? err.message : "entitlements không hợp lệ");
      }

      if (trial_days !== undefined && (!Number.isInteger(trial_days) || trial_days < 0)) {
        throw new ValidationError("trial_days phải là số nguyên không âm");
      }

      // Check if plan_id already exists
      const existing = await planRepository.findByPlanId(plan_id);
      if (existing) {
        res.status(409).json({
          success: false,
          error: "plan_id đã tồn tại",
          code: "PLAN_ID_EXISTS",
        });
        return;
      }

      const plan = await planRepository.create({
        plan_id,
        name,
        description: description || "",
        price_vnd,
        billing_interval,
        trial_days: trial_days ?? 0,
        entitlements: normalizedEntitlements,
        is_active: is_active !== false,
        metadata: metadata && typeof metadata === "object" && !Array.isArray(metadata) ? metadata : {},
      } as any);

      // Audit log
      await auditService.recordFromRequest(req, {
        action: "billing.plan.created",
        resourceType: "plan",
        resourceId: plan_id,
        after: { plan_id, name, price_vnd, billing_interval },
        result: "success",
        metadata: { plan_id, price_vnd, billing_interval },
      });

      res.status(201).json({
        success: true,
        data: plan,
        message: "Đã tạo gói dịch vụ",
      });
    } catch (error) {
      next(error);
    }
  },
);

// ── PUT /api/admin/billing/plans/:planId ────────────────────────────────
// Update an existing plan (admin).

router.put(
  "/plans/:planId",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { planId } = req.params;

      const plan = await planRepository.findByPlanId(planId);
      if (!plan) {
        throw new NotFoundError("Gói dịch vụ không tồn tại");
      }

      const before = {
        name: plan.name,
        price_vnd: plan.price_vnd,
        billing_interval: plan.billing_interval,
        is_active: plan.is_active,
      };

      const {
        name,
        description,
        price_vnd,
        billing_interval,
        trial_days,
        entitlements,
        is_active,
        metadata,
      } = req.body;

      const updateData: Record<string, unknown> = {};
      if (name !== undefined) updateData.name = name;
      if (description !== undefined) updateData.description = description;
      if (price_vnd !== undefined) {
        if (!Number.isInteger(price_vnd) || price_vnd < 0) {
          throw new ValidationError("price_vnd phải là số nguyên không âm");
        }
        updateData.price_vnd = price_vnd;
      }
      if (billing_interval !== undefined) {
        if (!["month", "quarter", "year", "one_time"].includes(billing_interval)) {
          throw new ValidationError(
            "billing_interval phải là 'month', 'quarter', 'year', hoặc 'one_time'",
          );
        }
        updateData.billing_interval = billing_interval;
      }
      if (trial_days !== undefined) {
        if (!Number.isInteger(trial_days) || trial_days < 0) {
          throw new ValidationError("trial_days phải là số nguyên không âm");
        }
        updateData.trial_days = trial_days;
      }
      if (entitlements !== undefined) {
        try {
          updateData.entitlements = normalizePlanEntitlements(entitlements);
        } catch (err) {
          throw new ValidationError(err instanceof Error ? err.message : "entitlements không hợp lệ");
        }
      }
      if (is_active !== undefined) updateData.is_active = is_active;
      if (metadata !== undefined) {
        updateData.metadata = metadata && typeof metadata === "object" && !Array.isArray(metadata) ? metadata : {};
      }

      const updated = await planRepository.update(plan._id.toString(), updateData);

      // Audit log
      await auditService.recordFromRequest(req, {
        action: "billing.plan.updated",
        resourceType: "plan",
        resourceId: planId,
        before,
        after: {
          name: updated.name,
          price_vnd: updated.price_vnd,
          billing_interval: updated.billing_interval,
          is_active: updated.is_active,
        },
        result: "success",
        metadata: { plan_id: planId },
      });

      res.status(200).json({
        success: true,
        data: updated,
        message: "Đã cập nhật gói dịch vụ",
      });
    } catch (error) {
      next(error);
    }
  },
);

// ── POST /api/admin/billing/subscriptions/:id/refund ────────────────────
// Refund a subscription's payment (admin).

router.post(
  "/subscriptions/:id/refund",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const subscriptionId = req.params.id;
      const { amount_vnd, reason } = req.body;

      // Find subscription by subscription_id (ULID)
      const subscription =
        await subscriptionRepository.findBySubscriptionId(subscriptionId);
      if (!subscription) {
        throw new NotFoundError("Không tìm thấy gói đăng ký");
      }

      // Validate amount
      if (amount_vnd === undefined || !Number.isInteger(amount_vnd) || amount_vnd <= 0) {
        throw new ValidationError("amount_vnd phải là số nguyên dương");
      }

      // Find the latest paid invoice for this subscription
      const invoices = await invoiceRepository.findBySubscriptionId(
        subscription._id.toString(),
        5,
      );
      const paidInvoice = invoices.find((inv) => inv.status === "paid");

      if (!paidInvoice) {
        res.status(422).json({
          success: false,
          error: "Không tìm thấy hoá đơn đã thanh toán để hoàn tiền",
          code: "NO_PAID_INVOICE",
        });
        return;
      }

      // Find the payment transaction linked to this invoice
      const paymentTxnId = paidInvoice.payment_transaction_ids[0];
      let paymentTxn = null;
      if (paymentTxnId) {
        paymentTxn = await paymentTransactionRepository.findById(
          paymentTxnId.toString(),
        );
      }

      // Create refund billing transaction
      const refundTxn = await billingTransactionRepository.create({
        user_id: subscription.user_id,
        subscription_id: subscription._id,
        invoice_id: paidInvoice._id,
        payment_transaction_id: paymentTxnId ?? null,
        type: "refund",
        amount_vnd: -amount_vnd, // negative for refund
        description: reason
          ? `Hoàn tiền: ${reason}`
          : `Hoàn tiền gói đăng ký ${subscriptionId}`,
        performed_by: req.user?.id
          ? new mongoose.Types.ObjectId(req.user.id)
          : null,
        metadata: { subscription_id: subscriptionId, reason },
      } as any);

      // Update payment transaction refund_amount_vnd if exists
      if (paymentTxn) {
        const currentRefund = paymentTxn.refund_amount_vnd ?? 0;
        await paymentTransactionRepository.update(paymentTxn._id.toString(), {
          refund_amount_vnd: currentRefund + amount_vnd,
        });
      }

      // Audit log
      await auditService.recordFromRequest(req, {
        action: "billing.refund",
        resourceType: "subscription",
        resourceId: subscriptionId,
        after: {
          amount_vnd,
          reason,
          billing_transaction_id: refundTxn._id.toString(),
        },
        result: "success",
        metadata: {
          subscription_id: subscriptionId,
          user_id: subscription.user_id.toString(),
          amount_vnd,
          reason,
        },
      });

      res.status(200).json({
        success: true,
        data: {
          billing_transaction_id: refundTxn._id.toString(),
          amount_vnd,
          subscription_id: subscriptionId,
          user_id: subscription.user_id.toString(),
        },
        message: `Đã hoàn tiền ${amount_vnd.toLocaleString("vi-VN")} VND`,
      });
    } catch (error) {
      next(error);
    }
  },
);

// ── GET /api/admin/billing/transactions ─────────────────────────────────
// List billing transactions (admin).

router.get(
  "/transactions",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { user_id: filterUserId, limit: limitStr } = req.query;

      const limit = Math.min(
        Math.max(parseInt(limitStr as string) || 50, 1),
        200,
      );

      // Frontend bảng "Giao dịch" mong shape PaymentTransaction (intent_id,
      // gateway, status, paid_at...), nên truy vấn trực tiếp payment transactions.
      const filter = filterUserId ? { user_id: filterUserId as string } : {};
      const transactions = await paymentTransactionRepository.model
        .find(filter as any)
        .sort({ createdAt: -1 })
        .limit(limit)
        .lean()
        .exec();

      // Resolve user emails trong một truy vấn.
      const userIds = [
        ...new Set(
          transactions
            .map((txn: any) => (txn.user_id ? String(txn.user_id) : null))
            .filter((id): id is string => Boolean(id)),
        ),
      ];
      const users = userIds.length
        ? await UserModel.find({ _id: { $in: userIds } })
            .select("email")
            .lean()
        : [];
      const emailById = new Map(
        users.map((u: any) => [String(u._id), u.email as string]),
      );

      res.status(200).json({
        success: true,
        data: transactions.map((txn: any) => ({
          id: String(txn._id),
          intent_id: txn.intent_id ?? "",
          user_email: emailById.get(String(txn.user_id)) ?? "",
          amount_vnd: txn.amount_vnd ?? 0,
          gateway: txn.gateway ?? "",
          status: txn.status ?? "pending",
          created_at: txn.createdAt?.toISOString?.() ?? txn.createdAt ?? null,
          paid_at: txn.paid_at
            ? (txn.paid_at.toISOString?.() ?? txn.paid_at)
            : null,
        })),
      });
    } catch (error) {
      next(error);
    }
  },
);

export default router;
