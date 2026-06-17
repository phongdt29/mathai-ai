import mongoose, { type ClientSession, type Document, Schema } from "mongoose";
import BaseRepository from "./base.model";

// ── Types ───────────────────────────────────────────────────────────────

export type BillingTransactionType =
  | "invoice_issued"
  | "payment_received"
  | "refund"
  | "credit_granted"
  | "credit_consumed"
  | "adjustment";

// ── Main interface ──────────────────────────────────────────────────────

export interface IBillingTransaction extends Document {
  user_id: mongoose.Types.ObjectId;
  subscription_id: mongoose.Types.ObjectId | null;
  invoice_id: mongoose.Types.ObjectId | null;
  payment_transaction_id: mongoose.Types.ObjectId | null;
  type: BillingTransactionType;
  amount_vnd: number; // positive = credit-to-user, negative = debit
  description: string;
  performed_by: mongoose.Types.ObjectId | null; // admin user_id for manual actions
  metadata: Record<string, unknown>;
  createdAt: Date;
}

// ── Schema ──────────────────────────────────────────────────────────────

const BillingTransactionSchema = new Schema<IBillingTransaction>(
  {
    user_id: { type: Schema.Types.ObjectId, ref: "User", required: true },
    subscription_id: {
      type: Schema.Types.ObjectId,
      ref: "Subscription",
      default: null,
    },
    invoice_id: {
      type: Schema.Types.ObjectId,
      ref: "Invoice",
      default: null,
    },
    payment_transaction_id: {
      type: Schema.Types.ObjectId,
      ref: "PaymentTransaction",
      default: null,
    },
    type: {
      type: String,
      required: true,
      enum: [
        "invoice_issued",
        "payment_received",
        "refund",
        "credit_granted",
        "credit_consumed",
        "adjustment",
      ],
    },
    amount_vnd: {
      type: Number,
      required: true,
      validate: {
        validator: (v: number) => Number.isInteger(v),
        message: "amount_vnd must be an integer",
      },
    },
    description: { type: String, required: true, trim: true },
    performed_by: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    metadata: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

// ── Indexes ─────────────────────────────────────────────────────────────

BillingTransactionSchema.index({ user_id: 1, createdAt: -1 });
BillingTransactionSchema.index({ invoice_id: 1 });
BillingTransactionSchema.index({ payment_transaction_id: 1 });
BillingTransactionSchema.index({ type: 1, createdAt: -1 });

// ── Model ───────────────────────────────────────────────────────────────

export const BillingTransactionModel = mongoose.model<IBillingTransaction>(
  "BillingTransaction",
  BillingTransactionSchema,
);

// ── Repository ──────────────────────────────────────────────────────────

export class BillingTransactionRepository extends BaseRepository<IBillingTransaction> {
  constructor() {
    super(BillingTransactionModel);
  }

  /**
   * Find all billing transactions for a user, ordered by most recent first.
   */
  public async findByUserId(
    userId: string,
    limit: number = 50,
    session?: ClientSession,
  ): Promise<IBillingTransaction[]> {
    const query = this.model
      .find({ user_id: userId })
      .sort({ createdAt: -1 })
      .limit(limit);
    if (session) query.session(session);
    return query.exec();
  }

  /**
   * Find billing transactions for a specific invoice.
   */
  public async findByInvoiceId(
    invoiceId: string,
    session?: ClientSession,
  ): Promise<IBillingTransaction[]> {
    const query = this.model
      .find({ invoice_id: invoiceId })
      .sort({ createdAt: -1 });
    if (session) query.session(session);
    return query.exec();
  }

  /**
   * Find billing transactions by payment_transaction_id.
   * Used to check idempotency (avoid duplicate payment_received entries).
   */
  public async findByPaymentTransactionId(
    paymentTransactionId: string,
    session?: ClientSession,
  ): Promise<IBillingTransaction[]> {
    const query = this.model.find({
      payment_transaction_id: paymentTransactionId,
    });
    if (session) query.session(session);
    return query.exec();
  }

  /**
   * Find billing transactions by type within a date range.
   * Used for analytics and revenue reporting.
   */
  public async findByTypeAndDateRange(
    type: BillingTransactionType,
    from: Date,
    to: Date,
    session?: ClientSession,
  ): Promise<IBillingTransaction[]> {
    const query = this.model.find({
      type,
      createdAt: { $gte: from, $lte: to },
    }).sort({ createdAt: -1 });
    if (session) query.session(session);
    return query.exec();
  }
}

// ── Singleton export ────────────────────────────────────────────────────

export const billingTransactionRepository = new BillingTransactionRepository();
