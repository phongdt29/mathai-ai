import mongoose, { type ClientSession, type Document, Schema } from "mongoose";
import BaseRepository from "./base.model";

// ── Types ───────────────────────────────────────────────────────────────

export type PaymentGateway = "vnpay" | "momo" | "sepay";
export type PaymentStatus =
  | "pending"
  | "succeeded"
  | "failed"
  | "expired"
  | "refunded";

// ── Interface ───────────────────────────────────────────────────────────

export interface IPaymentTransaction extends Document {
  intent_id: string; // ULID, public-facing
  user_id: mongoose.Types.ObjectId;
  plan_id: mongoose.Types.ObjectId | null;
  gateway: PaymentGateway;
  amount_vnd: number; // integer >= 0, VND không thập phân
  status: PaymentStatus;
  idempotency_key: string; // unique
  redirect_url: string;
  expires_at: Date;
  paid_at: Date | null;
  gateway_transaction_id: string | null;
  signed_payload_in: Record<string, unknown> | null;
  refund_amount_vnd: number | null;
  createdAt: Date;
  updatedAt: Date;
}

// ── Schema ──────────────────────────────────────────────────────────────

const PaymentTransactionSchema = new Schema<IPaymentTransaction>(
  {
    intent_id: { type: String, required: true, unique: true, trim: true },
    user_id: { type: Schema.Types.ObjectId, ref: "User", required: true },
    plan_id: { type: Schema.Types.ObjectId, ref: "Plan", default: null },
    gateway: {
      type: String,
      required: true,
      enum: ["vnpay", "momo", "sepay"],
    },
    amount_vnd: {
      type: Number,
      required: true,
      min: 0,
      validate: {
        validator: (v: number) => Number.isInteger(v),
        message: "amount_vnd must be an integer",
      },
    },
    status: {
      type: String,
      required: true,
      enum: ["pending", "succeeded", "failed", "expired", "refunded"],
      default: "pending",
    },
    idempotency_key: { type: String, required: true, unique: true, trim: true },
    redirect_url: { type: String, required: true },
    expires_at: { type: Date, required: true },
    paid_at: { type: Date, default: null },
    gateway_transaction_id: { type: String, default: null },
    signed_payload_in: { type: Schema.Types.Mixed, default: null },
    refund_amount_vnd: {
      type: Number,
      default: null,
      validate: {
        validator: (v: number | null) =>
          v === null || (Number.isInteger(v) && v >= 0),
        message: "refund_amount_vnd must be a non-negative integer or null",
      },
    },
  },
  { timestamps: true },
);

// ── Indexes ─────────────────────────────────────────────────────────────

PaymentTransactionSchema.index({ user_id: 1, createdAt: -1 });
PaymentTransactionSchema.index({ gateway: 1, gateway_transaction_id: 1 });
PaymentTransactionSchema.index({ status: 1, expires_at: 1 });

// ── Model ───────────────────────────────────────────────────────────────

export const PaymentTransactionModel = mongoose.model<IPaymentTransaction>(
  "PaymentTransaction",
  PaymentTransactionSchema,
);

// ── Repository ──────────────────────────────────────────────────────────

export class PaymentTransactionRepository extends BaseRepository<IPaymentTransaction> {
  constructor() {
    super(PaymentTransactionModel);
  }

  /**
   * Find a transaction by its public-facing intent_id (ULID).
   */
  public async findByIntentId(
    intentId: string,
    session?: ClientSession,
  ): Promise<IPaymentTransaction | null> {
    const query = this.model.findOne({ intent_id: intentId });
    if (session) query.session(session);
    return query.exec();
  }

  /**
   * Find a transaction by idempotency_key for a given user (idempotency check).
   */
  public async findByIdempotencyKey(
    idempotencyKey: string,
    session?: ClientSession,
  ): Promise<IPaymentTransaction | null> {
    const query = this.model.findOne({ idempotency_key: idempotencyKey });
    if (session) query.session(session);
    return query.exec();
  }

  /**
   * Find all transactions for a user, ordered by most recent first.
   */
  public async findByUserId(
    userId: string,
    limit: number = 20,
    session?: ClientSession,
  ): Promise<IPaymentTransaction[]> {
    const query = this.model
      .find({ user_id: userId })
      .sort({ createdAt: -1 })
      .limit(limit);
    if (session) query.session(session);
    return query.exec();
  }

  /**
   * Find stale pending transactions that have expired (for cron job).
   */
  public async findStalePending(
    session?: ClientSession,
  ): Promise<IPaymentTransaction[]> {
    const query = this.model.find({
      status: "pending",
      expires_at: { $lt: new Date() },
    });
    if (session) query.session(session);
    return query.exec();
  }

  /**
   * Find by gateway and gateway_transaction_id (for webhook lookup).
   */
  public async findByGatewayTransactionId(
    gateway: PaymentGateway,
    gatewayTransactionId: string,
    session?: ClientSession,
  ): Promise<IPaymentTransaction | null> {
    const query = this.model.findOne({
      gateway,
      gateway_transaction_id: gatewayTransactionId,
    });
    if (session) query.session(session);
    return query.exec();
  }

  /**
   * Mark a transaction as succeeded after successful payment.
   */
  public async markSucceeded(
    id: string,
    gatewayTransactionId: string,
    signedPayloadIn: Record<string, unknown>,
    session?: ClientSession,
  ): Promise<IPaymentTransaction | null> {
    return this.model
      .findByIdAndUpdate(
        id,
        {
          $set: {
            status: "succeeded",
            paid_at: new Date(),
            gateway_transaction_id: gatewayTransactionId,
            signed_payload_in: signedPayloadIn,
          },
        },
        { new: true, session: session ?? undefined },
      )
      .exec();
  }

  /**
   * Mark a transaction as expired.
   */
  public async markExpired(
    id: string,
    session?: ClientSession,
  ): Promise<IPaymentTransaction | null> {
    return this.model
      .findByIdAndUpdate(
        id,
        { $set: { status: "expired" } },
        { new: true, session: session ?? undefined },
      )
      .exec();
  }

  /**
   * Mark a transaction as failed.
   */
  public async markFailed(
    id: string,
    session?: ClientSession,
  ): Promise<IPaymentTransaction | null> {
    return this.model
      .findByIdAndUpdate(
        id,
        { $set: { status: "failed" } },
        { new: true, session: session ?? undefined },
      )
      .exec();
  }
}

// ── Singleton export ────────────────────────────────────────────────────

export const paymentTransactionRepository = new PaymentTransactionRepository();
