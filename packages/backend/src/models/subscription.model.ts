import mongoose, { type ClientSession, type Document, Schema } from "mongoose";
import BaseRepository from "./base.model";

// ── Types ───────────────────────────────────────────────────────────────

export type SubscriptionStatus =
  | "trialing"
  | "active"
  | "past_due" // grace period after failed renewal
  | "expired"
  | "cancelled"
  | "paused";

// ── Main interface ──────────────────────────────────────────────────────

export interface ISubscription extends Document {
  subscription_id: string; // ULID
  user_id: mongoose.Types.ObjectId;
  plan_id: string;
  status: SubscriptionStatus;
  trial_end_at: Date | null;
  current_period_start: Date;
  current_period_end: Date;
  next_billing_at: Date | null;
  cancelled_at: Date | null;
  cancel_reason: string | null;
  cancel_at_period_end: boolean; // user cancel nhưng giữ đến hết kỳ
  paused_at: Date | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

// ── Schema ──────────────────────────────────────────────────────────────

const SubscriptionSchema = new Schema<ISubscription>(
  {
    subscription_id: { type: String, required: true, unique: true, trim: true },
    user_id: { type: Schema.Types.ObjectId, ref: "User", required: true },
    plan_id: { type: String, required: true, trim: true },
    status: {
      type: String,
      required: true,
      enum: ["trialing", "active", "past_due", "expired", "cancelled", "paused"],
      default: "active",
    },
    trial_end_at: { type: Date, default: null },
    current_period_start: { type: Date, required: true },
    current_period_end: { type: Date, required: true },
    next_billing_at: { type: Date, default: null },
    cancelled_at: { type: Date, default: null },
    cancel_reason: { type: String, default: null, trim: true },
    cancel_at_period_end: { type: Boolean, default: false },
    paused_at: { type: Date, default: null },
    metadata: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true },
);

// ── Indexes ─────────────────────────────────────────────────────────────

SubscriptionSchema.index({ user_id: 1, status: 1 });
SubscriptionSchema.index({ next_billing_at: 1, status: 1 });
SubscriptionSchema.index({ status: 1, current_period_end: 1 });

// ── Model ───────────────────────────────────────────────────────────────

export const SubscriptionModel = mongoose.model<ISubscription>(
  "Subscription",
  SubscriptionSchema,
);

// ── Repository ──────────────────────────────────────────────────────────

export class SubscriptionRepository extends BaseRepository<ISubscription> {
  constructor() {
    super(SubscriptionModel);
  }

  /**
   * Find a subscription by its public-facing subscription_id (ULID).
   */
  public async findBySubscriptionId(
    subscriptionId: string,
    session?: ClientSession,
  ): Promise<ISubscription | null> {
    const query = this.model.findOne({ subscription_id: subscriptionId });
    if (session) query.session(session);
    return query.exec();
  }

  /**
   * Find the active or trialing subscription for a user.
   * A user should have at most one active subscription.
   */
  public async findActiveByUserId(
    userId: string,
    session?: ClientSession,
  ): Promise<ISubscription | null> {
    const query = this.model.findOne({
      user_id: userId,
      status: { $in: ["active", "trialing"] },
    });
    if (session) query.session(session);
    return query.exec();
  }

  /**
   * Find all subscriptions for a user, ordered by most recent first.
   */
  public async findByUserId(
    userId: string,
    limit: number = 20,
    session?: ClientSession,
  ): Promise<ISubscription[]> {
    const query = this.model
      .find({ user_id: userId })
      .sort({ createdAt: -1 })
      .limit(limit);
    if (session) query.session(session);
    return query.exec();
  }

  /**
   * Find subscriptions due for renewal (next_billing_at <= now, status active).
   * Used by the `subscription.process_renewals` cron job.
   */
  public async findDueForRenewal(
    now: Date,
    session?: ClientSession,
  ): Promise<ISubscription[]> {
    const query = this.model.find({
      status: "active",
      next_billing_at: { $lte: now },
      cancel_at_period_end: false,
    });
    if (session) query.session(session);
    return query.exec();
  }

  /**
   * Find subscriptions that are past_due and have exceeded grace period.
   * Used by the `subscription.expire_overdue` cron job.
   */
  public async findOverdueForExpiry(
    gracePeriodEnd: Date,
    session?: ClientSession,
  ): Promise<ISubscription[]> {
    const query = this.model.find({
      status: "past_due",
      current_period_end: { $lt: gracePeriodEnd },
    });
    if (session) query.session(session);
    return query.exec();
  }
}

// ── Singleton export ────────────────────────────────────────────────────

export const subscriptionRepository = new SubscriptionRepository();
