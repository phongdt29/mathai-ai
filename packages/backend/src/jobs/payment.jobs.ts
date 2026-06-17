import {
  type ScheduledJobDefinition,
  type ScheduledJobContext,
  type ScheduledJobSummary,
} from "../services/scheduler.service";
import { paymentTransactionRepository } from "../models/payment-transaction.model";
import { notificationService } from "../services/notification.service";

// ══════════════════════════════════════════════════════════════════════════
// Job G: payment.expire_stale_pending
// ══════════════════════════════════════════════════════════════════════════

/**
 * payment.expire_stale_pending
 *
 * Runs every 15 minutes.
 * Finds PaymentTransaction records with:
 *   - status = "pending"
 *   - expires_at < now
 *
 * For each stale transaction:
 *   1. Sets status = "expired"
 *   2. Dispatches notification `payment_intent_expired` to the user
 *
 * Per Requirement 9.13.
 */
async function expireStalePendingHandler(
  _context: ScheduledJobContext,
): Promise<ScheduledJobSummary> {
  // Find stale pending transactions
  const staleTransactions = await paymentTransactionRepository.findStalePending();

  if (staleTransactions.length === 0) {
    return {
      ok: true,
      metrics: { eligible: 0, expired: 0, notified: 0, errors: 0 },
      notes: ["No stale pending transactions found"],
    };
  }

  let expired = 0;
  let notified = 0;
  let errors = 0;

  for (const txn of staleTransactions) {
    try {
      // Mark as expired
      await paymentTransactionRepository.markExpired(txn._id.toString());
      expired++;

      // Dispatch notification to the user
      try {
        await notificationService.send({
          type: "payment_intent_expired",
          recipient: {
            user_id: txn.user_id.toString(),
            email: null,
            phone: null,
            push_tokens: null,
          },
          channels: ["in_app"],
          payload: {
            intent_id: txn.intent_id,
            gateway: txn.gateway,
            amount_vnd: txn.amount_vnd,
          },
          template_id: "payment_intent_expired.v1",
          idempotency_key: `payment_expired_${txn.intent_id}`,
          metadata: {
            intent_id: txn.intent_id,
            gateway: txn.gateway,
          },
        });
        notified++;
      } catch (notifErr) {
        // Non-blocking: notification failure shouldn't stop expiration batch
        console.error(
          `[payment.expire_stale_pending] Failed to notify user ${txn.user_id} for intent ${txn.intent_id}:`,
          notifErr instanceof Error ? notifErr.message : notifErr,
        );
      }
    } catch (err) {
      errors++;
      console.error(
        `[payment.expire_stale_pending] Failed to expire intent ${txn.intent_id}:`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  return {
    ok: errors === 0,
    metrics: {
      eligible: staleTransactions.length,
      expired,
      notified,
      errors,
    },
  };
}

// ── Job G Definition ────────────────────────────────────────────────────

export const paymentExpireStalePendingJob: ScheduledJobDefinition = {
  name: "payment.expire_stale_pending",
  cronExpression: "*/15 * * * *",
  timezone: "Asia/Ho_Chi_Minh",
  enabled: true,
  lockTimeoutMs: 600_000, // 10 minutes
  run: expireStalePendingHandler,
};
