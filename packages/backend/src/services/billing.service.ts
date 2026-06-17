import { ulid } from "ulid";
import mongoose from "mongoose";
import {
	subscriptionRepository,
	type ISubscription,
	type SubscriptionRepository,
	type SubscriptionStatus,
} from "../models/subscription.model";
import {
	invoiceRepository,
	type IInvoice,
	type InvoiceRepository,
	type InvoiceStatus,
} from "../models/invoice.model";
import {
	planRepository,
	type IPlan,
	type PlanRepository,
} from "../models/plan.model";
import {
	billingTransactionRepository,
	type BillingTransactionRepository,
} from "../models/billing-transaction.model";
import {
	entitlementGrantRepository,
	type EntitlementGrantRepository,
} from "../models/entitlement-grant.model";
import {
	paymentTransactionRepository,
	type IPaymentTransaction,
	type PaymentTransactionRepository,
} from "../models/payment-transaction.model";
import { auditService, type AuditService } from "./audit.service";
import { notificationService, type NotificationService } from "./notification.service";

// ── Types ───────────────────────────────────────────────────────────────

export interface CreateSubscriptionInput {
	user_id: string;
	plan_id: string;
	trial?: boolean;
}

export interface CancelSubscriptionInput {
	at_period_end: boolean;
	reason: string;
}

export interface ProcessRenewalsResult {
	processed: number;
	failed: number;
}

export interface ExpireOverdueResult {
	expired: number;
}

export interface EntitlementLimitResult {
	has_entitlement: boolean;
	limit: number | null;
	period: "day" | "month" | "year" | null;
}

// ── Service Dependencies ────────────────────────────────────────────────

export interface BillingServiceDependencies {
	subscriptionRepo?: SubscriptionRepository;
	invoiceRepo?: InvoiceRepository;
	planRepo?: PlanRepository;
	billingTxnRepo?: BillingTransactionRepository;
	entitlementRepo?: EntitlementGrantRepository;
	paymentTxnRepo?: PaymentTransactionRepository;
	auditSvc?: AuditService;
	notificationSvc?: NotificationService;
	logger?: Pick<Console, "error" | "warn" | "info">;
	gracePeriodDays?: number;
}

// ── Constants ───────────────────────────────────────────────────────────

const DEFAULT_GRACE_PERIOD_DAYS = 7;
const INVOICE_DUE_DAYS = 7;

// ── Service Implementation ──────────────────────────────────────────────

export class BillingService {
	private readonly subscriptionRepo: SubscriptionRepository;
	private readonly invoiceRepo: InvoiceRepository;
	private readonly planRepo: PlanRepository;
	private readonly billingTxnRepo: BillingTransactionRepository;
	private readonly entitlementRepo: EntitlementGrantRepository;
	private readonly paymentTxnRepo: PaymentTransactionRepository;
	private readonly auditSvc: AuditService;
	private readonly notificationSvc: NotificationService;
	private readonly logger: Pick<Console, "error" | "warn" | "info">;
	private readonly gracePeriodDays: number;

	constructor(dependencies: BillingServiceDependencies = {}) {
		this.subscriptionRepo = dependencies.subscriptionRepo ?? subscriptionRepository;
		this.invoiceRepo = dependencies.invoiceRepo ?? invoiceRepository;
		this.planRepo = dependencies.planRepo ?? planRepository;
		this.billingTxnRepo = dependencies.billingTxnRepo ?? billingTransactionRepository;
		this.entitlementRepo = dependencies.entitlementRepo ?? entitlementGrantRepository;
		this.paymentTxnRepo = dependencies.paymentTxnRepo ?? paymentTransactionRepository;
		this.auditSvc = dependencies.auditSvc ?? auditService;
		this.notificationSvc = dependencies.notificationSvc ?? notificationService;
		this.logger = dependencies.logger ?? console;
		this.gracePeriodDays = dependencies.gracePeriodDays ?? DEFAULT_GRACE_PERIOD_DAYS;
	}

	// ── Subscription Lifecycle ──────────────────────────────────────────

	/**
	 * Create a new subscription for a user with a given plan.
	 * Generates an invoice from the plan's line items.
	 *
	 * If the user already has an active/trialing subscription, throws an error.
	 */
	public async createSubscription(
		input: CreateSubscriptionInput,
	): Promise<{ subscription: ISubscription; invoice: IInvoice }> {
		const { user_id, plan_id, trial } = input;

		// Validate plan
		const plan = await this.planRepo.findByPlanId(plan_id);
		if (!plan) {
			throw new BillingError("PLAN_NOT_FOUND", "Gói dịch vụ không tồn tại");
		}
		if (!plan.is_active) {
			throw new BillingError("PLAN_INACTIVE", "Gói dịch vụ hiện không khả dụng");
		}

		// Check existing active subscription
		const existing = await this.subscriptionRepo.findActiveByUserId(user_id);
		if (existing) {
			throw new BillingError(
				"SUBSCRIPTION_EXISTS",
				"Bạn đã có gói đăng ký đang hoạt động",
			);
		}

		// Compute period
		const now = new Date();
		const useTrial = trial && plan.trial_days > 0;
		const periodEnd = useTrial
			? addDays(now, plan.trial_days)
			: computeNextPeriodEnd(now, plan.billing_interval);

		const status: SubscriptionStatus = useTrial ? "trialing" : "active";

		// Create subscription
		const subscriptionId = ulid();
		const subscription = await this.subscriptionRepo.create({
			subscription_id: subscriptionId,
			user_id: new mongoose.Types.ObjectId(user_id),
			plan_id: plan.plan_id,
			status,
			trial_end_at: useTrial ? periodEnd : null,
			current_period_start: now,
			current_period_end: periodEnd,
			next_billing_at: periodEnd,
			cancelled_at: null,
			cancel_reason: null,
			cancel_at_period_end: false,
			paused_at: null,
			metadata: {},
		} as Partial<ISubscription>);

		// Generate invoice
		const invoice = await this.generateInvoice(subscription, plan);

		this.logger.info("[billing] Subscription created", {
			subscription_id: subscriptionId,
			user_id,
			plan_id,
			status,
		});

		return { subscription, invoice };
	}

	/**
	 * Activate subscription after successful payment.
	 *
	 * Idempotent: calling twice with the same transaction does NOT create
	 * a second BillingTransaction. If the invoice is already paid, returns
	 * the current subscription state immediately.
	 *
	 * Steps:
	 * 1. Find PaymentTransaction by intent_id
	 * 2. Find related Invoice (via payment_transaction_ids or metadata)
	 * 3. If invoice already paid → return subscription (idempotent)
	 * 4. Update invoice: status=paid, paid_at, amount_paid_vnd
	 * 5. Update subscription: status=active, period dates
	 * 6. Refresh entitlement grants
	 * 7. Create BillingTransaction (payment_received)
	 * 8. Send notification
	 */
	public async activateAfterPayment(
		transactionId: string,
	): Promise<ISubscription> {
		// Find the payment transaction
		const txn = await this.paymentTxnRepo.findByIntentId(transactionId);
		if (!txn) {
			throw new BillingError(
				"TRANSACTION_NOT_FOUND",
				"Giao dịch thanh toán không tồn tại",
			);
		}

		if (txn.status !== "succeeded") {
			throw new BillingError(
				"TRANSACTION_NOT_SUCCEEDED",
				"Giao dịch chưa thành công",
			);
		}

		// Find the invoice linked to this transaction
		const invoice = await this.findInvoiceForTransaction(txn);
		if (!invoice) {
			throw new BillingError(
				"INVOICE_NOT_FOUND",
				"Không tìm thấy hoá đơn liên quan",
			);
		}

		// ── Idempotency check ──────────────────────────────────────────────
		// If invoice is already paid, this is a replay — return current state
		if (invoice.status === "paid") {
			const subscription = await this.subscriptionRepo.findById(
				invoice.subscription_id!.toString(),
			);
			return subscription!;
		}

		// ── Check BillingTransaction idempotency ───────────────────────────
		// Ensure we don't create a duplicate payment_received entry
		const existingBillingTxns = await this.billingTxnRepo.findByPaymentTransactionId(
			txn._id.toString(),
		);
		const alreadyRecorded = existingBillingTxns.some(
			(bt) => bt.type === "payment_received",
		);

		// ── Update invoice ─────────────────────────────────────────────────
		await this.invoiceRepo.update(invoice._id.toString(), {
			status: "paid" as InvoiceStatus,
			paid_at: new Date(),
			amount_paid_vnd: invoice.amount_total_vnd,
			payment_transaction_ids: [
				...invoice.payment_transaction_ids,
				txn._id,
			],
		});

		// ── Update subscription ────────────────────────────────────────────
		const subscription = await this.subscriptionRepo.findById(
			invoice.subscription_id!.toString(),
		);
		if (!subscription) {
			throw new BillingError(
				"SUBSCRIPTION_NOT_FOUND",
				"Không tìm thấy gói đăng ký",
			);
		}

		const plan = await this.planRepo.findByPlanId(subscription.plan_id);
		const now = new Date();
		const newPeriodStart = invoice.period_end > now ? invoice.period_start : now;
		const newPeriodEnd = computeNextPeriodEnd(
			newPeriodStart,
			plan?.billing_interval ?? "month",
		);

		await this.subscriptionRepo.update(subscription._id.toString(), {
			status: "active" as SubscriptionStatus,
			current_period_start: newPeriodStart,
			current_period_end: newPeriodEnd,
			next_billing_at: newPeriodEnd,
		});

		// ── Refresh entitlements ───────────────────────────────────────────
		if (plan) {
			await this.refreshEntitlements(
				subscription.user_id.toString(),
				subscription._id.toString(),
				plan,
				newPeriodEnd,
			);
		}

		// ── Create BillingTransaction (idempotent) ─────────────────────────
		if (!alreadyRecorded) {
			await this.billingTxnRepo.create({
				user_id: subscription.user_id,
				subscription_id: subscription._id,
				invoice_id: invoice._id,
				payment_transaction_id: txn._id,
				type: "payment_received",
				amount_vnd: invoice.amount_total_vnd,
				description: `Thanh toán hoá đơn ${invoice.invoice_number}`,
				performed_by: null,
				metadata: { intent_id: txn.intent_id },
			} as any);
		}

		// ── Notify user ────────────────────────────────────────────────────
		try {
			await this.notificationSvc.send({
				type: "payment_success",
				recipient: {
					user_id: subscription.user_id.toString(),
					email: null,
					phone: null,
					push_tokens: null,
				},
				channels: ["email", "in_app"],
				payload: {
					invoice_number: invoice.invoice_number,
					amount_vnd: invoice.amount_total_vnd,
					plan_name: plan?.name ?? subscription.plan_id,
				},
				template_id: "payment_success.v1",
			});
		} catch (err) {
			// Non-critical: don't fail the activation if notification fails
			this.logger.warn("[billing] Failed to send payment success notification", { err });
		}

		// Return updated subscription
		const updated = await this.subscriptionRepo.findById(
			subscription._id.toString(),
		);
		return updated!;
	}

	/**
	 * Cancel a subscription.
	 *
	 * If at_period_end=true: keeps status="active" until current_period_end,
	 * then cron will transition to "cancelled".
	 * If at_period_end=false: immediately sets status="cancelled" and
	 * deactivates entitlements.
	 */
	public async cancelSubscription(
		userId: string,
		options: CancelSubscriptionInput,
	): Promise<ISubscription> {
		const subscription = await this.subscriptionRepo.findActiveByUserId(userId);
		if (!subscription) {
			throw new BillingError(
				"NO_ACTIVE_SUBSCRIPTION",
				"Không có gói đăng ký đang hoạt động",
			);
		}

		const now = new Date();
		const updateData: Partial<ISubscription> = {
			cancelled_at: now,
			cancel_reason: options.reason,
			cancel_at_period_end: options.at_period_end,
		};

		if (!options.at_period_end) {
			// Immediate cancellation
			updateData.status = "cancelled" as SubscriptionStatus;
			// Deactivate entitlements
			await this.entitlementRepo.deactivateBySubscriptionId(
				subscription._id.toString(),
			);
		}

		await this.subscriptionRepo.update(
			subscription._id.toString(),
			updateData,
		);

		// Audit
		await this.auditSvc.record({
			actorUserId: userId,
			action: "billing.subscription.cancelled",
			resourceType: "subscription",
			resourceId: subscription.subscription_id,
			result: "success",
			metadata: {
				at_period_end: options.at_period_end,
				reason: options.reason,
			},
		});

		this.logger.info("[billing] Subscription cancelled", {
			subscription_id: subscription.subscription_id,
			user_id: userId,
			at_period_end: options.at_period_end,
		});

		const updated = await this.subscriptionRepo.findById(
			subscription._id.toString(),
		);
		return updated!;
	}

	// ── Renewal & Expiry (Cron Jobs) ────────────────────────────────────

	/**
	 * Process subscription renewals.
	 * Called by cron job `subscription.process_renewals` (0 1 * * *).
	 *
	 * Finds all active subscriptions with next_billing_at <= now and
	 * cancel_at_period_end=false, generates a new invoice for each,
	 * and sends a renewal reminder notification.
	 */
	public async processRenewals(now?: Date): Promise<ProcessRenewalsResult> {
		const currentTime = now ?? new Date();
		const dueSubscriptions = await this.subscriptionRepo.findDueForRenewal(currentTime);

		let processed = 0;
		let failed = 0;

		for (const sub of dueSubscriptions) {
			try {
				const plan = await this.planRepo.findByPlanId(sub.plan_id);
				if (!plan || !plan.is_active) {
					// Plan no longer active — mark subscription as past_due
					await this.subscriptionRepo.update(sub._id.toString(), {
						status: "past_due" as SubscriptionStatus,
					});
					failed++;
					continue;
				}

				// Generate renewal invoice
				await this.generateInvoice(sub, plan);

				// Update next_billing_at
				const nextPeriodEnd = computeNextPeriodEnd(
					sub.current_period_end,
					plan.billing_interval,
				);
				await this.subscriptionRepo.update(sub._id.toString(), {
					status: "past_due" as SubscriptionStatus,
					next_billing_at: nextPeriodEnd,
				});

				// Send renewal reminder
				try {
					await this.notificationSvc.send({
						type: "subscription_renewal_reminder",
						recipient: {
							user_id: sub.user_id.toString(),
							email: null,
							phone: null,
							push_tokens: null,
						},
						channels: ["email", "in_app"],
						payload: {
							plan_name: plan.name,
							amount_vnd: plan.price_vnd,
							due_date: nextPeriodEnd.toISOString(),
						},
						template_id: "subscription_renewal_reminder.v1",
					});
				} catch (notifErr) {
					this.logger.warn("[billing] Failed to send renewal reminder", { notifErr });
				}

				processed++;
			} catch (err) {
				this.logger.error("[billing] Failed to process renewal", {
					subscription_id: sub.subscription_id,
					err,
				});
				failed++;
			}
		}

		this.logger.info("[billing] Renewals processed", { processed, failed });
		return { processed, failed };
	}

	/**
	 * Expire overdue subscriptions.
	 * Called by cron job `subscription.expire_overdue` (0 2 * * *).
	 *
	 * Finds subscriptions with status="past_due" and
	 * current_period_end + grace_period < now, sets status="expired",
	 * and deactivates entitlements.
	 */
	public async expireOverdue(now?: Date): Promise<ExpireOverdueResult> {
		const currentTime = now ?? new Date();
		const gracePeriodEnd = new Date(
			currentTime.getTime() - this.gracePeriodDays * 24 * 60 * 60 * 1000,
		);

		const overdueSubscriptions = await this.subscriptionRepo.findOverdueForExpiry(gracePeriodEnd);

		let expired = 0;

		for (const sub of overdueSubscriptions) {
			try {
				await this.subscriptionRepo.update(sub._id.toString(), {
					status: "expired" as SubscriptionStatus,
				});

				// Deactivate entitlements
				await this.entitlementRepo.deactivateBySubscriptionId(
					sub._id.toString(),
				);

				expired++;

				this.logger.info("[billing] Subscription expired", {
					subscription_id: sub.subscription_id,
					user_id: sub.user_id.toString(),
				});
			} catch (err) {
				this.logger.error("[billing] Failed to expire subscription", {
					subscription_id: sub.subscription_id,
					err,
				});
			}
		}

		this.logger.info("[billing] Overdue expiry completed", { expired });
		return { expired };
	}

	// ── Entitlement Check ───────────────────────────────────────────────

	/**
	 * Check if a user has an active entitlement for a specific feature.
	 */
	public async hasEntitlement(
		userId: string,
		feature: string,
	): Promise<boolean> {
		return this.entitlementRepo.hasActiveEntitlement(userId, feature);
	}

	/**
	 * Get all active entitlements for a user.
	 */
	public async getActiveEntitlements(userId: string) {
		return this.entitlementRepo.findActiveByUserId(userId);
	}

	/**
	 * Resolve the numeric limit for a feature from active entitlements.
	 * If any active grant is unlimited, the result limit is null.
	 */
	public async getEntitlementLimit(
		userId: string,
		feature: string,
	): Promise<EntitlementLimitResult> {
		const grants = await this.entitlementRepo.findActiveByUserId(userId);
		const matching = grants.filter((grant) => grant.feature === feature);
		if (matching.length === 0) {
			return { has_entitlement: false, limit: null, period: null };
		}

		const unlimited = matching.find((grant) => grant.limit === null);
		if (unlimited) {
			return {
				has_entitlement: true,
				limit: null,
				period: unlimited.period,
			};
		}

		const highest = matching.reduce((best, grant) =>
			(grant.limit ?? 0) > (best.limit ?? 0) ? grant : best,
		);
		return {
			has_entitlement: true,
			limit: highest.limit,
			period: highest.period,
		};
	}

	// ── Invoice Generation ──────────────────────────────────────────────

	/**
	 * Generate an invoice for a subscription based on its plan.
	 * Invoice number format: INV-YYYYMM-NNNNN (sequential counter per month).
	 */
	private async generateInvoice(
		subscription: ISubscription,
		plan: IPlan,
	): Promise<IInvoice> {
		const now = new Date();
		const invoiceId = ulid();
		const invoiceNumber = await this.generateInvoiceNumber(now);

		const periodStart = subscription.current_period_start;
		const periodEnd = subscription.current_period_end;

		const lineItems = [
			{
				description: plan.name,
				quantity: 1,
				unit_price_vnd: plan.price_vnd,
				amount_vnd: plan.price_vnd,
				plan_id: plan.plan_id,
			},
		];

		const amountSubtotal = plan.price_vnd;
		const amountTax = 0; // No tax for now
		const amountTotal = amountSubtotal + amountTax;

		const dueAt = addDays(now, INVOICE_DUE_DAYS);

		const invoice = await this.invoiceRepo.create({
			invoice_id: invoiceId,
			invoice_number: invoiceNumber,
			user_id: subscription.user_id,
			subscription_id: subscription._id,
			status: "open" as InvoiceStatus,
			amount_subtotal_vnd: amountSubtotal,
			amount_tax_vnd: amountTax,
			amount_total_vnd: amountTotal,
			amount_paid_vnd: 0,
			currency: "VND",
			period_start: periodStart,
			period_end: periodEnd,
			due_at: dueAt,
			paid_at: null,
			payment_transaction_ids: [],
			line_items: lineItems,
			metadata: {},
		} as Partial<IInvoice>);

		// Record billing transaction for invoice issued
		await this.billingTxnRepo.create({
			user_id: subscription.user_id,
			subscription_id: subscription._id,
			invoice_id: invoice._id,
			payment_transaction_id: null,
			type: "invoice_issued",
			amount_vnd: -amountTotal, // debit
			description: `Hoá đơn ${invoiceNumber} - ${plan.name}`,
			performed_by: null,
			metadata: {},
		} as any);

		return invoice;
	}

	/**
	 * Generate sequential invoice number: INV-YYYYMM-NNNNN
	 * Counter resets each month.
	 */
	private async generateInvoiceNumber(date: Date): Promise<string> {
		const year = date.getFullYear();
		const month = String(date.getMonth() + 1).padStart(2, "0");
		const prefix = `INV-${year}${month}-`;

		const latestNumber = await this.invoiceRepo.getLatestInvoiceNumberForMonth(prefix);

		let nextCounter = 1;
		if (latestNumber) {
			// Extract the counter part (last 5 digits)
			const counterStr = latestNumber.slice(prefix.length);
			const parsed = parseInt(counterStr, 10);
			if (!isNaN(parsed)) {
				nextCounter = parsed + 1;
			}
		}

		const counterStr = String(nextCounter).padStart(5, "0");
		return `${prefix}${counterStr}`;
	}

	// ── Entitlement Refresh ─────────────────────────────────────────────

	/**
	 * Refresh entitlement grants for a subscription based on its plan.
	 * Upserts grants for each feature in the plan, deactivates stale ones.
	 */
	private async refreshEntitlements(
		userId: string,
		subscriptionId: string,
		plan: IPlan,
		periodEnd: Date,
	): Promise<void> {
		const now = new Date();
		const existingGrants = await this.entitlementRepo.findBySubscriptionId(subscriptionId);

		// Features in the current plan
		const planFeatures = new Set(plan.entitlements.map((e) => e.feature));

		// Deactivate grants for features no longer in the plan
		for (const grant of existingGrants) {
			if (!planFeatures.has(grant.feature) && grant.is_active) {
				await this.entitlementRepo.update(grant._id.toString(), {
					is_active: false,
				});
			}
		}

		// Upsert grants for each plan entitlement
		for (const entitlement of plan.entitlements) {
			const existingGrant = existingGrants.find(
				(g) => g.feature === entitlement.feature,
			);

			if (existingGrant) {
				// Update existing grant
				await this.entitlementRepo.update(existingGrant._id.toString(), {
					is_active: true,
					starts_at: now,
					ends_at: periodEnd,
					limit: entitlement.limit,
					period: entitlement.period,
				});
			} else {
				// Create new grant
				await this.entitlementRepo.create({
					user_id: new mongoose.Types.ObjectId(userId),
					subscription_id: new mongoose.Types.ObjectId(subscriptionId),
					feature: entitlement.feature,
					source: "subscription",
					source_id: subscriptionId,
					limit: entitlement.limit,
					period: entitlement.period,
					is_active: true,
					starts_at: now,
					ends_at: periodEnd,
					metadata: { plan_id: plan.plan_id },
				} as any);
			}
		}
	}

	// ── Helpers ─────────────────────────────────────────────────────────

	/**
	 * Find the invoice associated with a payment transaction.
	 * Looks for invoices that reference this transaction or belong to the
	 * same user with status "open".
	 */
	private async findInvoiceForTransaction(
		txn: IPaymentTransaction,
	): Promise<IInvoice | null> {
		// First, check if any invoice already references this transaction
		const invoices = await this.invoiceRepo.findByUserId(
			txn.user_id.toString(),
			10,
		);

		// Find the most recent open invoice for this user
		const openInvoice = invoices.find(
			(inv) =>
				inv.status === "open" &&
				inv.amount_total_vnd === txn.amount_vnd,
		);

		if (openInvoice) return openInvoice;

		// Fallback: find invoice that already has this transaction linked
		const linkedInvoice = invoices.find((inv) =>
			inv.payment_transaction_ids.some(
				(id) => id.toString() === txn._id.toString(),
			),
		);

		return linkedInvoice ?? null;
	}
}

// ── Error class ─────────────────────────────────────────────────────────

export class BillingError extends Error {
	public readonly code: string;

	constructor(code: string, message: string) {
		super(message);
		this.name = "BillingError";
		this.code = code;
	}
}

// ── Utility functions ───────────────────────────────────────────────────

/**
 * Compute the next period end date based on billing interval.
 */
function computeNextPeriodEnd(
	start: Date,
	interval: string,
): Date {
	const result = new Date(start);

	switch (interval) {
		case "month":
			result.setMonth(result.getMonth() + 1);
			break;
		case "quarter":
			result.setMonth(result.getMonth() + 3);
			break;
		case "year":
			result.setFullYear(result.getFullYear() + 1);
			break;
		case "one_time":
			// One-time: set far future (100 years)
			result.setFullYear(result.getFullYear() + 100);
			break;
		default:
			result.setMonth(result.getMonth() + 1);
	}

	return result;
}

/**
 * Add days to a date.
 */
function addDays(date: Date, days: number): Date {
	const result = new Date(date);
	result.setDate(result.getDate() + days);
	return result;
}

// ── Singleton export ────────────────────────────────────────────────────

export const billingService = new BillingService();

export default billingService;
