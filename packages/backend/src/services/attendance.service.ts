
import {
  AttendanceRecord,
  AttendanceStatus,
  EngagementSession,
} from '../types';
import { attendanceRecordRepo } from '../models/engagement.model';
import { auditService, type AuditActor } from './audit.service';
import { learningRiskService } from './risk.service';

/**
 * AttendanceService
 *
 * 3-state attendance: Present / Partial / Absent
 *
 * Rules:
 * - Present: active_time >= 70% of expected + quiz completed
 * - Partial: session exists but active_time < 70% OR quiz skipped
 * - Absent: no session or near-zero interaction
 */
export class AttendanceService {
  /** Minimum focus ratio to qualify as "present" */
  private static readonly PRESENT_FOCUS_THRESHOLD = 0.70;
  /** Minimum active seconds to not count as "absent" */
  private static readonly MIN_ACTIVE_SECONDS = 120; // 2 min

  /**
   * Compute and save attendance for a completed session.
   * Called when an engagement session ends.
   */
  public async recordAttendance(
    session: EngagementSession,
    lessonId: string,
    expectedDurationMinutes: number = 45,
    scheduledDate?: string,
    actor?: AuditActor | null
  ): Promise<AttendanceRecord> {
    const activeSeconds = session.active_duration_seconds;
    const expectedSeconds = expectedDurationMinutes * 60;
    const focusRatio = expectedSeconds > 0 ? activeSeconds / expectedSeconds : 0;
    const quizCompleted = session.quiz_completed;

    // Determine status
    const { status, reason } = this.determineStatus(
      activeSeconds,
      focusRatio,
      quizCompleted
    );

    const existing = await attendanceRecordRepo.findByStudentAndLesson(
      session.student_id,
      lessonId
    );

    const data: Partial<AttendanceRecord> = {
      student_id: session.student_id,
      lesson_id: lessonId,
      curriculum_id: session.curriculum_id,
      session_id: session.id,
      scheduled_date: scheduledDate ?? new Date().toISOString().split('T')[0],
      actual_start_time: session.started_at,
      actual_end_time: session.ended_at,
      status,
      expected_duration_minutes: expectedDurationMinutes,
      active_duration_seconds: activeSeconds,
      focus_ratio: Math.round(focusRatio * 10000) / 10000,
      quiz_completed: quizCompleted,
      status_reason: reason,
    };

    if (existing) {
      // Update if current status is "better" (present > partial > absent)
      const statusPriority: Record<AttendanceStatus, number> = {
        present: 4,
        partial: 3,
        absent_pending: 2,
        absent: 1,
      };
      if (statusPriority[status] > statusPriority[existing.status as AttendanceStatus]) {
        const updated = await attendanceRecordRepo.update(existing.id, data as any) as any;
        await this.auditAttendanceChange('attendance.update', updated, actor, existing, data, 'success');
        await this.recomputeRiskSafely(session.student_id);
        return updated;
      }
      return existing as any;
    }

    const created = await attendanceRecordRepo.create(data as any) as any;
    await this.auditAttendanceChange('attendance.create', created, actor, null, data, 'success');
    await this.recomputeRiskSafely(session.student_id);
    return created;
  }

  /**
   * Mark a student as absent for a lesson (e.g., cron job detects no session)
   */
  public async markAbsent(
    studentId: string,
    lessonId: string,
    scheduledDate: string,
    expectedDurationMinutes: number = 45,
    actor?: AuditActor | null
  ): Promise<AttendanceRecord> {
    const existing = await attendanceRecordRepo.findByStudentAndLesson(studentId, lessonId);
    if (existing) return existing as any; // don't overwrite existing record

    const created = await attendanceRecordRepo.create({
      student_id: studentId,
      lesson_id: lessonId,
      scheduled_date: scheduledDate,
      status: 'absent',
      expected_duration_minutes: expectedDurationMinutes,
      active_duration_seconds: 0,
      focus_ratio: 0,
      quiz_completed: false,
      status_reason: 'Không vào học',
    } as any) as any;
    await this.auditAttendanceChange('attendance.mark_absent', created, actor, null, created, 'success');
    await this.recomputeRiskSafely(studentId);
    return created;
  }

  /**
   * Get attendance summary for a student (last N days)
   */
  public async getAttendanceSummary(
    studentId: string,
    days: number = 30
  ): Promise<{ present: number; partial: number; absent: number; total: number }> {
    const counts = await attendanceRecordRepo.countByStatus(studentId, days);
    return {
      ...counts,
      total: counts.present + counts.partial + counts.absent,
    };
  }

  /**
   * Get recent attendance records
   */
  public async getRecentRecords(
    studentId: string,
    limit: number = 10
  ): Promise<AttendanceRecord[]> {
    return attendanceRecordRepo.findByStudent(studentId, limit) as any;
  }

  /**
   * Count consecutive absences (for alert triggers)
   */
  public async getConsecutiveAbsences(studentId: string): Promise<number> {
    const records = await attendanceRecordRepo.findByStudent(studentId, 10);
    let count = 0;
    for (const record of records) {
      if (record.status === 'absent') {
        count++;
      } else {
        break; // stop at first non-absent
      }
    }
    return count;
  }

  public async applyClassAttendanceUpdate(input: {
    classId: string;
    studentIdsInClass: string[];
    date: string;
    records: Array<{ student_id: string; status: AttendanceStatus; status_reason?: string | null }>;
    actor?: AuditActor | null;
  }): Promise<AttendanceRecord[]> {
    const allowed = new Set(input.studentIdsInClass.map(String));
    const results: AttendanceRecord[] = [];

    for (const record of input.records) {
      if (!allowed.has(String(record.student_id))) {
        throw new Error('Học sinh không thuộc lớp học này');
      }
      const existing = await attendanceRecordRepo.model.findOne({
        student_id: record.student_id,
        scheduled_date: input.date,
      }).exec();

      const data = {
        student_id: record.student_id,
        scheduled_date: input.date,
        status: record.status,
        status_reason: record.status_reason ?? null,
        actual_start_time: record.status === 'present' ? (existing?.actual_start_time || new Date()) : existing?.actual_start_time ?? null,
      };

      let saved: any;
      if (existing) {
        const before = existing.toObject ? existing.toObject() : existing;
        existing.status = record.status;
        existing.status_reason = record.status_reason ?? null;
        if (record.status === 'present') existing.actual_start_time = existing.actual_start_time || new Date();
        saved = await existing.save();
        await this.auditAttendanceChange('attendance.update', saved, input.actor, before, data, 'success', input.classId);
      } else {
        saved = await attendanceRecordRepo.create(data as any) as any;
        await this.auditAttendanceChange('attendance.create', saved, input.actor, null, data, 'success', input.classId);
      }
      await this.recomputeRiskSafely(record.student_id);
      results.push(saved as AttendanceRecord);
    }

    return results;
  }

  // ── Private ───────────────────────────────────────────────────────

  private determineStatus(
    activeSeconds: number,
    focusRatio: number,
    quizCompleted: boolean
  ): { status: AttendanceStatus; reason: string } {
    // Absent: near-zero interaction
    if (activeSeconds < AttendanceService.MIN_ACTIVE_SECONDS) {
      return {
        status: 'absent',
        reason: `Thời gian tương tác quá thấp (${Math.round(activeSeconds / 60)} phút)`,
      };
    }

    // Present: good focus + quiz done
    if (
      focusRatio >= AttendanceService.PRESENT_FOCUS_THRESHOLD &&
      quizCompleted
    ) {
      return {
        status: 'present',
        reason: `Học đầy đủ: ${Math.round(focusRatio * 100)}% thời gian chuẩn, có nộp quiz`,
      };
    }

    // Partial: everything else
    const reasons: string[] = [];
    if (focusRatio < AttendanceService.PRESENT_FOCUS_THRESHOLD) {
      reasons.push(`thời gian học thực chỉ ${Math.round(focusRatio * 100)}% chuẩn`);
    }
    if (!quizCompleted) {
      reasons.push('chưa hoàn thành quiz cuối buổi');
    }

    return {
      status: 'partial',
      reason: `Tham gia chưa đầy đủ: ${reasons.join(', ')}`,
    };
  }

  private async auditAttendanceChange(
    action: string,
    record: any,
    actor: AuditActor | null | undefined,
    before: unknown,
    after: unknown,
    result: 'success' | 'failure',
    classId?: string
  ): Promise<void> {
    await auditService.record({
      actor,
      action,
      resourceType: 'attendance_record',
      resourceId: String(record?._id ?? record?.id ?? ''),
      scopeType: classId ? 'class' : 'student',
      scopeId: classId ?? String(record?.student_id ?? ''),
      before,
      after,
      result,
      metadata: {
        student_id: String(record?.student_id ?? ''),
        scheduled_date: String(record?.scheduled_date ?? ''),
        status: String(record?.status ?? ''),
      },
    });
  }

  private async recomputeRiskSafely(studentId: string): Promise<void> {
    try {
      await learningRiskService.computeRiskScore(String(studentId));
    } catch (error) {
      await auditService.record({
        action: 'risk.recompute_after_attendance_failed',
        resourceType: 'student',
        resourceId: String(studentId),
        result: 'failure',
        errorCode: 'RISK_RECOMPUTE_FAILED',
        metadata: { reason: error instanceof Error ? error.message : String(error) },
      });
    }
  }
}

export const attendanceService = new AttendanceService();
export default attendanceService;
