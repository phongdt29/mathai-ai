import mongoose, { type ClientSession, type Document, Schema } from "mongoose";
import BaseRepository from "./base.model";

// ── Types ───────────────────────────────────────────────────────────────

export type BillingInterval = "month" | "quarter" | "year" | "one_time";

// ── Sub-document interfaces ─────────────────────────────────────────────

export interface IPlanEntitlement {
  feature: string; // e.g. "ai_solver_unlimited"
  limit: number | null; // null = unlimited
  period: "day" | "month" | "year" | null;
}

// ── Main interface ──────────────────────────────────────────────────────

export interface IPlan extends Document {
  plan_id: string; // e.g. "math_premium_monthly"
  name: string;
  description: string;
  price_vnd: number; // integer >= 0, VND without decimals
  currency: "VND";
  billing_interval: BillingInterval;
  trial_days: number; // default 0
  entitlements: IPlanEntitlement[];
  is_active: boolean;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

// ── Sub-schemas ─────────────────────────────────────────────────────────

const PlanEntitlementSchema = new Schema<IPlanEntitlement>(
  {
    feature: { type: String, required: true, trim: true },
    limit: { type: Number, default: null },
    period: {
      type: String,
      default: null,
      enum: ["day", "month", "year", null],
    },
  },
  { _id: false },
);

// ── Main schema ─────────────────────────────────────────────────────────

const PlanSchema = new Schema<IPlan>(
  {
    plan_id: { type: String, required: true, unique: true, trim: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, default: "", trim: true },
    price_vnd: {
      type: Number,
      required: true,
      min: 0,
      validate: {
        validator: (v: number) => Number.isInteger(v) && v >= 0,
        message: "price_vnd must be a non-negative integer",
      },
    },
    currency: { type: String, default: "VND", enum: ["VND"] },
    billing_interval: {
      type: String,
      required: true,
      enum: ["month", "quarter", "year", "one_time"],
    },
    trial_days: {
      type: Number,
      default: 0,
      min: 0,
      validate: {
        validator: (v: number) => Number.isInteger(v) && v >= 0,
        message: "trial_days must be a non-negative integer",
      },
    },
    entitlements: { type: [PlanEntitlementSchema], default: [] },
    is_active: { type: Boolean, default: true },
    metadata: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true },
);

// ── Indexes ─────────────────────────────────────────────────────────────

PlanSchema.index({ is_active: 1 });
PlanSchema.index({ billing_interval: 1, is_active: 1 });

// ── Model ───────────────────────────────────────────────────────────────

export const PlanModel = mongoose.model<IPlan>("Plan", PlanSchema);

// ── Repository ──────────────────────────────────────────────────────────

export class PlanRepository extends BaseRepository<IPlan> {
  constructor() {
    super(PlanModel);
  }

  /**
   * Find a plan by its public-facing plan_id.
   */
  public async findByPlanId(
    planId: string,
    session?: ClientSession,
  ): Promise<IPlan | null> {
    const query = this.model.findOne({ plan_id: planId });
    if (session) query.session(session);
    return query.exec();
  }

  /**
   * Find all active plans.
   */
  public async findActivePlans(
    session?: ClientSession,
  ): Promise<IPlan[]> {
    const query = this.model
      .find({ is_active: true })
      .sort({ "metadata.sort_order": 1, price_vnd: 1, createdAt: 1 });
    if (session) query.session(session);
    return query.exec();
  }
}

// ── Singleton export ────────────────────────────────────────────────────

export const planRepository = new PlanRepository();
