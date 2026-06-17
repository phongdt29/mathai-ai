import mongoose, { type ClientSession, type Document, Schema } from "mongoose";
import BaseRepository from "./base.model";

// ── Types ───────────────────────────────────────────────────────────────

export type AnalyticsRole = "student" | "parent" | "teacher" | "admin" | "staff";

// ── Interface ───────────────────────────────────────────────────────────

export interface IAnalyticsDailyUserActivity extends Document {
  date: string; // ISO date string YYYY-MM-DD (ICT)
  role: AnalyticsRole;
  active_users: number;
  new_users: number;
  returning_users: number;
  createdAt: Date;
  updatedAt: Date;
}

// ── Schema ──────────────────────────────────────────────────────────────

const AnalyticsDailyUserActivitySchema = new Schema<IAnalyticsDailyUserActivity>(
  {
    date: { type: String, required: true, trim: true },
    role: {
      type: String,
      required: true,
      enum: ["student", "parent", "teacher", "admin", "staff"],
    },
    active_users: { type: Number, required: true, min: 0, default: 0 },
    new_users: { type: Number, required: true, min: 0, default: 0 },
    returning_users: { type: Number, required: true, min: 0, default: 0 },
  },
  { timestamps: true },
);

// ── Indexes ─────────────────────────────────────────────────────────────

// Compound unique key: one document per (date, role)
AnalyticsDailyUserActivitySchema.index({ date: 1, role: 1 }, { unique: true });

// ── Model ───────────────────────────────────────────────────────────────

export const AnalyticsDailyUserActivityModel = mongoose.model<IAnalyticsDailyUserActivity>(
  "AnalyticsDailyUserActivity",
  AnalyticsDailyUserActivitySchema,
);

// ── Repository ──────────────────────────────────────────────────────────

export class AnalyticsDailyUserActivityRepository extends BaseRepository<IAnalyticsDailyUserActivity> {
  constructor() {
    super(AnalyticsDailyUserActivityModel);
  }

  /**
   * Upsert a daily user activity record for a given date and role.
   * Idempotent: running twice for the same date produces the same final state.
   */
  public async upsertDaily(
    date: string,
    role: AnalyticsRole,
    data: { active_users: number; new_users: number; returning_users: number },
    session?: ClientSession,
  ): Promise<IAnalyticsDailyUserActivity> {
    const result = await this.model.findOneAndUpdate(
      { date, role },
      { $set: { active_users: data.active_users, new_users: data.new_users, returning_users: data.returning_users } },
      { upsert: true, new: true, session: session ?? undefined },
    );
    return result as IAnalyticsDailyUserActivity;
  }

  /**
   * Find activity records within a date range.
   */
  public async findByDateRange(
    from: string,
    to: string,
    role?: AnalyticsRole,
    session?: ClientSession,
  ): Promise<IAnalyticsDailyUserActivity[]> {
    const filter: Record<string, unknown> = { date: { $gte: from, $lte: to } };
    if (role) filter.role = role;
    const query = this.model.find(filter).sort({ date: 1, role: 1 });
    if (session) query.session(session);
    return query.exec();
  }
}

// ── Singleton export ────────────────────────────────────────────────────

export const analyticsDailyUserActivityRepo = new AnalyticsDailyUserActivityRepository();
