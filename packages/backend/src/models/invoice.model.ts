import mongoose, { type ClientSession, type Document, Schema } from "mongoose";
import BaseRepository from "./base.model";

// ── Types ───────────────────────────────────────────────────────────────

export type InvoiceStatus = "draft" | "open" | "paid" | "uncollectible" | "void";

// ── Sub-document interfaces ─────────────────────────────────────────────

export interface IInvoiceLineItem {
  description: string;
  quantity: number;
  unit_price_vnd: number;
  amount_vnd: number; // quantity * unit_price_vnd
  plan_id?: string;
}

// ── Main interface ──────────────────────────────────────────────────────

export interface IInvoice extends Document {
  invoice_id: string; // ULID, public-facing identifier
  invoice_number: string; // "INV-YYYYMM-NNNNN", sequential per month
  user_id: mongoose.Types.ObjectId;
  subscription_id: mongoose.Types.ObjectId | null;
  status: InvoiceStatus;
  amount_subtotal_vnd: number; // sum of line_items.amount_vnd
  amount_tax_vnd: number;
  amount_total_vnd: number; // amount_subtotal_vnd + amount_tax_vnd
  amount_paid_vnd: number;
  currency: "VND";
  period_start: Date;
  period_end: Date;
  due_at: Date;
  paid_at: Date | null;
  payment_transaction_ids: mongoose.Types.ObjectId[];
  line_items: IInvoiceLineItem[];
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

// ── Sub-schemas ─────────────────────────────────────────────────────────

const InvoiceLineItemSchema = new Schema<IInvoiceLineItem>(
  {
    description: { type: String, required: true, trim: true },
    quantity: { type: Number, required: true, min: 1 },
    unit_price_vnd: {
      type: Number,
      required: true,
      min: 0,
      validate: {
        validator: (v: number) => Number.isInteger(v) && v >= 0,
        message: "unit_price_vnd must be a non-negative integer",
      },
    },
    amount_vnd: {
      type: Number,
      required: true,
      min: 0,
      validate: {
        validator: (v: number) => Number.isInteger(v) && v >= 0,
        message: "amount_vnd must be a non-negative integer",
      },
    },
    plan_id: { type: String, default: undefined, trim: true },
  },
  { _id: false },
);

// ── Main schema ─────────────────────────────────────────────────────────

const InvoiceSchema = new Schema<IInvoice>(
  {
    invoice_id: { type: String, required: true, unique: true, trim: true },
    invoice_number: { type: String, required: true, unique: true, trim: true },
    user_id: { type: Schema.Types.ObjectId, ref: "User", required: true },
    subscription_id: {
      type: Schema.Types.ObjectId,
      ref: "Subscription",
      default: null,
    },
    status: {
      type: String,
      required: true,
      enum: ["draft", "open", "paid", "uncollectible", "void"],
      default: "draft",
    },
    amount_subtotal_vnd: {
      type: Number,
      required: true,
      min: 0,
      validate: {
        validator: (v: number) => Number.isInteger(v) && v >= 0,
        message: "amount_subtotal_vnd must be a non-negative integer",
      },
    },
    amount_tax_vnd: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
      validate: {
        validator: (v: number) => Number.isInteger(v) && v >= 0,
        message: "amount_tax_vnd must be a non-negative integer",
      },
    },
    amount_total_vnd: {
      type: Number,
      required: true,
      min: 0,
      validate: {
        validator: (v: number) => Number.isInteger(v) && v >= 0,
        message: "amount_total_vnd must be a non-negative integer",
      },
    },
    amount_paid_vnd: {
      type: Number,
      default: 0,
      min: 0,
      validate: {
        validator: (v: number) => Number.isInteger(v) && v >= 0,
        message: "amount_paid_vnd must be a non-negative integer",
      },
    },
    currency: { type: String, default: "VND", enum: ["VND"] },
    period_start: { type: Date, required: true },
    period_end: { type: Date, required: true },
    due_at: { type: Date, required: true },
    paid_at: { type: Date, default: null },
    payment_transaction_ids: {
      type: [{ type: Schema.Types.ObjectId, ref: "PaymentTransaction" }],
      default: [],
    },
    line_items: { type: [InvoiceLineItemSchema], required: true },
    metadata: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true },
);

// ── Indexes ─────────────────────────────────────────────────────────────

InvoiceSchema.index({ user_id: 1, createdAt: -1 });
InvoiceSchema.index({ subscription_id: 1, createdAt: -1 });
InvoiceSchema.index({ status: 1, due_at: 1 });
// invoice_number index is already created by `unique: true` on the field definition;
// declaring it again here triggers a Mongoose "Duplicate schema index" warning.

// ── Model ───────────────────────────────────────────────────────────────

export const InvoiceModel = mongoose.model<IInvoice>("Invoice", InvoiceSchema);

// ── Repository ──────────────────────────────────────────────────────────

export class InvoiceRepository extends BaseRepository<IInvoice> {
  constructor() {
    super(InvoiceModel);
  }

  /**
   * Find an invoice by its public-facing invoice_id (ULID).
   */
  public async findByInvoiceId(
    invoiceId: string,
    session?: ClientSession,
  ): Promise<IInvoice | null> {
    const query = this.model.findOne({ invoice_id: invoiceId });
    if (session) query.session(session);
    return query.exec();
  }

  /**
   * Find an invoice by its invoice_number (INV-YYYYMM-NNNNN).
   */
  public async findByInvoiceNumber(
    invoiceNumber: string,
    session?: ClientSession,
  ): Promise<IInvoice | null> {
    const query = this.model.findOne({ invoice_number: invoiceNumber });
    if (session) query.session(session);
    return query.exec();
  }

  /**
   * Find all invoices for a user, ordered by most recent first.
   */
  public async findByUserId(
    userId: string,
    limit: number = 20,
    session?: ClientSession,
  ): Promise<IInvoice[]> {
    const query = this.model
      .find({ user_id: userId })
      .sort({ createdAt: -1 })
      .limit(limit);
    if (session) query.session(session);
    return query.exec();
  }

  /**
   * Find invoices for a subscription, ordered by most recent first.
   */
  public async findBySubscriptionId(
    subscriptionId: string,
    limit: number = 20,
    session?: ClientSession,
  ): Promise<IInvoice[]> {
    const query = this.model
      .find({ subscription_id: subscriptionId })
      .sort({ createdAt: -1 })
      .limit(limit);
    if (session) query.session(session);
    return query.exec();
  }

  /**
   * Find open invoices due within a given number of days.
   * Used by the `billing.send_invoice_reminders` cron job.
   */
  public async findOpenDueSoon(
    dueBefore: Date,
    session?: ClientSession,
  ): Promise<IInvoice[]> {
    const query = this.model.find({
      status: "open",
      due_at: { $lte: dueBefore },
    });
    if (session) query.session(session);
    return query.exec();
  }

  /**
   * Get the latest invoice_number for a given month prefix (e.g. "INV-202601-").
   * Used to generate the next sequential invoice number.
   */
  public async getLatestInvoiceNumberForMonth(
    monthPrefix: string,
    session?: ClientSession,
  ): Promise<string | null> {
    const query = this.model
      .findOne({ invoice_number: { $regex: `^${monthPrefix}` } })
      .sort({ invoice_number: -1 })
      .select("invoice_number");
    if (session) query.session(session);
    const result = await query.exec();
    return result?.invoice_number ?? null;
  }
}

// ── Singleton export ────────────────────────────────────────────────────

export const invoiceRepository = new InvoiceRepository();
