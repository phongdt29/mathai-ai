import {
  type ScheduledJobDefinition,
  type ScheduledJobContext,
  type ScheduledJobSummary,
} from "../services/scheduler.service";
import { analyticsAggregateService } from "../services/analytics-aggregate.service";

// ══════════════════════════════════════════════════════════════════════════
// Job K: analytics.refresh_daily
// ══════════════════════════════════════════════════════════════════════════

/**
 * Get yesterday's date in ICT (Asia/Ho_Chi_Minh, UTC+7) as YYYY-MM-DD string.
 */
function getYesterdayICT(): string {
  const now = new Date();
  // Convert to ICT by adding 7 hours offset
  const ictNow = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  // Subtract one day
  ictNow.setUTCDate(ictNow.getUTCDate() - 1);
  const year = ictNow.getUTCFullYear();
  const month = String(ictNow.getUTCMonth() + 1).padStart(2, "0");
  const day = String(ictNow.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * analytics.refresh_daily
 *
 * Runs daily at 02:00 ICT (Asia/Ho_Chi_Minh timezone).
 * Refreshes all 4 analytics collections for the previous day (ICT):
 * - analytics_daily_user_activity
 * - analytics_daily_revenue
 * - analytics_cohort_retention
 * - analytics_lesson_engagement
 *
 * Idempotent: running twice for the same date produces the same final state.
 *
 * Per Requirements 11.2, 11.3, 11.4, 11.8.
 */
async function analyticsRefreshDailyHandler(
  _context: ScheduledJobContext,
): Promise<ScheduledJobSummary> {
  const yesterday = getYesterdayICT();

  try {
    await analyticsAggregateService.refreshAll(yesterday);

    return {
      ok: true,
      metrics: {
        date_refreshed: 1,
        collections_refreshed: 4,
      },
      notes: [`Refreshed analytics for date: ${yesterday}`],
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      metrics: {
        date_refreshed: 0,
        errors: 1,
      },
      notes: [`Failed to refresh analytics for ${yesterday}: ${errorMessage}`],
    };
  }
}

// ── Job K Definition ────────────────────────────────────────────────────

export const analyticsRefreshDailyJob: ScheduledJobDefinition = {
  name: "analytics.refresh_daily",
  cronExpression: "0 2 * * *",
  timezone: "Asia/Ho_Chi_Minh",
  enabled: true,
  lockTimeoutMs: 1_800_000, // 30 minutes
  run: analyticsRefreshDailyHandler,
};
