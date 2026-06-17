import mongoose, { type ClientSession, type Document, Schema } from "mongoose";
import BaseRepository from "./base.model";

// ── Types ───────────────────────────────────────────────────────────────

export interface IPushSubscriptionKeys {
  p256dh: string;
  auth: string;
}

// ── Main interface ──────────────────────────────────────────────────────

export interface IPushSubscription extends Document {
  user_id: mongoose.Types.ObjectId;
  endpoint: string;
  keys: IPushSubscriptionKeys;
  expiration_time: number | null;
  user_agent: string | null;
  is_active: boolean;
  last_used_at: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

// ── Sub-schemas ─────────────────────────────────────────────────────────

const PushSubscriptionKeysSchema = new Schema<IPushSubscriptionKeys>(
  {
    p256dh: { type: String, required: true },
    auth: { type: String, required: true },
  },
  { _id: false },
);

// ── Main schema ─────────────────────────────────────────────────────────

const PushSubscriptionSchema = new Schema<IPushSubscription>(
  {
    user_id: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    endpoint: { type: String, required: true, unique: true, trim: true },
    keys: { type: PushSubscriptionKeysSchema, required: true },
    expiration_time: { type: Number, default: null },
    user_agent: { type: String, default: null },
    is_active: { type: Boolean, default: true },
    last_used_at: { type: Date, default: null },
  },
  { timestamps: true },
);

// ── Indexes ─────────────────────────────────────────────────────────────

// Compound index for finding active subscriptions per user
PushSubscriptionSchema.index({ user_id: 1, is_active: 1 });

// ── Model ───────────────────────────────────────────────────────────────

export const PushSubscriptionModel = mongoose.model<IPushSubscription>(
  "PushSubscription",
  PushSubscriptionSchema,
);

// ── Repository ──────────────────────────────────────────────────────────

export class PushSubscriptionRepository extends BaseRepository<IPushSubscription> {
  constructor() {
    super(PushSubscriptionModel);
  }

  /**
   * Find all active subscriptions for a user.
   */
  public async findActiveByUserId(
    userId: string,
    session?: ClientSession,
  ): Promise<IPushSubscription[]> {
    const query = this.model.find({
      user_id: userId,
      is_active: true,
    });
    if (session) query.session(session);
    return query.exec();
  }

  /**
   * Find a subscription by its endpoint URL.
   */
  public async findByEndpoint(
    endpoint: string,
    session?: ClientSession,
  ): Promise<IPushSubscription | null> {
    const query = this.model.findOne({ endpoint });
    if (session) query.session(session);
    return query.exec();
  }

  /**
   * Upsert a push subscription (create or reactivate).
   * If the endpoint already exists, update keys and reactivate.
   */
  public async upsertSubscription(
    data: {
      user_id: string;
      endpoint: string;
      keys: IPushSubscriptionKeys;
      expiration_time?: number | null;
      user_agent?: string | null;
    },
    session?: ClientSession,
  ): Promise<IPushSubscription> {
    const result = await this.model
      .findOneAndUpdate(
        { endpoint: data.endpoint },
        {
          $set: {
            user_id: data.user_id,
            keys: data.keys,
            expiration_time: data.expiration_time ?? null,
            user_agent: data.user_agent ?? null,
            is_active: true,
          },
        },
        { upsert: true, new: true, session: session ?? undefined },
      )
      .exec();
    return result as IPushSubscription;
  }

  /**
   * Deactivate a subscription by endpoint.
   */
  public async deactivateByEndpoint(
    endpoint: string,
    session?: ClientSession,
  ): Promise<IPushSubscription | null> {
    return this.model
      .findOneAndUpdate(
        { endpoint },
        { $set: { is_active: false } },
        { new: true, session: session ?? undefined },
      )
      .exec();
  }

  /**
   * Deactivate multiple subscriptions by their endpoints (batch).
   * Used when push service reports invalid tokens.
   */
  public async deactivateByEndpoints(
    endpoints: string[],
    session?: ClientSession,
  ): Promise<number> {
    const result = await this.model
      .updateMany(
        { endpoint: { $in: endpoints }, is_active: true },
        { $set: { is_active: false } },
        { session: session ?? undefined },
      )
      .exec();
    return result.modifiedCount;
  }

  /**
   * Update last_used_at for a subscription.
   */
  public async updateLastUsed(
    endpoint: string,
    session?: ClientSession,
  ): Promise<void> {
    await this.model
      .updateOne(
        { endpoint },
        { $set: { last_used_at: new Date() } },
        { session: session ?? undefined },
      )
      .exec();
  }
}

// ── Singleton export ────────────────────────────────────────────────────

export const pushSubscriptionRepository = new PushSubscriptionRepository();
