import {
  type ScheduledJobDefinition,
  type ScheduledJobContext,
  type ScheduledJobSummary,
} from "../services/scheduler.service";
import {
  NotificationDeliveryModel,
  notificationDeliveryRepository,
} from "../models/notification-delivery.model";
import { notificationService } from "../services/notification.service";

// ── Constants ───────────────────────────────────────────────────────────

/**
 * Maximum number of retries before a delivery is considered permanently failed.
 */
const MAX_RETRIES = 3;

// ══════════════════════════════════════════════════════════════════════════
// Job E: notification.retry_failed
// ══════════════════════════════════════════════════════════════════════════

/**
 * notification.retry_failed
 *
 * Runs every 5 minutes.
 * Finds NotificationDelivery records with:
 *   - status = "failed"
 *   - next_retry_at <= now
 *   - retry_count < MAX_RETRIES (3)
 *
 * For each eligible delivery, re-dispatches via notificationService.send
 * using the original delivery data.
 *
 * Per Requirement 3.8.
 */
async function retryFailedHandler(
  _context: ScheduledJobContext,
): Promise<ScheduledJobSummary> {
  // Find failed deliveries eligible for retry
  const failedDeliveries =
    await notificationDeliveryRepository.findFailedForRetry(MAX_RETRIES);

  if (failedDeliveries.length === 0) {
    return {
      ok: true,
      metrics: { eligible: 0, retried: 0, failed: 0 },
      notes: ["No failed deliveries eligible for retry"],
    };
  }

  let retried = 0;
  let failed = 0;

  for (const delivery of failedDeliveries) {
    try {
      // Re-dispatch using the original delivery data
      await notificationService.send({
        type: delivery.type as any,
        recipient: {
          user_id: delivery.recipient.user_id?.toString() ?? null,
          email: delivery.recipient.email ?? null,
          phone: delivery.recipient.phone ?? null,
          push_tokens: null,
        },
        channels: [...delivery.channels],
        payload: (delivery.metadata as Record<string, unknown>) ?? {},
        template_id: delivery.template_id,
        // Use a new idempotency key for retry to allow re-dispatch
        // The original idempotency_key would block re-send
        metadata: {
          retry_of: delivery._id.toString(),
          original_idempotency_key: delivery.idempotency_key,
        },
      });

      // Increment retry_count on the original delivery
      await NotificationDeliveryModel.updateOne(
        { _id: delivery._id },
        {
          $inc: { retry_count: 1 },
          $set: { next_retry_at: null },
        },
      ).exec();

      retried++;
    } catch (err) {
      // Update retry_count and set next_retry_at with exponential backoff
      const nextRetryCount = delivery.retry_count + 1;
      const backoffMs = Math.min(
        60_000 * Math.pow(2, nextRetryCount),
        3_600_000,
      ); // max 1 hour
      const nextRetryAt = new Date(Date.now() + backoffMs);

      await NotificationDeliveryModel.updateOne(
        { _id: delivery._id },
        {
          $set: {
            retry_count: nextRetryCount,
            next_retry_at: nextRetryAt,
          },
        },
      ).exec();

      failed++;

      console.error(
        `[notification.retry_failed] Failed to retry delivery ${delivery._id}:`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  return {
    ok: true,
    metrics: {
      eligible: failedDeliveries.length,
      retried,
      failed,
    },
  };
}

// ── Job E Definition ────────────────────────────────────────────────────

export const notificationRetryFailedJob: ScheduledJobDefinition = {
  name: "notification.retry_failed",
  cronExpression: "*/5 * * * *",
  timezone: "Asia/Ho_Chi_Minh",
  enabled: true,
  lockTimeoutMs: 240_000, // 4 minutes
  run: retryFailedHandler,
};
