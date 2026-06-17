import {
  type ScheduledJobDefinition,
  type ScheduledJobContext,
  type ScheduledJobSummary,
} from "../services/scheduler.service";
import { parentWeeklyReportSchedulerService } from "../services/parent-weekly-report-scheduler.service";

// ══════════════════════════════════════════════════════════════════════════
// Job D: parent_weekly_report.send
// ══════════════════════════════════════════════════════════════════════════

/**
 * parent_weekly_report.send
 *
 * Runs every Monday at 07:00 ICT (Asia/Ho_Chi_Minh timezone).
 * Wraps parentWeeklyReportSchedulerService.run with period_key = ISO week
 * of the previous Sunday.
 *
 * Per Requirement 3.7.
 */
async function parentWeeklyReportHandler(
  _context: ScheduledJobContext,
): Promise<ScheduledJobSummary> {
  const periodKey = getISOWeekOfPreviousSunday();

  const result = await parentWeeklyReportSchedulerService.run({
    periodKey,
    rangeDays: 7,
  });

  return {
    ok: result.failed === 0,
    metrics: {
      scanned: result.scanned,
      delivered: result.delivered,
      skipped_opt_out: result.skippedOptOut,
      skipped_existing: result.skippedExisting,
      skipped_empty_report: result.skippedEmptyReport,
      failed: result.failed,
    },
    notes: result.failures.length > 0
      ? result.failures.map(
          (f) => `parent=${f.parentUserId}: ${f.error}`,
        )
      : undefined,
  };
}

// ── Helpers ─────────────────────────────────────────────────────────────

/**
 * Compute the ISO week key (YYYY-Www) of the previous Sunday relative to now
 * in Asia/Ho_Chi_Minh timezone.
 *
 * Example: If today is Monday 2024-01-08, previous Sunday is 2024-01-07.
 * ISO week of 2024-01-07 is 2024-W01.
 */
function getISOWeekOfPreviousSunday(): string {
  // Get current date in ICT
  const now = new Date();
  const ictDateStr = now.toLocaleDateString("sv-SE", {
    timeZone: "Asia/Ho_Chi_Minh",
  });
  const [year, month, day] = ictDateStr.split("-").map(Number);
  const ictDate = new Date(year!, month! - 1, day!);

  // Go back to previous Sunday
  // getDay(): 0=Sunday, 1=Monday, ..., 6=Saturday
  const dayOfWeek = ictDate.getDay();
  // If today is Monday (1), previous Sunday is 1 day ago
  // If today is Sunday (0), previous Sunday is 7 days ago (last week's Sunday)
  const daysBack = dayOfWeek === 0 ? 7 : dayOfWeek;
  const previousSunday = new Date(ictDate);
  previousSunday.setDate(ictDate.getDate() - daysBack);

  // Compute ISO week number for that Sunday
  return computeISOWeekKey(previousSunday);
}

/**
 * Compute ISO 8601 week key (YYYY-Www) for a given date.
 * ISO weeks start on Monday. Week 1 is the week containing the first Thursday of the year.
 */
function computeISOWeekKey(date: Date): string {
  // Copy date to avoid mutation
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));

  // Set to nearest Thursday: current date + 4 - current day number
  // Make Sunday's day number 7
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);

  // Get first day of year
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));

  // Calculate full weeks to nearest Thursday
  const weekNo = Math.ceil(
    ((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7,
  );

  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

// ── Job D Definition ────────────────────────────────────────────────────

export const parentWeeklyReportJob: ScheduledJobDefinition = {
  name: "parent_weekly_report.send",
  cronExpression: "0 7 * * 1",
  timezone: "Asia/Ho_Chi_Minh",
  enabled: true,
  lockTimeoutMs: 3_600_000, // 1 hour
  run: parentWeeklyReportHandler,
};
