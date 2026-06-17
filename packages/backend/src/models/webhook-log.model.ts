import mongoose, { type ClientSession, type Document, Schema } from "mongoose";
import BaseRepository from "./base.model";

// ── Types ───────────────────────────────────────────────────────────────

export type WebhookSource = "vnpay" | "momo" | "sepay";

// ── Interface ───────────────────────────────────────────────────────────

export interface IWebhookLog extends Document {
  source: WebhookSource;
  event_type: string;
  raw_body: string;
  raw_headers: Record<string, string>;
  signature_valid: boolean;
  signature_reason: string | null;
  ip: string | null;
  received_at: Date;
  processed_at: Date | null;
  transaction_id: mongoose.Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

// ── Schema ──────────────────────────────────────────────────────────────

const WebhookLogSchema = new Schema<IWebhookLog>(
  {
    source: {
      type: String,
      required: true,
      enum: ["vnpay", "momo", "sepay"],
    },
    event_type: { type: String, required: true, trim: true },
    raw_body: { type: String, required: true },
    raw_headers: { type: Schema.Types.Mixed, required: true, default: {} },
    signature_valid: { type: Boolean, required: true },
    signature_reason: { type: String, default: null, trim: true },
    ip: { type: String, default: null, trim: true },
    received_at: { type: Date, required: true },
    processed_at: { type: Date, default: null },
    transaction_id: {
      type: Schema.Types.ObjectId,
      ref: "PaymentTransaction",
      default: null,
    },
  },
  { timestamps: true },
);

// ── Indexes ─────────────────────────────────────────────────────────────

WebhookLogSchema.index({ source: 1, received_at: -1 });
WebhookLogSchema.index({ transaction_id: 1 });

// ── Model ───────────────────────────────────────────────────────────────

export const WebhookLogModel = mongoose.model<IWebhookLog>(
  "WebhookLog",
  WebhookLogSchema,
);

// ── Repository ──────────────────────────────────────────────────────────

export class WebhookLogRepository extends BaseRepository<IWebhookLog> {
  constructor() {
    super(WebhookLogModel);
  }

  /**
   * Find webhook logs by source, ordered by most recent first.
   */
  public async findBySource(
    source: WebhookSource,
    limit: number = 50,
    session?: ClientSession,
  ): Promise<IWebhookLog[]> {
    const query = this.model
      .find({ source })
      .sort({ received_at: -1 })
      .limit(limit);
    if (session) query.session(session);
    return query.exec();
  }

  /**
   * Find webhook logs related to a specific transaction.
   */
  public async findByTransactionId(
    transactionId: string,
    session?: ClientSession,
  ): Promise<IWebhookLog[]> {
    const query = this.model
      .find({ transaction_id: transactionId })
      .sort({ received_at: -1 });
    if (session) query.session(session);
    return query.exec();
  }

  /**
   * Find webhook logs with invalid signatures for audit/security review.
   */
  public async findInvalidSignatures(
    source?: WebhookSource,
    limit: number = 50,
    session?: ClientSession,
  ): Promise<IWebhookLog[]> {
    const filter: Record<string, unknown> = { signature_valid: false };
    if (source) filter.source = source;
    const query = this.model
      .find(filter)
      .sort({ received_at: -1 })
      .limit(limit);
    if (session) query.session(session);
    return query.exec();
  }

  /**
   * Mark a webhook log as processed.
   */
  public async markProcessed(
    id: string,
    transactionId?: string,
    session?: ClientSession,
  ): Promise<IWebhookLog | null> {
    const update: Record<string, unknown> = { processed_at: new Date() };
    if (transactionId) update.transaction_id = transactionId;
    return this.model
      .findByIdAndUpdate(id, { $set: update }, { new: true, session: session ?? undefined })
      .exec();
  }
}

// ── Singleton export ────────────────────────────────────────────────────

export const webhookLogRepository = new WebhookLogRepository();
