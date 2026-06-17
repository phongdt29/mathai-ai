import mongoose, { type ClientSession, type Document, Schema } from "mongoose";
import BaseRepository from "./base.model";

// ── Interface ───────────────────────────────────────────────────────────

export interface IAnalyticsDailyRevenue extends Document {
  date: string; // ISO date string YYYY-MM-DD (ICT)
  gross_revenue_vnd: number; // integer >= 0, VND nguyên
  refunds_vnd: number; // integer >= 0
  mrr_vnd: number; // integer >= 0, Monthly Recurring Revenue
  new_subs: number; // new subscriptions count
  churned_subs: number; // churned subscriptions count
  createdAt: Date;
  updatedAt: Date;
}

// ── Schema ──────────────────────────────────────────────────────────────

const AnalyticsDailyRevenueSchema = new Schema<IAnalyticsDailyRevenue>(
  {
    date: { type: String, required: true, trim: true },
    gross_revenue_vnd: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
      validate: {
        validator: (v: number) => Number.isInteger(v) && v >= 0,
        message: "gross_revenue_vnd must be a non-negative integer",
      },
    },
    refunds_vnd: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
      validate: {
        validator: (v: number) => Number.isInteger(v) && v >= 0,
        message: "refunds_vnd must be a non-negative integer",
      },
    },
    mrr_vnd: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
      validate: {
        validator: (v: number) => Number.isInteger(v) && v >= 0,
        message: "mrr_vnd must be a non-negative integer",
      },
    },
    new_subs: { type: Number, required: true, min: 0, default: 0 },
    churned_subs: { type: Number, required: true, min: 0, default: 0 },
  },
  { timestamps: true },
);

// ── Indexes ─────────────────────────────────────────────────────────────

// Unique key: one document per date
AnalyticsDailyRevenueSchema.index({ date: 1 }, { unique: true });

// ── Model ───────────────────────────────────────────────────────────────

export const AnalyticsDailyRevenueModel = mongoose.model<IAnalyticsDailyRevenue>(
  "AnalyticsDailyRevenue",
  AnalyticsDailyRevenueSchema,
);

// ── Repository ──────────────────────────────────────────────────────────

export class AnalyticsDailyRevenueRepository extends BaseRepository<IAnalyticsDailyRevenue> {
  constructor() {
    super(AnalyticsDailyRevenueModel);
  }

  /**
   * Upsert a daily revenue record for a given date.
   * Idempotent: running twice for the same date produces the same final state.
   */
  public async upsertDaily(
    date: string,
    data: {
      gross_revenue_vnd: number;
      refunds_vnd: number;
      mrr_vnd: number;
      new_subs: number;
      churned_subs: number;
    },
    session?: ClientSession,
  ): Promise<IAnalyticsDailyRevenue> {
    const result = await this.model.findOneAndUpdate(
      { date },
      {
        $set: {
          gross_revenue_vnd: data.gross_revenue_vnd,
          refunds_vnd: data.refunds_vnd,
          mrr_vnd: data.mrr_vnd,
          new_subs: data.new_subs,
          churned_subs: data.churned_subs,
        },
      },
      { upsert: true, new: true, session: session ?? undefined },
    );
    return result as IAnalyticsDailyRevenue;
  }

  /**
   * Find revenue records within a date range.
   */
  public async findByDateRange(
    from: string,
    to: string,
    session?: ClientSession,
  ): Promise<IAnalyticsDailyRevenue[]> {
    const query = this.model
      .find({ date: { $gte: from, $lte: to } })
      .sort({ date: 1 });
    if (session) query.session(session);
    return query.exec();
  }
}

// ── Singleton export ────────────────────────────────────────────────────

export const analyticsDailyRevenueRepo = new AnalyticsDailyRevenueRepository();
