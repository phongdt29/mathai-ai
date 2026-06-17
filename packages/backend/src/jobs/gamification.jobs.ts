import {
  type ScheduledJobDefinition,
  type ScheduledJobContext,
  type ScheduledJobSummary,
} from "../services/scheduler.service";
import { gamificationService } from "../services/gamification.service";
import type { LeaderboardScope, LeaderboardPeriod } from "../models/leaderboard-snapshot.model";

// ══════════════════════════════════════════════════════════════════════════
// Job L: gamification.refresh_leaderboards
// ══════════════════════════════════════════════════════════════════════════

/**
 * Get the current ISO week key in format "YYYY-Www" based on ICT (UTC+7).
 */
function getCurrentWeekKeyICT(): string {
  const now = new Date();
  // Convert to ICT
  const ict = new Date(now.getTime() + 7 * 60 * 60 * 1000);

  // ISO week calculation
  const year = ict.getUTCFullYear();
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const dayOfWeek = jan4.getUTCDay() || 7;
  const mondayOfWeek1 = new Date(jan4);
  mondayOfWeek1.setUTCDate(jan4.getUTCDate() - dayOfWeek + 1);

  const diffMs = ict.getTime() - mondayOfWeek1.getTime();
  const diffDays = Math.floor(diffMs / (24 * 60 * 60 * 1000));
  const weekNumber = Math.floor(diffDays / 7) + 1;

  return `${year}-W${String(weekNumber).padStart(2, "0")}`;
}

/**
 * Get the current month key in format "YYYY-MM" based on ICT (UTC+7).
 */
function getCurrentMonthKeyICT(): string {
  const now = new Date();
  // Convert to ICT
  const ict = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  const year = ict.getUTCFullYear();
  const month = String(ict.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

/**
 * Scope/period combinations to refresh.
 * Global scope covers all students (scopeId = null).
 */
interface LeaderboardRefreshTarget {
  scope: LeaderboardScope;
  scopeId: string | null;
  period: LeaderboardPeriod;
  periodKey: string;
}

/**
 * Build the list of leaderboard targets to refresh.
 * At minimum: global/weekly, global/monthly, global/all_time.
 */
function buildRefreshTargets(): LeaderboardRefreshTarget[] {
  const weekKey = getCurrentWeekKeyICT();
  const monthKey = getCurrentMonthKeyICT();

  return [
    { scope: "global", scopeId: null, period: "weekly", periodKey: weekKey },
    { scope: "global", scopeId: null, period: "monthly", periodKey: monthKey },
    { scope: "global", scopeId: null, period: "all_time", periodKey: "all" },
  ];
}

/**
 * gamification.refresh_leaderboards
 *
 * Runs daily at 05:00 ICT (Asia/Ho_Chi_Minh timezone).
 * Refreshes global weekly, monthly, and all_time leaderboards by calling
 * gamificationService.refreshLeaderboard for each scope/period combination.
 *
 * Idempotent: running multiple times produces the same final state
 * (upsert on compound unique index scope+scope_id+period+period_key).
 *
 * Per Requirements 12.8.
 */
async function gamificationRefreshLeaderboardsHandler(
  _context: ScheduledJobContext,
): Promise<ScheduledJobSummary> {
  const targets = buildRefreshTargets();
  let refreshed = 0;
  let errors = 0;
  const notes: string[] = [];

  for (const target of targets) {
    try {
      await gamificationService.refreshLeaderboard(
        target.scope,
        target.scopeId,
        target.period,
        target.periodKey,
      );
      refreshed++;
    } catch (error) {
      errors++;
      const errorMessage = error instanceof Error ? error.message : String(error);
      notes.push(
        `Failed ${target.scope}/${target.period}/${target.periodKey}: ${errorMessage}`,
      );
    }
  }

  if (refreshed > 0) {
    notes.unshift(`Refreshed ${refreshed} leaderboard(s)`);
  }

  return {
    ok: errors === 0,
    metrics: {
      leaderboards_refreshed: refreshed,
      errors,
    },
    notes,
  };
}

// ── Job L Definition ────────────────────────────────────────────────────

export const gamificationRefreshLeaderboardsJob: ScheduledJobDefinition = {
  name: "gamification.refresh_leaderboards",
  cronExpression: "0 5 * * *",
  timezone: "Asia/Ho_Chi_Minh",
  enabled: true,
  lockTimeoutMs: 600_000, // 10 minutes
  run: gamificationRefreshLeaderboardsHandler,
};
