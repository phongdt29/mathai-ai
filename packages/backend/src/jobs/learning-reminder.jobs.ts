import {
  type ScheduledJobContext,
  type ScheduledJobDefinition,
  type ScheduledJobSummary,
} from "../services/scheduler.service";
import { studentProfileRepository } from "../models/student.model";
import { recommendationService } from "../services/recommendation.service";
import { notificationService } from "../services/notification.service";
import { shouldAlertForgetting } from "../utils/notification-rules";

// ══════════════════════════════════════════════════════════════════════════
// Job: student.forgetting_alert (Module 9 — "cảnh báo sắp quên bài")
// ══════════════════════════════════════════════════════════════════════════

/**
 * Quét học sinh, dùng recommendationService để lấy các chủ đề đang trong vùng
 * nguy cơ quên (forgetting curve). Nếu có → gửi cảnh báo "sắp quên bài" cho học
 * sinh qua in_app + push. Fail-soft theo từng học sinh.
 */
async function studentForgettingAlertHandler(
  _context: ScheduledJobContext,
): Promise<ScheduledJobSummary> {
  const studentIds = await studentProfileRepository.findAllStudentIds();

  let scanned = 0;
  let alerted = 0;
  let failed = 0;

  for (const studentId of studentIds) {
    scanned += 1;
    try {
      const recommendation =
        await recommendationService.getAdaptiveRecommendation(studentId);
      const topics = recommendation.signals.forgetting_risk_topics ?? [];

      if (!shouldAlertForgetting(topics)) {
        continue;
      }

      const profile = await studentProfileRepository.findWithUser(studentId);
      const userId = profile?.user_id ? String(profile.user_id) : null;
      if (!userId) {
        continue;
      }

      await notificationService.send({
        type: "student_forgetting_alert",
        recipient: {
          user_id: userId,
          email: null,
          phone: null,
          push_tokens: null,
        },
        channels: ["in_app", "push"],
        template_id: "student_forgetting_alert.v1",
        payload: {
          student_full_name:
            (profile as { user?: { full_name?: string } })?.user?.full_name ??
            "bạn",
          topics: topics.slice(0, 5).join(", "),
        },
        idempotency_key: `forgetting:${studentId}:${todayKey()}`,
        severity: "warning",
      });
      alerted += 1;
    } catch (err) {
      failed += 1;
      console.warn(
        `[student.forgetting_alert] failed for ${studentId}:`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  return { ok: true, metrics: { scanned, alerted, failed } };
}

/** Khóa idempotency theo ngày (chạy job nhắc 1 lần/ngày/học sinh). */
function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

export const studentForgettingAlertJob: ScheduledJobDefinition = {
  name: "student.forgetting_alert",
  cronExpression: "0 18 * * *", // 18:00 hằng ngày
  timezone: "Asia/Ho_Chi_Minh",
  enabled: true,
  lockTimeoutMs: 540_000,
  run: studentForgettingAlertHandler,
};
