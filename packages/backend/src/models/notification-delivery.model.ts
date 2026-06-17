import mongoose, { type ClientSession, type Document, Schema } from "mongoose";
import BaseRepository from "./base.model";

// ── Types ───────────────────────────────────────────────────────────────

export type NotificationChannel = "in_app" | "email" | "sms" | "push";
export type NotificationDeliveryStatus = "queued" | "sent" | "failed" | "skipped";

// ── Sub-document interfaces ─────────────────────────────────────────────

export interface INotificationRecipient {
  user_id: mongoose.Types.ObjectId | null;
  email: string | null;
  phone: string | null;
}

export interface INotificationChannelResult {
  channel: NotificationChannel;
  status: "sent" | "failed" | "skipped";
  provider_message_id: string | null;
  error_code: string | null;
}

// ── Main interface ──────────────────────────────────────────────────────

export interface INotificationDelivery extends Document {
  type: string;
  recipient: INotificationRecipient;
  channels: NotificationChannel[];
  channel_results: INotificationChannelResult[];
  status: NotificationDeliveryStatus;
  template_id: string;
  idempotency_key: string | null;
  retry_count: number;
  next_retry_at: Date | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
}

// ── Sub-schemas ─────────────────────────────────────────────────────────

const NotificationRecipientSchema = new Schema<INotificationRecipient>(
  {
    user_id: { type: Schema.Types.ObjectId, ref: "User", default: null },
    email: { type: String, default: null, lowercase: true, trim: true },
    phone: { type: String, default: null, trim: true },
  },
  { _id: false },
);

const NotificationChannelResultSchema = new Schema<INotificationChannelResult>(
  {
    channel: {
      type: String,
      required: true,
      enum: ["in_app", "email", "sms", "push"],
    },
    status: {
      type: String,
      required: true,
      enum: ["sent", "failed", "skipped"],
    },
    provider_message_id: { type: String, default: null },
    error_code: { type: String, default: null },
  },
  { _id: false },
);

// ── Main schema ─────────────────────────────────────────────────────────

const NotificationDeliverySchema = new Schema<INotificationDelivery>(
  {
    type: { type: String, required: true, trim: true },
    recipient: { type: NotificationRecipientSchema, required: true },
    channels: {
      type: [{ type: String, enum: ["in_app", "email", "sms", "push"] }],
      required: true,
    },
    channel_results: {
      type: [NotificationChannelResultSchema],
      default: [],
    },
    status: {
      type: String,
      required: true,
      enum: ["queued", "sent", "failed", "skipped"],
      default: "queued",
    },
    template_id: { type: String, required: true, trim: true },
    idempotency_key: { type: String, default: null, trim: true },
    retry_count: { type: Number, default: 0, min: 0 },
    next_retry_at: { type: Date, default: null },
    metadata: { type: Schema.Types.Mixed, default: null },
  },
  { timestamps: true },
);

// ── Indexes ─────────────────────────────────────────────────────────────

// Unique partial index: only index non-null idempotency_key values
NotificationDeliverySchema.index(
  { idempotency_key: 1 },
  {
    unique: true,
    partialFilterExpression: { idempotency_key: { $type: "string" } },
  },
);

NotificationDeliverySchema.index({ "recipient.user_id": 1, createdAt: -1 });
NotificationDeliverySchema.index({ status: 1, next_retry_at: 1 });

// ── Model ───────────────────────────────────────────────────────────────

export const NotificationDeliveryModel = mongoose.model<INotificationDelivery>(
  "NotificationDelivery",
  NotificationDeliverySchema,
);

// ── Repository ──────────────────────────────────────────────────────────

export class NotificationDeliveryRepository extends BaseRepository<INotificationDelivery> {
  constructor() {
    super(NotificationDeliveryModel);
  }

  /**
   * Find a delivery by its idempotency key.
   * Returns null if key is not found or key is null.
   */
  public async findByIdempotencyKey(
    key: string,
    session?: ClientSession,
  ): Promise<INotificationDelivery | null> {
    const query = this.model.findOne({ idempotency_key: key });
    if (session) query.session(session);
    return query.exec();
  }

  /**
   * Find failed deliveries eligible for retry:
   * - status = "failed"
   * - next_retry_at <= now
   * - retry_count < maxRetries
   */
  public async findFailedForRetry(
    maxRetries: number = 3,
    session?: ClientSession,
  ): Promise<INotificationDelivery[]> {
    const now = new Date();
    const query = this.model.find({
      status: "failed",
      next_retry_at: { $lte: now },
      retry_count: { $lt: maxRetries },
    });
    if (session) query.session(session);
    return query.exec();
  }

  /**
   * Find deliveries for a specific user, ordered by most recent first.
   */
  public async findByUserId(
    userId: string,
    limit: number = 20,
    session?: ClientSession,
  ): Promise<INotificationDelivery[]> {
    const query = this.model
      .find({ "recipient.user_id": userId })
      .sort({ createdAt: -1 })
      .limit(limit);
    if (session) query.session(session);
    return query.exec();
  }

  /**
   * Find deliveries by type and status with pagination.
   */
  public async findByTypeAndStatus(
    type: string,
    status: NotificationDeliveryStatus,
    limit: number = 20,
    session?: ClientSession,
  ): Promise<INotificationDelivery[]> {
    const query = this.model
      .find({ type, status })
      .sort({ createdAt: -1 })
      .limit(limit);
    if (session) query.session(session);
    return query.exec();
  }
}

// ── Singleton export ────────────────────────────────────────────────────

export const notificationDeliveryRepository = new NotificationDeliveryRepository();
