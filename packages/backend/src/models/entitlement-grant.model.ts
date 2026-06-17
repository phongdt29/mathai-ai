import mongoose, { type ClientSession, type Document, Schema } from "mongoose";
import BaseRepository from "./base.model";

// ── Types ───────────────────────────────────────────────────────────────

export type EntitlementSource = "subscription" | "promo" | "admin_grant";

// ── Main interface ──────────────────────────────────────────────────────

export interface IEntitlementGrant extends Document {
  user_id: mongoose.Types.ObjectId;
  subscription_id: mongoose.Types.ObjectId | null;
  feature: string; // e.g. "ai_solver_unlimited"
  source: EntitlementSource;
  source_id: string | null; // subscription_id / promo_code / audit_id
  limit: number | null; // null = unlimited
  period: "day" | "month" | "year" | null;
  is_active: boolean;
  starts_at: Date;
  ends_at: Date | null; // null = indefinite
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

// ── Schema ──────────────────────────────────────────────────────────────

const EntitlementGrantSchema = new Schema<IEntitlementGrant>(
  {
    user_id: { type: Schema.Types.ObjectId, ref: "User", required: true },
    subscription_id: {
      type: Schema.Types.ObjectId,
      ref: "Subscription",
      default: null,
    },
    feature: { type: String, required: true, trim: true },
    source: {
      type: String,
      required: true,
      enum: ["subscription", "promo", "admin_grant"],
    },
    source_id: { type: String, default: null, trim: true },
    limit: { type: Number, default: null },
    period: {
      type: String,
      default: null,
      enum: ["day", "month", "year", null],
    },
    is_active: { type: Boolean, default: true },
    starts_at: { type: Date, required: true },
    ends_at: { type: Date, default: null },
    metadata: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true },
);

// ── Indexes ─────────────────────────────────────────────────────────────

EntitlementGrantSchema.index({ user_id: 1, feature: 1, ends_at: 1, is_active: 1 });
EntitlementGrantSchema.index({ subscription_id: 1, is_active: 1 });
EntitlementGrantSchema.index({ user_id: 1, is_active: 1 });

// ── Model ───────────────────────────────────────────────────────────────

export const EntitlementGrantModel = mongoose.model<IEntitlementGrant>(
  "EntitlementGrant",
  EntitlementGrantSchema,
);

// ── Repository ──────────────────────────────────────────────────────────

export class EntitlementGrantRepository extends BaseRepository<IEntitlementGrant> {
  constructor() {
    super(EntitlementGrantModel);
  }

  /**
   * Check if a user has an active entitlement for a specific feature.
   * Considers is_active=true and ends_at is either null (indefinite) or in the future.
   */
  public async hasActiveEntitlement(
    userId: string,
    feature: string,
    now?: Date,
    session?: ClientSession,
  ): Promise<boolean> {
    const currentTime = now ?? new Date();
    const query = this.model.findOne({
      user_id: userId,
      feature,
      is_active: true,
      starts_at: { $lte: currentTime },
      $or: [
        { ends_at: null },
        { ends_at: { $gt: currentTime } },
      ],
    });
    if (session) query.session(session);
    const result = await query.exec();
    return result !== null;
  }

  /**
   * Find all active entitlements for a user.
   */
  public async findActiveByUserId(
    userId: string,
    now?: Date,
    session?: ClientSession,
  ): Promise<IEntitlementGrant[]> {
    const currentTime = now ?? new Date();
    const query = this.model.find({
      user_id: userId,
      is_active: true,
      starts_at: { $lte: currentTime },
      $or: [
        { ends_at: null },
        { ends_at: { $gt: currentTime } },
      ],
    });
    if (session) query.session(session);
    return query.exec();
  }

  /**
   * Find entitlements by subscription_id.
   * Used when refreshing entitlements after payment or deactivating on expiry.
   */
  public async findBySubscriptionId(
    subscriptionId: string,
    session?: ClientSession,
  ): Promise<IEntitlementGrant[]> {
    const query = this.model.find({ subscription_id: subscriptionId });
    if (session) query.session(session);
    return query.exec();
  }

  /**
   * Deactivate all entitlements for a subscription.
   * Used when subscription expires or is cancelled.
   */
  public async deactivateBySubscriptionId(
    subscriptionId: string,
    session?: ClientSession,
  ): Promise<number> {
    const result = await this.model.updateMany(
      { subscription_id: subscriptionId, is_active: true },
      { $set: { is_active: false } },
      { session: session ?? undefined },
    );
    return result.modifiedCount;
  }
}

// ── Singleton export ────────────────────────────────────────────────────

export const entitlementGrantRepository = new EntitlementGrantRepository();
