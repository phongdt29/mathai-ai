import mongoose, { type ClientSession, type Document, Schema } from "mongoose";
import BaseRepository from "./base.model";

// ── Types ───────────────────────────────────────────────────────────────

export type LeaderboardScope = "global" | "class" | "grade";
export type LeaderboardPeriod = "weekly" | "monthly" | "all_time";

// ── Sub-document interfaces ─────────────────────────────────────────────

export interface ILeaderboardRanking {
  student_id: string;
  student_name: string;
  score: number;
  rank: number;
}

// ── Main interface ──────────────────────────────────────────────────────

export interface ILeaderboardSnapshot extends Document {
  scope: LeaderboardScope;
  scope_id: string | null; // class_id or grade_level
  period: LeaderboardPeriod;
  period_key: string; // "2026-W21" / "2026-05" / "all"
  rankings: ILeaderboardRanking[];
  generated_at: Date;
  createdAt: Date;
}

// ── Sub-schemas ─────────────────────────────────────────────────────────

const LeaderboardRankingSchema = new Schema<ILeaderboardRanking>(
  {
    student_id: { type: String, required: true },
    student_name: { type: String, required: true, trim: true },
    score: { type: Number, required: true, min: 0 },
    rank: { type: Number, required: true, min: 1 },
  },
  { _id: false },
);

// ── Main schema ─────────────────────────────────────────────────────────

const LeaderboardSnapshotSchema = new Schema<ILeaderboardSnapshot>(
  {
    scope: {
      type: String,
      required: true,
      enum: ["global", "class", "grade"],
    },
    scope_id: { type: String, default: null, trim: true },
    period: {
      type: String,
      required: true,
      enum: ["weekly", "monthly", "all_time"],
    },
    period_key: { type: String, required: true, trim: true },
    rankings: { type: [LeaderboardRankingSchema], default: [] },
    generated_at: { type: Date, required: true, default: () => new Date() },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

// ── Indexes ─────────────────────────────────────────────────────────────

// Compound unique index: one snapshot per scope+scope_id+period+period_key
LeaderboardSnapshotSchema.index(
  { scope: 1, scope_id: 1, period: 1, period_key: 1 },
  { unique: true },
);

LeaderboardSnapshotSchema.index({ generated_at: -1 });

// ── Model ───────────────────────────────────────────────────────────────

export const LeaderboardSnapshotModel = mongoose.model<ILeaderboardSnapshot>(
  "LeaderboardSnapshot",
  LeaderboardSnapshotSchema,
);

// ── Repository ──────────────────────────────────────────────────────────

export class LeaderboardSnapshotRepository extends BaseRepository<ILeaderboardSnapshot> {
  constructor() {
    super(LeaderboardSnapshotModel);
  }

  /**
   * Find a specific leaderboard snapshot by scope, period, and period_key.
   */
  public async findSnapshot(
    scope: LeaderboardScope,
    scopeId: string | null,
    period: LeaderboardPeriod,
    periodKey: string,
    session?: ClientSession,
  ): Promise<ILeaderboardSnapshot | null> {
    const query = this.model.findOne({
      scope,
      scope_id: scopeId,
      period,
      period_key: periodKey,
    });
    if (session) query.session(session);
    return query.exec();
  }

  /**
   * Upsert a leaderboard snapshot (replace rankings on refresh).
   */
  public async upsertSnapshot(
    scope: LeaderboardScope,
    scopeId: string | null,
    period: LeaderboardPeriod,
    periodKey: string,
    rankings: ILeaderboardRanking[],
    session?: ClientSession,
  ): Promise<ILeaderboardSnapshot> {
    const result = await this.model.findOneAndUpdate(
      { scope, scope_id: scopeId, period, period_key: periodKey },
      {
        $set: {
          rankings,
          generated_at: new Date(),
        },
        $setOnInsert: {
          scope,
          scope_id: scopeId,
          period,
          period_key: periodKey,
        },
      },
      {
        new: true,
        upsert: true,
        setDefaultsOnInsert: true,
        session: session ?? undefined,
      },
    );
    return result as ILeaderboardSnapshot;
  }

  /**
   * Find the most recent snapshots for a given scope and period.
   */
  public async findRecent(
    scope: LeaderboardScope,
    scopeId: string | null,
    period: LeaderboardPeriod,
    limit: number = 5,
    session?: ClientSession,
  ): Promise<ILeaderboardSnapshot[]> {
    const query = this.model
      .find({ scope, scope_id: scopeId, period })
      .sort({ generated_at: -1 })
      .limit(limit);
    if (session) query.session(session);
    return query.exec();
  }
}

// ── Singleton export ────────────────────────────────────────────────────

export const leaderboardSnapshotRepository = new LeaderboardSnapshotRepository();
