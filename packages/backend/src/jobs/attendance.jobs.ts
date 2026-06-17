import {
  type ScheduledJobDefinition,
  type ScheduledJobContext,
  type ScheduledJobSummary,
} from "../services/scheduler.service";
import { LessonModel } from "../models/lesson.model";
import {
  AttendanceRecordModel,
  EngagementSessionModel,
} from "../models/engagement.model";
import { learningRiskService } from "../services/risk.service";
import { notificationService } from "../services/notification.service";
import { parentChildRepository } from "../models/parent-child.model";

// ── Constants ───────────────────────────────────────────────────────────

const ATTENDANCE_LATE_TO_PENDING_GRACE_MINUTES = Number(
  process.env.ATTENDANCE_LATE_TO_PENDING_GRACE_MINUTES ?? "15",
);

const ATTENDANCE_FINAL_GRACE_MINUTES = Number(
  process.env.ATTENDANCE_FINAL_GRACE_MINUTES ?? "30",
);

/**
 * Status priority map — higher number = higher priority.
 * Only "upgrade" is allowed (absent → absent_pending → partial → present).
 */
const STATUS_PRIORITY: Record<string, number> = {
  absent: 1,
  absent_pending: 2,
  partial: 3,
  present: 4,
};

// ── Job A Handler ───────────────────────────────────────────────────────

/**
 * attendance.mark_pending_absences
 *
 * Runs every 10 minutes (Asia/Ho_Chi_Minh timezone).
 * Finds lessons scheduled for today where:
 *   - lesson_date = today (ICT)
 *   - scheduled_start_time + ATTENDANCE_LATE_TO_PENDING_GRACE_MINUTES has passed
 * For each lesson, finds students who don't have an active engagement session.
 * For those students, upserts AttendanceRecord with status="absent_pending"
 * only if the current status is not already present/partial/absent_pending.
 *
 * Per Requirement 3.2: AttendanceRecord hiện tại có status không thuộc
 * {present, partial, absent_pending, absent} → upsert absent_pending.
 * In practice this means: create new record if none exists, or upgrade
 * from "absent" (priority 1) to "absent_pending" (priority 2).
 */
async function markPendingAbsencesHandler(
  _context: ScheduledJobContext,
): Promise<ScheduledJobSummary> {
  const now = new Date();
  const todayStr = toICTDateString(now);

  // Find lessons for today that have a lesson_date matching today (ICT)
  const todayStart = getICTDayStart(todayStr);
  const todayEnd = getICTDayEnd(todayStr);

  const lessonsToday = await LessonModel.find({
    lesson_date: { $gte: todayStart, $lte: todayEnd },
  })
    .select("_id student_id lesson_date estimated_minutes curriculum_id")
    .lean()
    .exec();

  if (lessonsToday.length === 0) {
    return {
      ok: true,
      metrics: { lessons_checked: 0, records_upserted: 0 },
      notes: ["No lessons scheduled for today"],
    };
  }

  const graceMs = ATTENDANCE_LATE_TO_PENDING_GRACE_MINUTES * 60 * 1000;

  let recordsUpserted = 0;
  let lessonsChecked = 0;

  for (const lesson of lessonsToday) {
    // Determine the lesson's scheduled start time from lesson_date
    const lessonStart = new Date(lesson.lesson_date!);

    // Check if grace period has passed
    const graceDeadline = new Date(lessonStart.getTime() + graceMs);
    if (now < graceDeadline) {
      // Grace period hasn't passed yet for this lesson — skip
      continue;
    }

    lessonsChecked++;

    // Check if student has an active engagement session for this lesson
    const activeSession = await EngagementSessionModel.findOne({
      student_id: lesson.student_id,
      lesson_id: lesson._id,
      status: "active",
    })
      .lean()
      .exec();

    if (activeSession) {
      // Student is currently engaged — skip
      continue;
    }

    // Check existing attendance record for this student + lesson
    const existingRecord = await AttendanceRecordModel.findOne({
      student_id: lesson.student_id,
      lesson_id: lesson._id,
    })
      .lean()
      .exec();

    if (existingRecord) {
      const existingPriority = STATUS_PRIORITY[existingRecord.status] ?? 0;
      const pendingPriority = STATUS_PRIORITY["absent_pending"];

      // Only upgrade: if existing status has priority >= absent_pending, skip
      if (existingPriority >= pendingPriority) {
        continue;
      }

      // Upgrade from absent (priority 1) to absent_pending (priority 2)
      await AttendanceRecordModel.updateOne(
        { _id: existingRecord._id },
        {
          $set: {
            status: "absent_pending",
            status_reason: "Quá thời gian grace, chưa có phiên học",
          },
        },
      ).exec();
      recordsUpserted++;
    } else {
      // No record exists — create with absent_pending
      await AttendanceRecordModel.create({
        student_id: lesson.student_id,
        lesson_id: lesson._id,
        curriculum_id: (lesson as any).curriculum_id ?? null,
        scheduled_date: todayStr,
        status: "absent_pending",
        expected_duration_minutes: lesson.estimated_minutes ?? 45,
        active_duration_seconds: 0,
        focus_ratio: 0,
        quiz_completed: false,
        status_reason: "Quá thời gian grace, chưa có phiên học",
      });
      recordsUpserted++;
    }
  }

  return {
    ok: true,
    metrics: {
      lessons_checked: lessonsChecked,
      records_upserted: recordsUpserted,
      total_lessons_today: lessonsToday.length,
    },
  };
}

// ── Helpers ─────────────────────────────────────────────────────────────

/**
 * Convert a Date to YYYY-MM-DD string in Asia/Ho_Chi_Minh timezone.
 */
function toICTDateString(date: Date): string {
  return date.toLocaleDateString("sv-SE", { timeZone: "Asia/Ho_Chi_Minh" });
}

/**
 * Get the start of a day (00:00:00) in ICT as a UTC Date.
 */
function getICTDayStart(dateStr: string): Date {
  // dateStr is YYYY-MM-DD in ICT
  // ICT is UTC+7, so 00:00 ICT = 17:00 previous day UTC
  const [year, month, day] = dateStr.split("-").map(Number);
  const utcDate = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
  // Subtract 7 hours to convert ICT midnight to UTC
  utcDate.setUTCHours(utcDate.getUTCHours() - 7);
  return utcDate;
}

/**
 * Get the end of a day (23:59:59.999) in ICT as a UTC Date.
 */
function getICTDayEnd(dateStr: string): Date {
  const [year, month, day] = dateStr.split("-").map(Number);
  const utcDate = new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999));
  // Subtract 7 hours to convert ICT end-of-day to UTC
  utcDate.setUTCHours(utcDate.getUTCHours() - 7);
  return utcDate;
}

// ── Job Definition Export ────────────────────────────────────────────────

export const attendanceMarkPendingJob: ScheduledJobDefinition = {
  name: "attendance.mark_pending_absences",
  cronExpression: "*/10 * * * *",
  timezone: "Asia/Ho_Chi_Minh",
  enabled: true,
  lockTimeoutMs: 540_000, // 9 minutes
  run: markPendingAbsencesHandler,
};

// ══════════════════════════════════════════════════════════════════════════
// Job B: attendance.finalize_absences
// ══════════════════════════════════════════════════════════════════════════

/**
 * attendance.finalize_absences
 *
 * Runs every 30 minutes (Asia/Ho_Chi_Minh timezone).
 * Finds AttendanceRecords with status="absent_pending" where:
 *   - scheduled_start_time + expected_duration_minutes + ATTENDANCE_FINAL_GRACE_MINUTES has passed
 *   - No qualifying engagement session exists for the student + lesson
 *
 * For each qualifying record:
 *   1. Transition status from absent_pending → absent (enforce status priority — only upgrade, never downgrade)
 *   2. Call riskService.computeRiskScore for the student
 *   3. Dispatch notification type="parent_absent_alert" to parent via notificationService
 *
 * Per Requirement 3.3 and 3.4.
 */
async function finalizeAbsencesHandler(
  _context: ScheduledJobContext,
): Promise<ScheduledJobSummary> {
  const now = new Date();

  // Find all records with status="absent_pending"
  const pendingRecords = await AttendanceRecordModel.find({
    status: "absent_pending",
  })
    .lean()
    .exec();

  if (pendingRecords.length === 0) {
    return {
      ok: true,
      metrics: { pending_checked: 0, finalized: 0, skipped: 0 },
      notes: ["No absent_pending records found"],
    };
  }

  let finalized = 0;
  let skipped = 0;

  for (const record of pendingRecords) {
    // Determine the deadline: scheduled_start_time + expected_duration + final grace
    // Use lesson_date (scheduled_date) as the base if scheduled_start_time is not set
    let lessonStart: Date;
    if (record.scheduled_start_time) {
      // scheduled_start_time is stored as ISO string or time string
      lessonStart = new Date(record.scheduled_start_time);
    } else {
      // Fall back to the lesson_date (start of day in ICT)
      lessonStart = getICTDayStart(record.scheduled_date);
    }

    const expectedDuration = record.expected_duration_minutes ?? 45;
    const deadlineMs =
      lessonStart.getTime() +
      expectedDuration * 60 * 1000 +
      ATTENDANCE_FINAL_GRACE_MINUTES * 60 * 1000;

    if (now.getTime() < deadlineMs) {
      // Deadline hasn't passed yet — skip
      skipped++;
      continue;
    }

    // Check if a qualifying engagement session exists
    // A qualifying session has enough active_seconds (>= 120s / 2 min minimum)
    const qualifyingSession = await EngagementSessionModel.findOne({
      student_id: record.student_id,
      lesson_id: record.lesson_id,
      status: { $in: ["active", "completed"] },
      active_duration_seconds: { $gte: 120 },
    })
      .lean()
      .exec();

    if (qualifyingSession) {
      // Student has a qualifying session — don't finalize as absent
      skipped++;
      continue;
    }

    // Enforce status priority: only allow finalization from absent_pending
    // If status has been upgraded (e.g., to partial or present) since query, skip
    const currentPriority = STATUS_PRIORITY[record.status] ?? 0;
    if (currentPriority > STATUS_PRIORITY["absent_pending"]) {
      skipped++;
      continue;
    }

    // Transition: absent_pending → absent
    const updateResult = await AttendanceRecordModel.updateOne(
      { _id: record._id, status: "absent_pending" },
      {
        $set: {
          status: "absent",
          status_reason: "Finalized: không có phiên học sau thời gian chờ",
        },
      },
    ).exec();

    if (updateResult.modifiedCount === 0) {
      // Record was modified concurrently — skip
      skipped++;
      continue;
    }

    finalized++;

    // Compute risk score for the student
    const studentId = record.student_id.toString();
    try {
      await learningRiskService.computeRiskScore(studentId);
    } catch (err) {
      // Non-blocking: log but continue
      console.error(
        `[attendance.finalize_absences] Failed to compute risk for student ${studentId}:`,
        err instanceof Error ? err.message : err,
      );
    }

    // Dispatch parent_absent_alert notification
    try {
      const parentIds = await getParentUserIdsForStudent(studentId);
      for (const parentUserId of parentIds) {
        await notificationService.send({
          type: "parent_absent_alert",
          recipient: { user_id: parentUserId },
          channels: ["in_app"],
          payload: {
            student_id: studentId,
            lesson_id: record.lesson_id?.toString() ?? null,
            scheduled_date: record.scheduled_date,
            message: "Học sinh đã vắng mặt buổi học",
          },
          template_id: "parent_absent_alert.v1",
          metadata: {
            attendance_record_id: (record._id as any).toString(),
          },
        });
      }
    } catch (err) {
      // Non-blocking: notification failure shouldn't stop finalization
      console.error(
        `[attendance.finalize_absences] Failed to notify parent for student ${studentId}:`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  return {
    ok: true,
    metrics: {
      pending_checked: pendingRecords.length,
      finalized,
      skipped,
    },
  };
}

/**
 * Find parent user IDs for a given student.
 */
async function getParentUserIdsForStudent(studentId: string): Promise<string[]> {
  const rows = await parentChildRepository.findParentsByStudent(studentId as any);
  return rows.map((r: any) => r.parent_user_id.toString());
}

// ── Job B Definition ────────────────────────────────────────────────────

export const attendanceFinalizeJob: ScheduledJobDefinition = {
  name: "attendance.finalize_absences",
  cronExpression: "*/30 * * * *",
  timezone: "Asia/Ho_Chi_Minh",
  enabled: true,
  lockTimeoutMs: 1_740_000, // 29 minutes
  run: finalizeAbsencesHandler,
};
