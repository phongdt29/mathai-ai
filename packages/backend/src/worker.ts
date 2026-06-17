import "dotenv/config";
import mongoose from "mongoose";
import { connectDatabase } from "./config/database";
import { schedulerService } from "./services/scheduler.service";
import { attendanceMarkPendingJob, attendanceFinalizeJob } from "./jobs/attendance.jobs";
import { riskComputeDailyJob } from "./jobs/risk.jobs";
import { parentWeeklyReportJob } from "./jobs/parent-report.jobs";
import { notificationRetryFailedJob } from "./jobs/notification.jobs";
import { ocrCleanupExpiredJob } from "./jobs/ocr.jobs";
import { analyticsRefreshDailyJob } from "./jobs/analytics.jobs";
import { paymentExpireStalePendingJob } from "./jobs/payment.jobs";
import { gamificationRefreshLeaderboardsJob } from "./jobs/gamification.jobs";
import { subscriptionProcessRenewalsJob, subscriptionExpireOverdueJob } from "./jobs/subscription.jobs";
import { billingSendInvoiceRemindersJob } from "./jobs/billing.jobs";
import { studentForgettingAlertJob } from "./jobs/learning-reminder.jobs";

// ── Feature flag guard ──────────────────────────────────────────────────

const FEATURE_SCHEDULER_ENABLED =
  process.env.FEATURE_SCHEDULER_ENABLED?.trim().toLowerCase();

const ENABLED_VALUES = new Set(["1", "true", "yes", "on", "enabled"]);

if (!FEATURE_SCHEDULER_ENABLED || !ENABLED_VALUES.has(FEATURE_SCHEDULER_ENABLED)) {
  console.log("scheduler disabled");
  process.exit(0);
}

// ── Job registration ────────────────────────────────────────────────────

/**
 * Register all scheduled jobs.
 * Jobs are implemented in packages/backend/src/jobs/*.ts
 * and will be added as tasks 5.3–5.6 are completed.
 */
function registerJobs(): void {
  // Job A: Mark pending absences (task 5.3)
  schedulerService.registerJob(attendanceMarkPendingJob);

  // Job B: Finalize absences (task 5.4)
  schedulerService.registerJob(attendanceFinalizeJob);

  // Job E: Retry failed notifications (task 5.6)
  schedulerService.registerJob(notificationRetryFailedJob);

  // Job F: Cleanup expired OCR results (task 5.6)
  schedulerService.registerJob(ocrCleanupExpiredJob);

  // Job C: Compute daily risk scores (task 5.5)
  schedulerService.registerJob(riskComputeDailyJob);

  // Job D: Send parent weekly reports (task 5.5)
  schedulerService.registerJob(parentWeeklyReportJob);

  // Job G: Expire stale pending payment intents (task 17.4)
  schedulerService.registerJob(paymentExpireStalePendingJob);

  // Job K: Refresh daily analytics (task 20.2)
  schedulerService.registerJob(analyticsRefreshDailyJob);

  // Job L: Refresh leaderboards (task 21.3)
  schedulerService.registerJob(gamificationRefreshLeaderboardsJob);

  // Job H: Process subscription renewals (task 18.3)
  schedulerService.registerJob(subscriptionProcessRenewalsJob);

  // Job I: Expire overdue subscriptions (task 18.3)
  schedulerService.registerJob(subscriptionExpireOverdueJob);

  // Job J: Send invoice reminders (task 18.3)
  schedulerService.registerJob(billingSendInvoiceRemindersJob);

  // Job M: Student "forgetting curve" alerts (Module 9 — cảnh báo sắp quên bài)
  schedulerService.registerJob(studentForgettingAlertJob);
}

// ── Bootstrap ───────────────────────────────────────────────────────────

async function bootstrap(): Promise<void> {
  console.log("🕐 MathAI Worker starting...");

  // Connect to MongoDB (same pattern as main index.ts)
  await connectDatabase();
  console.log("✅ Database connected");

  // Register all jobs
  registerJobs();

  // Start the scheduler
  await schedulerService.start();
  console.log("✅ Scheduler started");
}

// ── Graceful shutdown ───────────────────────────────────────────────────

async function shutdown(signal: string): Promise<void> {
  console.log(`\n${signal} received — shutting down worker...`);

  try {
    await schedulerService.stop();
    console.log("✅ Scheduler stopped");
  } catch (err) {
    console.error("Error stopping scheduler:", err);
  }

  try {
    await mongoose.disconnect();
    console.log("✅ Database disconnected");
  } catch (err) {
    console.error("Error disconnecting database:", err);
  }

  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

// ── Start ───────────────────────────────────────────────────────────────

bootstrap().catch((err) => {
  console.error("Failed to start worker:", err);
  process.exit(1);
});
