import mongoose from "mongoose";
import {
  analyticsDailyUserActivityRepo,
  type AnalyticsRole,
} from "../models/analytics-daily-user-activity.model";
import { analyticsDailyRevenueRepo } from "../models/analytics-daily-revenue.model";
import { analyticsCohortRetentionRepo } from "../models/analytics-cohort-retention.model";
import { analyticsLessonEngagementRepo } from "../models/analytics-lesson-engagement.model";
import { EngagementSessionModel } from "../models/engagement.model";
import { UserModel } from "../models/user.model";
import { BillingTransactionModel } from "../models/billing-transaction.model";
import { SubscriptionModel } from "../models/subscription.model";

// ── Types ───────────────────────────────────────────────────────────────

export interface AnalyticsAggregateServiceOptions {
  /** Override for testing — defaults to mongoose models */
  engagementSessionModel?: typeof EngagementSessionModel;
  userModel?: typeof UserModel;
  billingTransactionModel?: typeof BillingTransactionModel;
  subscriptionModel?: typeof SubscriptionModel;
}

// ── Helpers ─────────────────────────────────────────────────────────────

/**
 * Convert an ISO date string (YYYY-MM-DD) to start/end Date objects for that day in ICT (UTC+7).
 */
function getDateRangeForDay(dateStr: string): { start: Date; end: Date } {
  // dateStr is YYYY-MM-DD in ICT. Convert to UTC boundaries.
  const [year, month, day] = dateStr.split("-").map(Number);
  // ICT = UTC+7, so start of day in ICT = previous day 17:00 UTC
  const start = new Date(Date.UTC(year, month - 1, day, -7, 0, 0, 0));
  const end = new Date(Date.UTC(year, month - 1, day, 16, 59, 59, 999));
  return { start, end };
}

/**
 * Get ISO week string (e.g. "2024-W01") from a Date.
 */
function getISOWeekString(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

/**
 * Get the start date (Monday) of an ISO week string like "2024-W01".
 */
function getWeekStartDate(weekStr: string): Date {
  const [yearStr, weekPart] = weekStr.split("-W");
  const year = parseInt(yearStr, 10);
  const week = parseInt(weekPart, 10);
  // Jan 4 is always in week 1
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const dayOfWeek = jan4.getUTCDay() || 7;
  // Monday of week 1
  const week1Monday = new Date(jan4.getTime() - (dayOfWeek - 1) * 86400000);
  // Monday of target week
  const targetMonday = new Date(week1Monday.getTime() + (week - 1) * 7 * 86400000);
  return targetMonday;
}

// ── Service ─────────────────────────────────────────────────────────────

export class AnalyticsAggregateService {
  private readonly engagementSessionModel: typeof EngagementSessionModel;
  private readonly userModel: typeof UserModel;
  private readonly billingTransactionModel: typeof BillingTransactionModel;
  private readonly subscriptionModel: typeof SubscriptionModel;

  constructor(options?: AnalyticsAggregateServiceOptions) {
    this.engagementSessionModel = options?.engagementSessionModel ?? EngagementSessionModel;
    this.userModel = options?.userModel ?? UserModel;
    this.billingTransactionModel = options?.billingTransactionModel ?? BillingTransactionModel;
    this.subscriptionModel = options?.subscriptionModel ?? SubscriptionModel;
  }

  /**
   * Refresh daily user activity aggregates for a given date (YYYY-MM-DD in ICT).
   * Queries EngagementSession and User to compute active_users, new_users, returning_users per role.
   *
   * Idempotent: running twice for the same date produces the same final state.
   *
   * Requirements: 11.2
   */
  public async refreshDailyUserActivity(date: string): Promise<void> {
    const { start, end } = getDateRangeForDay(date);

    const roles: AnalyticsRole[] = ["student", "parent", "teacher", "admin", "staff"];

    for (const role of roles) {
      // Find users with this role
      const usersWithRole = await this.userModel
        .find({ role, is_active: true })
        .select("_id createdAt")
        .lean();

      if (usersWithRole.length === 0) {
        await analyticsDailyUserActivityRepo.upsertDaily(date, role, {
          active_users: 0,
          new_users: 0,
          returning_users: 0,
        });
        continue;
      }

      const userIds = usersWithRole.map((u) => u._id);

      // Active users: users who had at least one engagement session on this date
      // For non-student roles, we count users who were created (active) on this date
      // EngagementSession is keyed by student_id, so for students we use sessions
      if (role === "student") {
        // Active students: distinct student_ids with sessions on this date
        const activeSessions = await this.engagementSessionModel.aggregate([
          {
            $match: {
              started_at: { $gte: start, $lte: end },
              student_id: { $in: userIds },
            },
          },
          { $group: { _id: "$student_id" } },
        ]);

        const activeUserIds = new Set(activeSessions.map((s: { _id: mongoose.Types.ObjectId }) => s._id.toString()));
        const activeUsers = activeUserIds.size;

        // New users: users created on this date
        const newUsers = usersWithRole.filter((u) => {
          const created = new Date(u.createdAt);
          return created >= start && created <= end;
        }).length;

        // Returning users: active users who were NOT created today
        const newUserIds = new Set(
          usersWithRole
            .filter((u) => {
              const created = new Date(u.createdAt);
              return created >= start && created <= end;
            })
            .map((u) => u._id.toString()),
        );
        const returningUsers = Array.from(activeUserIds).filter((id) => !newUserIds.has(id)).length;

        await analyticsDailyUserActivityRepo.upsertDaily(date, role, {
          active_users: activeUsers,
          new_users: newUsers,
          returning_users: returningUsers,
        });
      } else {
        // For non-student roles, "active" is approximated by login/creation activity
        // Since EngagementSession only tracks students, we count new users and
        // approximate active as users who exist and are active
        const newUsers = usersWithRole.filter((u) => {
          const created = new Date(u.createdAt);
          return created >= start && created <= end;
        }).length;

        // For non-student roles without session tracking, active_users = total active users of that role
        // returning_users = active_users - new_users
        const activeUsers = usersWithRole.length;
        const returningUsers = activeUsers - newUsers;

        await analyticsDailyUserActivityRepo.upsertDaily(date, role, {
          active_users: activeUsers,
          new_users: newUsers,
          returning_users: Math.max(0, returningUsers),
        });
      }
    }
  }

  /**
   * Refresh daily revenue aggregates for a given date (YYYY-MM-DD in ICT).
   * Queries BillingTransaction and Subscription to compute gross_revenue, refunds, MRR, new/churned subs.
   *
   * Idempotent: running twice for the same date produces the same final state.
   *
   * Requirements: 11.3
   */
  public async refreshDailyRevenue(date: string): Promise<void> {
    const { start, end } = getDateRangeForDay(date);

    // Gross revenue: sum of payment_received transactions on this date
    const revenueAgg = await this.billingTransactionModel.aggregate([
      {
        $match: {
          type: "payment_received",
          createdAt: { $gte: start, $lte: end },
        },
      },
      {
        $group: {
          _id: null,
          total: { $sum: "$amount_vnd" },
        },
      },
    ]);
    const grossRevenueVnd = revenueAgg.length > 0 ? Math.abs(revenueAgg[0].total) : 0;

    // Refunds: sum of refund transactions on this date
    const refundAgg = await this.billingTransactionModel.aggregate([
      {
        $match: {
          type: "refund",
          createdAt: { $gte: start, $lte: end },
        },
      },
      {
        $group: {
          _id: null,
          total: { $sum: "$amount_vnd" },
        },
      },
    ]);
    const refundsVnd = refundAgg.length > 0 ? Math.abs(refundAgg[0].total) : 0;

    // MRR: count of active subscriptions at end of day × average plan price
    // Simplified: net revenue (gross - refunds) as daily MRR contribution
    // A more accurate MRR would require plan price lookup
    const mrrVnd = Math.max(0, grossRevenueVnd - refundsVnd);

    // New subscriptions: subscriptions created on this date
    const newSubs = await this.subscriptionModel.countDocuments({
      createdAt: { $gte: start, $lte: end },
    });

    // Churned subscriptions: subscriptions that became cancelled or expired on this date
    const churnedSubs = await this.subscriptionModel.countDocuments({
      status: { $in: ["cancelled", "expired"] },
      updatedAt: { $gte: start, $lte: end },
      cancelled_at: { $gte: start, $lte: end },
    });

    await analyticsDailyRevenueRepo.upsertDaily(date, {
      gross_revenue_vnd: grossRevenueVnd,
      refunds_vnd: refundsVnd,
      mrr_vnd: mrrVnd,
      new_subs: newSubs,
      churned_subs: churnedSubs,
    });
  }

  /**
   * Refresh cohort retention for a given cohort week (e.g. "2024-W01").
   * Computes retained_users at each week_offset from signup week.
   * A user is "retained" if they had at least one EngagementSession in that offset week.
   *
   * Idempotent: running twice for the same cohort_week produces the same final state.
   *
   * Requirements: 11.4
   */
  public async refreshCohortRetention(cohortWeek: string): Promise<void> {
    const cohortStart = getWeekStartDate(cohortWeek);
    const cohortEnd = new Date(cohortStart.getTime() + 7 * 86400000);

    // Find all users (students) who signed up in this cohort week
    const cohortUsers = await this.userModel
      .find({
        role: "student",
        is_active: true,
        createdAt: { $gte: cohortStart, $lt: cohortEnd },
      })
      .select("_id")
      .lean();

    if (cohortUsers.length === 0) {
      // No users in this cohort, upsert week_offset=0 with 0
      await analyticsCohortRetentionRepo.upsertCohort(cohortWeek, 0, 0);
      return;
    }

    const cohortUserIds = cohortUsers.map((u) => u._id);

    // Calculate retention for each week offset from signup week to current week
    const now = new Date();
    const maxWeekOffset = Math.floor(
      (now.getTime() - cohortStart.getTime()) / (7 * 86400000),
    );

    // Limit to reasonable range (52 weeks max)
    const maxOffset = Math.min(maxWeekOffset, 52);

    for (let offset = 0; offset <= maxOffset; offset++) {
      const weekStart = new Date(cohortStart.getTime() + offset * 7 * 86400000);
      const weekEnd = new Date(weekStart.getTime() + 7 * 86400000);

      // Count distinct students from cohort who had sessions in this week
      const retainedAgg = await this.engagementSessionModel.aggregate([
        {
          $match: {
            student_id: { $in: cohortUserIds },
            started_at: { $gte: weekStart, $lt: weekEnd },
          },
        },
        { $group: { _id: "$student_id" } },
        { $count: "retained" },
      ]);

      const retainedUsers = retainedAgg.length > 0 ? retainedAgg[0].retained : 0;

      await analyticsCohortRetentionRepo.upsertCohort(cohortWeek, offset, retainedUsers);
    }
  }

  /**
   * Refresh lesson engagement aggregates for a given date (YYYY-MM-DD in ICT).
   * Computes student_count, avg_active_minutes, avg_focus_ratio per lesson.
   *
   * Idempotent: running twice for the same date produces the same final state.
   *
   * Requirements: 11.8
   */
  public async refreshLessonEngagement(date: string): Promise<void> {
    const { start, end } = getDateRangeForDay(date);

    // Aggregate engagement sessions by lesson_id for this date
    const lessonAgg = await this.engagementSessionModel.aggregate([
      {
        $match: {
          started_at: { $gte: start, $lte: end },
          lesson_id: { $ne: null },
        },
      },
      {
        $group: {
          _id: "$lesson_id",
          student_count: { $addToSet: "$student_id" },
          total_active_seconds: { $sum: "$active_duration_seconds" },
          total_focus_ratio: { $sum: "$focus_ratio" },
          session_count: { $sum: 1 },
        },
      },
      {
        $project: {
          _id: 1,
          student_count: { $size: "$student_count" },
          avg_active_minutes: {
            $cond: [
              { $gt: ["$session_count", 0] },
              { $divide: [{ $divide: ["$total_active_seconds", 60] }, "$session_count"] },
              0,
            ],
          },
          avg_focus_ratio: {
            $cond: [
              { $gt: ["$session_count", 0] },
              { $divide: ["$total_focus_ratio", "$session_count"] },
              0,
            ],
          },
        },
      },
    ]);

    for (const lesson of lessonAgg) {
      await analyticsLessonEngagementRepo.upsertDaily(
        date,
        lesson._id.toString(),
        {
          student_count: lesson.student_count,
          avg_active_minutes: Math.round(lesson.avg_active_minutes * 100) / 100,
          avg_focus_ratio: Math.round(lesson.avg_focus_ratio * 1000) / 1000,
        },
      );
    }
  }

  /**
   * Refresh all analytics aggregates for a given date.
   * Calls all individual refresh methods.
   * Also refreshes cohort retention for the week containing the given date.
   *
   * Idempotent: running twice for the same date produces the same final state.
   *
   * Requirements: 11.2, 11.3, 11.4, 11.8
   */
  public async refreshAll(date: string): Promise<void> {
    await this.refreshDailyUserActivity(date);
    await this.refreshDailyRevenue(date);
    await this.refreshLessonEngagement(date);

    // Refresh cohort retention for the week containing this date
    const dateObj = new Date(date + "T00:00:00Z");
    const cohortWeek = getISOWeekString(dateObj);
    await this.refreshCohortRetention(cohortWeek);
  }
}

// ── Singleton export ────────────────────────────────────────────────────

export const analyticsAggregateService = new AnalyticsAggregateService();
export default analyticsAggregateService;
