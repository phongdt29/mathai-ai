import {
  type ScheduledJobDefinition,
  type ScheduledJobContext,
  type ScheduledJobSummary,
} from "../services/scheduler.service";
import { billingService } from "../services/billing.service";

// ══════════════════════════════════════════════════════════════════════════
// Job H: subscription.process_renewals
// ══════════════════════════════════════════════════════════════════════════

/**
 * subscription.process_renewals
 *
 * Runs daily at 01:00 ICT.
 * Finds all active subscriptions with next_billing_at <= now and
 * cancel_at_period_end=false, generates a new invoice for each,
 * and sends a renewal reminder notification.
 *
 * Per Requirement 10.9.
 */
async function processRenewalsHandler(
  _context: ScheduledJobContext,
): Promise<ScheduledJobSummary> {
  const result = await billingService.processRenewals();

  return {
    ok: result.failed === 0,
    metrics: {
      processed: result.processed,
      failed: result.failed,
    },
    notes:
      result.failed > 0
        ? [`${result.failed} renewal(s) failed to process`]
        : undefined,
  };
}

export const subscriptionProcessRenewalsJob: ScheduledJobDefinition = {
  name: "subscription.process_renewals",
  cronExpression: "0 1 * * *",
  timezone: "Asia/Ho_Chi_Minh",
  enabled: true,
  lockTimeoutMs: 600_000, // 10 minutes
  run: processRenewalsHandler,
};

// ══════════════════════════════════════════════════════════════════════════
// Job I: subscription.expire_overdue
// ══════════════════════════════════════════════════════════════════════════

/**
 * subscription.expire_overdue
 *
 * Runs daily at 02:00 ICT.
 * Finds subscriptions with status="past_due" and
 * current_period_end + grace_period < now, sets status="expired",
 * and deactivates entitlements.
 *
 * Per Requirement 10.10.
 */
async function expireOverdueHandler(
  _context: ScheduledJobContext,
): Promise<ScheduledJobSummary> {
  const result = await billingService.expireOverdue();

  return {
    ok: true,
    metrics: {
      expired: result.expired,
    },
  };
}

export const subscriptionExpireOverdueJob: ScheduledJobDefinition = {
  name: "subscription.expire_overdue",
  cronExpression: "0 2 * * *",
  timezone: "Asia/Ho_Chi_Minh",
  enabled: true,
  lockTimeoutMs: 600_000, // 10 minutes
  run: expireOverdueHandler,
};
