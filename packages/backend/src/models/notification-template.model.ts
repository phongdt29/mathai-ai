import mongoose, { type ClientSession, type Document, Schema } from "mongoose";
import BaseRepository from "./base.model";

// ── Types ───────────────────────────────────────────────────────────────

export type NotificationChannel = "in_app" | "email" | "sms" | "push";

// ── Sub-document interfaces ─────────────────────────────────────────────

export interface IEmailTemplate {
  subject_template: string;
  text_template: string;
  html_template: string;
}

export interface ISmsTemplate {
  text_template: string;
}

export interface IPushTemplate {
  title_template: string;
  body_template: string;
}

export interface IInAppTemplate {
  title_template: string;
  content_template: string;
  severity: string;
}

// ── Main interface ──────────────────────────────────────────────────────

export interface INotificationTemplate extends Document {
  template_id: string;
  type: string;
  version: string;
  channels: NotificationChannel[];
  email: IEmailTemplate | null;
  sms: ISmsTemplate | null;
  push: IPushTemplate | null;
  in_app: IInAppTemplate | null;
  variables: string[];
  is_active: boolean;
  created_by: mongoose.Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

// ── Sub-schemas ─────────────────────────────────────────────────────────

const EmailTemplateSchema = new Schema<IEmailTemplate>(
  {
    subject_template: { type: String, required: true },
    text_template: { type: String, required: true },
    html_template: { type: String, required: true },
  },
  { _id: false },
);

const SmsTemplateSchema = new Schema<ISmsTemplate>(
  {
    text_template: { type: String, required: true },
  },
  { _id: false },
);

const PushTemplateSchema = new Schema<IPushTemplate>(
  {
    title_template: { type: String, required: true },
    body_template: { type: String, required: true },
  },
  { _id: false },
);

const InAppTemplateSchema = new Schema<IInAppTemplate>(
  {
    title_template: { type: String, required: true },
    content_template: { type: String, required: true },
    severity: { type: String, required: true, default: "info" },
  },
  { _id: false },
);

// ── Main schema ─────────────────────────────────────────────────────────

const NotificationTemplateSchema = new Schema<INotificationTemplate>(
  {
    template_id: { type: String, required: true, unique: true, trim: true },
    type: { type: String, required: true, trim: true },
    version: { type: String, required: true, trim: true },
    channels: {
      type: [{ type: String, enum: ["in_app", "email", "sms", "push"] }],
      required: true,
    },
    email: { type: EmailTemplateSchema, default: null },
    sms: { type: SmsTemplateSchema, default: null },
    push: { type: PushTemplateSchema, default: null },
    in_app: { type: InAppTemplateSchema, default: null },
    variables: { type: [String], default: [] },
    is_active: { type: Boolean, default: true },
    created_by: { type: Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true },
);

// ── Indexes ─────────────────────────────────────────────────────────────

NotificationTemplateSchema.index({ type: 1, is_active: 1 });

// ── Model ───────────────────────────────────────────────────────────────

export const NotificationTemplateModel = mongoose.model<INotificationTemplate>(
  "NotificationTemplate",
  NotificationTemplateSchema,
);

// ── Repository ──────────────────────────────────────────────────────────

export class NotificationTemplateRepository extends BaseRepository<INotificationTemplate> {
  constructor() {
    super(NotificationTemplateModel);
  }

  /**
   * Find a template by its template_id (e.g. "password_reset.v1").
   */
  public async findByTemplateId(
    templateId: string,
    session?: ClientSession,
  ): Promise<INotificationTemplate | null> {
    const query = this.model.findOne({ template_id: templateId });
    if (session) query.session(session);
    return query.exec();
  }

  /**
   * Find all active templates.
   */
  public async findActive(
    session?: ClientSession,
  ): Promise<INotificationTemplate[]> {
    const query = this.model.find({ is_active: true }).sort({ template_id: 1 });
    if (session) query.session(session);
    return query.exec();
  }

  /**
   * Find active template by template_id.
   * Returns null if template doesn't exist or is inactive.
   */
  public async findActiveByTemplateId(
    templateId: string,
    session?: ClientSession,
  ): Promise<INotificationTemplate | null> {
    const query = this.model.findOne({ template_id: templateId, is_active: true });
    if (session) query.session(session);
    return query.exec();
  }
}

// ── Singleton export ────────────────────────────────────────────────────

export const notificationTemplateRepository = new NotificationTemplateRepository();
