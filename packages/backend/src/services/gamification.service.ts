import mongoose, { type ClientSession } from "mongoose";
import {
  badgeRepository,
  type BadgeRepository,
  type IBadge,
} from "../models/badge.model";
import {
  studentBadgeRepository,
  type StudentBadgeRepository,
  type IStudentBadge,
} from "../models/student-badge.model";
import {
  studentStreakRepository,
  type StudentStreakRepository,
  type IStudentStreak,
} from "../models/student-streak.model";
import {
  leaderboardSnapshotRepository,
  type LeaderboardSnapshotRepository,
  type ILeaderboardSnapshot,
  type ILeaderboardRanking,
  type LeaderboardScope,
  type LeaderboardPeriod,
} from "../models/leaderboard-snapshot.model";
import {
  PointLedgerModel,
  type IPointLedger,
} from "../models/point-ledger.model";
import { StudentProfileModel } from "../models/student.model";
import { UserModel } from "../models/user.model";

// ── Types ───────────────────────────────────────────────────────────────

export type BadgeTrigger =
  | { type: "lesson_completed"; lesson_id: string }
  | { type: "quiz_submitted"; lesson_id: string; score: number; max_score: number }
  | { type: "solver_resolved"; stage: string }
  | { type: "streak_updated"; streak_days: number };

export interface GamificationServiceDependencies {
  badgeRepo?: BadgeRepository;
  studentBadgeRepo?: StudentBadgeRepository;
  studentStreakRepo?: StudentStreakRepository;
  leaderboardRepo?: LeaderboardSnapshotRepository;
  pointLedgerModel?: typeof PointLedgerModel;
  studentProfileModel?: typeof StudentProfileModel;
  userModel?: typeof UserModel;
  logger?: Pick<Console, "error" | "warn" | "info">;
}

export interface StudentGamificationProfile {
  streak: IStudentStreak | null;
  badges: Array<IStudentBadge & { badge?: IBadge | null }>;
  totalBadges: number;
}

// ── Service ─────────────────────────────────────────────────────────────

export class GamificationService {
  private readonly badgeRepo: BadgeRepository;
  private readonly studentBadgeRepo: StudentBadgeRepository;
  private readonly studentStreakRepo: StudentStreakRepository;
  private readonly leaderboardRepo: LeaderboardSnapshotRepository;
  private readonly pointLedgerModel: typeof PointLedgerModel;
  private readonly studentProfileModel: typeof StudentProfileModel;
  private readonly userModel: typeof UserModel;
  private readonly logger: Pick<Console, "error" | "warn" | "info">;

  constructor(dependencies: GamificationServiceDependencies = {}) {
    this.badgeRepo = dependencies.badgeRepo ?? badgeRepository;
    this.studentBadgeRepo = dependencies.studentBadgeRepo ?? studentBadgeRepository;
    this.studentStreakRepo = dependencies.studentStreakRepo ?? studentStreakRepository;
    this.leaderboardRepo = dependencies.leaderboardRepo ?? leaderboardSnapshotRepository;
    this.pointLedgerModel = dependencies.pointLedgerModel ?? PointLedgerModel;
    this.studentProfileModel = dependencies.studentProfileModel ?? StudentProfileModel;
    this.userModel = dependencies.userModel ?? UserModel;
    this.logger = dependencies.logger ?? console;
  }

  // ── Badges ──────────────────────────────────────────────────────────

  /**
   * Award a badge to a student. Idempotent — won't double-award if already earned.
   * Returns the existing or newly created StudentBadge.
   */
  public async awardBadge(
    studentId: string,
    badgeId: string,
    metadata?: Record<string, unknown> | null,
    session?: ClientSession,
  ): Promise<IStudentBadge> {
    // Verify badge exists and is active
    const badge = await this.badgeRepo.findByBadgeId(badgeId, session);
    if (!badge) {
      throw new Error(`Badge "${badgeId}" not found`);
    }
    if (!badge.is_active) {
      throw new Error(`Badge "${badgeId}" is not active`);
    }

    // Idempotent award via upsert (won't double-award due to unique partial index)
    const studentBadge = await this.studentBadgeRepo.awardBadge(
      studentId,
      badgeId,
      metadata ?? null,
      session,
    );

    return studentBadge;
  }

  /**
   * Check badge criteria for a student based on a trigger type.
   * Evaluates all active badges matching the criteria type and awards any that are met.
   * Returns newly awarded badges.
   */
  public async checkBadgeCriteria(
    studentId: string,
    criteriaType: string,
    context?: { currentValue?: number; session?: ClientSession },
  ): Promise<IStudentBadge[]> {
    const session = context?.session;
    const badges = await this.badgeRepo.findByCriteriaType(criteriaType, session);

    if (badges.length === 0) return [];

    const awarded: IStudentBadge[] = [];

    for (const badge of badges) {
      // Check if already earned
      const existing = await this.studentBadgeRepo.findEarnedBadge(
        studentId,
        badge.badge_id,
        session,
      );
      if (existing) continue;

      // Evaluate criteria
      const meetsThreshold = await this.evaluateCriteria(
        studentId,
        badge,
        context?.currentValue,
        session,
      );

      if (meetsThreshold) {
        const studentBadge = await this.awardBadge(
          studentId,
          badge.badge_id,
          { criteria_type: criteriaType, threshold_met: badge.criteria.threshold },
          session,
        );
        awarded.push(studentBadge);
      }
    }

    return awarded;
  }

  /**
   * Check and award badges based on a trigger event.
   * Maps trigger types to criteria types and evaluates.
   */
  public async checkAndAwardBadges(
    studentId: string,
    trigger: BadgeTrigger,
    session?: ClientSession,
  ): Promise<IStudentBadge[]> {
    try {
      switch (trigger.type) {
        case "lesson_completed":
          return this.checkBadgeCriteria(studentId, "lesson_completed", { session });

        case "quiz_submitted": {
          const quizBadges = await this.checkBadgeCriteria(
            studentId,
            "quiz_score",
            { currentValue: trigger.score, session },
          );
          const quizCountBadges = await this.checkBadgeCriteria(
            studentId,
            "quiz_count",
            { session },
          );
          return [...quizBadges, ...quizCountBadges];
        }

        case "solver_resolved":
          return this.checkBadgeCriteria(studentId, "solver_hint_only_count", { session });

        case "streak_updated":
          return this.checkBadgeCriteria(
            studentId,
            "lesson_streak",
            { currentValue: trigger.streak_days, session },
          );

        default:
          return [];
      }
    } catch (error) {
      // Fail-soft: log error but don't throw (Requirement 12.11)
      this.logger.error(
        `[GamificationService] checkAndAwardBadges failed for student=${studentId}:`,
        error,
      );
      return [];
    }
  }

  // ── Streaks ─────────────────────────────────────────────────────────

  /**
   * Update streak for a student based on a session date.
   *
   * Streak logic:
   * - Idempotent on same day (no change if sessionDate === last_active_date)
   * - Increment on consecutive days (daysDiff === 1)
   * - Reset to 1 on gap (daysDiff > 1)
   * - Ignore future dates relative to last_active_date (daysDiff < 0)
   *
   * Invariant: current_streak_days <= longest_streak_days always holds.
   */
  public async updateStreakOnSession(
    studentId: string,
    sessionDate: string,
    session?: ClientSession,
  ): Promise<IStudentStreak> {
    // Validate sessionDate format YYYY-MM-DD
    if (!/^\d{4}-\d{2}-\d{2}$/.test(sessionDate)) {
      throw new Error(`Invalid sessionDate format: "${sessionDate}". Expected YYYY-MM-DD.`);
    }

    const existing = await this.studentStreakRepo.findByStudentId(studentId, session);

    if (!existing) {
      // First session ever — create streak with 1 day
      const newStreak = await this.studentStreakRepo.upsertStreak(
        studentId,
        {
          current_streak_days: 1,
          longest_streak_days: 1,
          last_active_date: sessionDate,
          break_count_30d: 0,
        },
        session,
      );

      // Check streak badges
      await this.checkAndAwardBadges(studentId, { type: "streak_updated", streak_days: 1 }, session);

      return newStreak;
    }

    // Same day — idempotent, no change
    if (sessionDate === existing.last_active_date) {
      return existing;
    }

    const daysDiff = this.differenceInDays(sessionDate, existing.last_active_date);

    // Past date or same day (shouldn't happen but guard)
    if (daysDiff <= 0) {
      return existing;
    }

    let newStreakDays: number;
    let newBreakCount = existing.break_count_30d;

    if (daysDiff === 1) {
      // Consecutive day — increment streak
      newStreakDays = existing.current_streak_days + 1;
    } else {
      // Gap > 1 day — reset streak
      newStreakDays = 1;
      newBreakCount = existing.break_count_30d + 1;
    }

    // Invariant: current_streak_days <= longest_streak_days
    const newLongestStreak = Math.max(existing.longest_streak_days, newStreakDays);

    const updatedStreak = await this.studentStreakRepo.upsertStreak(
      studentId,
      {
        current_streak_days: newStreakDays,
        longest_streak_days: newLongestStreak,
        last_active_date: sessionDate,
        break_count_30d: newBreakCount,
      },
      session,
    );

    // Check streak badges
    await this.checkAndAwardBadges(
      studentId,
      { type: "streak_updated", streak_days: newStreakDays },
      session,
    );

    return updatedStreak;
  }

  /**
   * Get the current streak for a student.
   */
  public async getStreak(
    studentId: string,
    session?: ClientSession,
  ): Promise<IStudentStreak | null> {
    return this.studentStreakRepo.findByStudentId(studentId, session);
  }

  // ── Leaderboards ────────────────────────────────────────────────────

  /**
   * Refresh a leaderboard snapshot by computing rankings from point_service scores.
   * Upserts the snapshot (compound unique index on scope+scope_id+period+period_key).
   */
  public async refreshLeaderboard(
    scope: LeaderboardScope,
    scopeId: string | null,
    period: LeaderboardPeriod,
    periodKey: string,
    session?: ClientSession,
  ): Promise<ILeaderboardSnapshot> {
    // Compute rankings from point ledger
    const rankings = await this.computeRankings(scope, scopeId, period, periodKey);

    // Upsert snapshot
    const snapshot = await this.leaderboardRepo.upsertSnapshot(
      scope,
      scopeId,
      period,
      periodKey,
      rankings,
      session,
    );

    return snapshot;
  }

  /**
   * Get an existing leaderboard snapshot.
   */
  public async getLeaderboard(
    scope: LeaderboardScope,
    scopeId: string | null,
    period: LeaderboardPeriod,
    periodKey: string,
    session?: ClientSession,
  ): Promise<ILeaderboardSnapshot | null> {
    return this.leaderboardRepo.findSnapshot(scope, scopeId, period, periodKey, session);
  }

  // ── Profile ─────────────────────────────────────────────────────────

  /**
   * Get the full gamification profile for a student:
   * streak, badges (with badge metadata), and total badge count.
   */
  public async getStudentGamificationProfile(
    studentId: string,
    session?: ClientSession,
  ): Promise<StudentGamificationProfile> {
    const [streak, studentBadges] = await Promise.all([
      this.studentStreakRepo.findByStudentId(studentId, session),
      this.studentBadgeRepo.findByStudentId(studentId, session),
    ]);

    // Enrich badges with badge metadata
    const enrichedBadges: Array<IStudentBadge & { badge?: IBadge | null }> = [];
    for (const sb of studentBadges) {
      const badge = await this.badgeRepo.findByBadgeId(sb.badge_id, session);
      enrichedBadges.push(Object.assign(sb, { badge: badge ?? null }));
    }

    const totalBadges = await this.studentBadgeRepo.countByStudentId(studentId, session);

    return {
      streak,
      badges: enrichedBadges,
      totalBadges,
    };
  }

  /**
   * List all badges earned by a student (with badge metadata).
   */
  public async listStudentBadges(
    studentId: string,
    session?: ClientSession,
  ): Promise<Array<IStudentBadge & { badge?: IBadge | null }>> {
    const studentBadges = await this.studentBadgeRepo.findByStudentId(studentId, session);
    const enriched: Array<IStudentBadge & { badge?: IBadge | null }> = [];

    for (const sb of studentBadges) {
      const badge = await this.badgeRepo.findByBadgeId(sb.badge_id, session);
      enriched.push(Object.assign(sb, { badge: badge ?? null }));
    }

    return enriched;
  }

  // ── Private helpers ─────────────────────────────────────────────────

  /**
   * Compute the difference in calendar days between two YYYY-MM-DD strings.
   * Returns positive if dateA is after dateB.
   */
  private differenceInDays(dateA: string, dateB: string): number {
    const a = new Date(dateA + "T00:00:00Z");
    const b = new Date(dateB + "T00:00:00Z");
    const diffMs = a.getTime() - b.getTime();
    return Math.round(diffMs / (24 * 60 * 60 * 1000));
  }

  /**
   * Evaluate whether a student meets the criteria for a badge.
   */
  private async evaluateCriteria(
    studentId: string,
    badge: IBadge,
    currentValue?: number,
    session?: ClientSession,
  ): Promise<boolean> {
    const { type, threshold, period } = badge.criteria;

    // If a current value is provided directly (e.g., streak_days, quiz_score), use it
    if (currentValue !== undefined) {
      return currentValue >= threshold;
    }

    // Otherwise, compute from data
    switch (type) {
      case "lesson_streak": {
        const streak = await this.studentStreakRepo.findByStudentId(studentId, session);
        return (streak?.current_streak_days ?? 0) >= threshold;
      }

      case "lesson_completed": {
        const count = await this.countLedgerEntries(studentId, "lesson", period);
        return count >= threshold;
      }

      case "quiz_count": {
        const count = await this.countLedgerEntries(studentId, "assessment", period);
        return count >= threshold;
      }

      case "quiz_score": {
        // Check if student has any quiz with score >= threshold (as percentage)
        const entries = await this.getRecentLedgerEntries(studentId, "assessment", period);
        return entries.some(
          (e) => e.max_points > 0 && (e.earned_points / e.max_points) * 100 >= threshold,
        );
      }

      case "solver_hint_only_count": {
        // Count solver entries (bonus type used for solver achievements)
        const count = await this.countLedgerEntries(studentId, "bonus", period);
        return count >= threshold;
      }

      case "teacher_assignment_count": {
        const count = await this.countLedgerEntries(studentId, "teacher_assignment", period);
        return count >= threshold;
      }

      default:
        return false;
    }
  }

  /**
   * Count point ledger entries for a student by source type, optionally filtered by period.
   */
  private async countLedgerEntries(
    studentId: string,
    sourceType: string,
    period?: string,
  ): Promise<number> {
    const filter: Record<string, unknown> = {
      student_id: studentId,
      source_type: sourceType,
    };

    if (period && period !== "lifetime") {
      const dateFilter = this.getPeriodDateFilter(period);
      if (dateFilter) {
        filter.createdAt = dateFilter;
      }
    }

    return this.pointLedgerModel.countDocuments(filter).exec();
  }

  /**
   * Get recent point ledger entries for a student by source type.
   */
  private async getRecentLedgerEntries(
    studentId: string,
    sourceType: string,
    period?: string,
  ): Promise<IPointLedger[]> {
    const filter: Record<string, unknown> = {
      student_id: studentId,
      source_type: sourceType,
    };

    if (period && period !== "lifetime") {
      const dateFilter = this.getPeriodDateFilter(period);
      if (dateFilter) {
        filter.createdAt = dateFilter;
      }
    }

    return this.pointLedgerModel
      .find(filter)
      .sort({ createdAt: -1 })
      .limit(100)
      .exec();
  }

  /**
   * Get a MongoDB date filter for a period.
   */
  private getPeriodDateFilter(period: string): { $gte: Date } | null {
    const now = new Date();
    switch (period) {
      case "week": {
        const weekAgo = new Date(now);
        weekAgo.setDate(weekAgo.getDate() - 7);
        return { $gte: weekAgo };
      }
      case "month": {
        const monthAgo = new Date(now);
        monthAgo.setMonth(monthAgo.getMonth() - 1);
        return { $gte: monthAgo };
      }
      default:
        return null;
    }
  }

  /**
   * Compute rankings for a leaderboard from point ledger aggregation.
   * Aggregates total reward_points per student within the given scope and period.
   */
  private async computeRankings(
    scope: LeaderboardScope,
    scopeId: string | null,
    period: LeaderboardPeriod,
    periodKey: string,
  ): Promise<ILeaderboardRanking[]> {
    // Build date filter based on period
    const dateFilter = this.getLeaderboardPeriodDateFilter(period, periodKey);

    // Build aggregation pipeline
    const matchStage: Record<string, unknown> = {};
    if (dateFilter) {
      matchStage.createdAt = dateFilter;
    }

    // If scope is "class" or "grade", we need to filter students by scope
    let studentIds: string[] | null = null;
    if (scope === "class" && scopeId) {
      studentIds = await this.getStudentIdsForClass(scopeId);
    } else if (scope === "grade" && scopeId) {
      studentIds = await this.getStudentIdsForGrade(scopeId);
    }

    if (studentIds !== null) {
      matchStage.student_id = { $in: studentIds.map((id) => new mongoose.Types.ObjectId(id)) };
    }

    const pipeline: mongoose.PipelineStage[] = [
      { $match: matchStage },
      {
        $group: {
          _id: "$student_id",
          score: { $sum: "$reward_points" },
        },
      },
      { $sort: { score: -1 } },
      { $limit: 100 },
    ];

    const results = await this.pointLedgerModel.aggregate(pipeline).exec();

    // Enrich with student names
    const rankings: ILeaderboardRanking[] = [];
    let rank = 1;

    for (const entry of results) {
      const studentName = await this.getStudentName(entry._id.toString());
      rankings.push({
        student_id: entry._id.toString(),
        student_name: studentName,
        score: entry.score,
        rank,
      });
      rank++;
    }

    return rankings;
  }

  /**
   * Get date filter for leaderboard period based on period_key.
   */
  private getLeaderboardPeriodDateFilter(
    period: LeaderboardPeriod,
    periodKey: string,
  ): { $gte: Date; $lt?: Date } | null {
    switch (period) {
      case "weekly": {
        // periodKey format: "2026-W21"
        const startDate = this.getWeekStartDate(periodKey);
        if (!startDate) return null;
        const endDate = new Date(startDate);
        endDate.setDate(endDate.getDate() + 7);
        return { $gte: startDate, $lt: endDate };
      }
      case "monthly": {
        // periodKey format: "2026-05"
        const [year, month] = periodKey.split("-").map(Number);
        if (!year || !month) return null;
        const startDate = new Date(Date.UTC(year, month - 1, 1));
        const endDate = new Date(Date.UTC(year, month, 1));
        return { $gte: startDate, $lt: endDate };
      }
      case "all_time":
        return null; // No date filter
      default:
        return null;
    }
  }

  /**
   * Parse ISO week format "YYYY-Www" to get the Monday start date.
   */
  private getWeekStartDate(periodKey: string): Date | null {
    const match = periodKey.match(/^(\d{4})-W(\d{1,2})$/);
    if (!match) return null;

    const year = parseInt(match[1], 10);
    const week = parseInt(match[2], 10);

    // ISO 8601: Week 1 contains January 4th
    const jan4 = new Date(Date.UTC(year, 0, 4));
    const dayOfWeek = jan4.getUTCDay() || 7; // Monday = 1, Sunday = 7
    const mondayOfWeek1 = new Date(jan4);
    mondayOfWeek1.setUTCDate(jan4.getUTCDate() - dayOfWeek + 1);

    const targetMonday = new Date(mondayOfWeek1);
    targetMonday.setUTCDate(mondayOfWeek1.getUTCDate() + (week - 1) * 7);

    return targetMonday;
  }

  /**
   * Get student IDs belonging to a class.
   */
  private async getStudentIdsForClass(classId: string): Promise<string[]> {
    try {
      // Use the class model to find enrolled students
      const ClassModel = mongoose.model("Class");
      const classDoc = await ClassModel.findById(classId).lean();
      if (!classDoc) return [];
      // Assuming class has a students array or we query enrollments
      const students = (classDoc as Record<string, unknown>).students as string[] | undefined;
      return students ?? [];
    } catch {
      // If Class model not registered, return empty
      this.logger.warn(`[GamificationService] Could not find Class model for scope filtering`);
      return [];
    }
  }

  /**
   * Get student IDs for a grade level.
   */
  private async getStudentIdsForGrade(gradeLevel: string): Promise<string[]> {
    try {
      const profiles = await this.studentProfileModel
        .find({ grade_level: parseInt(gradeLevel, 10) })
        .select("_id")
        .lean();
      return profiles.map((p) => p._id.toString());
    } catch {
      this.logger.warn(`[GamificationService] Could not query students for grade ${gradeLevel}`);
      return [];
    }
  }

  /**
   * Get a student's display name from User model.
   */
  private async getStudentName(studentProfileId: string): Promise<string> {
    try {
      const profile = await this.studentProfileModel
        .findById(studentProfileId)
        .select("user_id")
        .lean();
      if (!profile) return "Unknown";

      const user = await this.userModel
        .findById(profile.user_id)
        .select("full_name")
        .lean();
      return (user as { full_name?: string } | null)?.full_name ?? "Unknown";
    } catch {
      return "Unknown";
    }
  }
}

// ── Singleton export ────────────────────────────────────────────────────

export const gamificationService = new GamificationService();
export default gamificationService;
