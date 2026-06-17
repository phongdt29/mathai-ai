import mongoose, { type ClientSession, type Document, Schema } from "mongoose";
import BaseRepository from "./base.model";

// ── Interface ───────────────────────────────────────────────────────────

export interface IAnalyticsCohortRetention extends Document {
  cohort_week: string; // ISO week string, e.g. "2024-W01"
  week_offset: number; // 0 = signup week, 1 = week after, etc.
  retained_users: number; // count of users still active at this offset
  createdAt: Date;
  updatedAt: Date;
}

// ── Schema ──────────────────────────────────────────────────────────────

const AnalyticsCohortRetentionSchema = new Schema<IAnalyticsCohortRetention>(
  {
    cohort_week: { type: String, required: true, trim: true },
    week_offset: { type: Number, required: true, min: 0 },
    retained_users: { type: Number, required: true, min: 0, default: 0 },
  },
  { timestamps: true },
);

// ── Indexes ─────────────────────────────────────────────────────────────

// Compound unique key: one document per (cohort_week, week_offset)
AnalyticsCohortRetentionSchema.index(
  { cohort_week: 1, week_offset: 1 },
  { unique: true },
);

// ── Model ───────────────────────────────────────────────────────────────

export const AnalyticsCohortRetentionModel = mongoose.model<IAnalyticsCohortRetention>(
  "AnalyticsCohortRetention",
  AnalyticsCohortRetentionSchema,
);

// ── Repository ──────────────────────────────────────────────────────────

export class AnalyticsCohortRetentionRepository extends BaseRepository<IAnalyticsCohortRetention> {
  constructor() {
    super(AnalyticsCohortRetentionModel);
  }

  /**
   * Upsert a cohort retention record for a given cohort week and offset.
   * Idempotent: running twice for the same (cohort_week, week_offset) produces the same final state.
   */
  public async upsertCohort(
    cohortWeek: string,
    weekOffset: number,
    retainedUsers: number,
    session?: ClientSession,
  ): Promise<IAnalyticsCohortRetention> {
    const result = await this.model.findOneAndUpdate(
      { cohort_week: cohortWeek, week_offset: weekOffset },
      { $set: { retained_users: retainedUsers } },
      { upsert: true, new: true, session: session ?? undefined },
    );
    return result as IAnalyticsCohortRetention;
  }

  /**
   * Find retention data for a range of cohort weeks.
   * Used to build the cohort retention matrix.
   */
  public async findByCohortRange(
    fromWeek: string,
    toWeek: string,
    session?: ClientSession,
  ): Promise<IAnalyticsCohortRetention[]> {
    const query = this.model
      .find({ cohort_week: { $gte: fromWeek, $lte: toWeek } })
      .sort({ cohort_week: 1, week_offset: 1 });
    if (session) query.session(session);
    return query.exec();
  }

  /**
   * Find all retention offsets for a specific cohort week.
   */
  public async findByCohortWeek(
    cohortWeek: string,
    session?: ClientSession,
  ): Promise<IAnalyticsCohortRetention[]> {
    const query = this.model
      .find({ cohort_week: cohortWeek })
      .sort({ week_offset: 1 });
    if (session) query.session(session);
    return query.exec();
  }
}

// ── Singleton export ────────────────────────────────────────────────────

export const analyticsCohortRetentionRepo = new AnalyticsCohortRetentionRepository();
