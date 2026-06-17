import {
  type ScheduledJobDefinition,
  type ScheduledJobContext,
  type ScheduledJobSummary,
} from "../services/scheduler.service";
import { UserModel } from "../models/user.model";
import { learningRiskService } from "../services/risk.service";
import { parentMonitoringService } from "../services/parent-monitoring.service";

// ══════════════════════════════════════════════════════════════════════════
// Job C: risk.compute_daily
// ══════════════════════════════════════════════════════════════════════════

/**
 * risk.compute_daily
 *
 * Runs daily at 03:00 ICT (Asia/Ho_Chi_Minh timezone).
 * Computes risk score for every active student.
 * For students with risk_level = "high", triggers parent alerts
 * via parentMonitoringService.checkAndTriggerAlerts.
 *
 * Per Requirement 3.5 and 3.6.
 */
async function riskComputeDailyHandler(
  _context: ScheduledJobContext,
): Promise<ScheduledJobSummary> {
  // Find all active students
  const activeStudents = await UserModel.find({
    role: "student",
    is_active: true,
  })
    .select("_id")
    .lean()
    .exec();

  if (activeStudents.length === 0) {
    return {
      ok: true,
      metrics: { students_scanned: 0, computed: 0, high_risk: 0, alerts_triggered: 0 },
      notes: ["No active students found"],
    };
  }

  let computed = 0;
  let highRisk = 0;
  let alertsTriggered = 0;
  let errors = 0;

  for (const student of activeStudents) {
    const studentId = student._id.toString();

    try {
      const riskResult = await learningRiskService.computeRiskScore(studentId);
      computed++;

      // Trigger alerts for high risk students
      if (riskResult && riskResult.risk_level === "high") {
        highRisk++;
        try {
          await parentMonitoringService.checkAndTriggerAlerts(
            studentId as any,
          );
          alertsTriggered++;
        } catch (err) {
          // Non-blocking: alert failure shouldn't stop batch
          console.error(
            `[risk.compute_daily] Failed to trigger alerts for student ${studentId}:`,
            err instanceof Error ? err.message : err,
          );
        }
      }
    } catch (err) {
      errors++;
      // Non-blocking: individual student failure shouldn't stop batch
      console.error(
        `[risk.compute_daily] Failed to compute risk for student ${studentId}:`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  return {
    ok: errors === 0,
    metrics: {
      students_scanned: activeStudents.length,
      computed,
      high_risk: highRisk,
      alerts_triggered: alertsTriggered,
      errors,
    },
  };
}

// ── Job C Definition ────────────────────────────────────────────────────

export const riskComputeDailyJob: ScheduledJobDefinition = {
  name: "risk.compute_daily",
  cronExpression: "0 3 * * *",
  timezone: "Asia/Ho_Chi_Minh",
  enabled: true,
  lockTimeoutMs: 3_600_000, // 1 hour
  run: riskComputeDailyHandler,
};
