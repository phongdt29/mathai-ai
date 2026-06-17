import mongoose, { type ClientSession, type Document, Schema } from "mongoose";
import BaseRepository from "./base.model";
import type { PaymentGateway } from "./payment-transaction.model";

export type PaymentGatewayMode = "user_select" | "auto_priority";
export type PaymentGatewayEnvironment = "sandbox" | "production";
export type PaymentGatewayHealthStatus = "unknown" | "healthy" | "unhealthy";

export interface PaymentGatewaySandboxConfig {
  [key: string]: string | number | boolean | null | undefined;
}

export interface EncryptedGatewayCredential {
  cipher_text: string;
  iv: string;
  auth_tag: string;
}

export interface PaymentGatewayStoredCredentials {
  sandbox: Record<string, EncryptedGatewayCredential>;
  production: Record<string, EncryptedGatewayCredential>;
}

export interface PaymentGatewayHealth {
  status: PaymentGatewayHealthStatus;
  checked_at: Date | null;
  message: string | null;
}

export interface PaymentGatewayConfigItem {
  gateway: PaymentGateway;
  enabled: boolean;
  priority: number;
  display_name: string;
  sandbox_config: PaymentGatewaySandboxConfig;
  credentials: PaymentGatewayStoredCredentials;
  last_health_check: PaymentGatewayHealth;
}

export interface IPaymentGatewayConfig extends Document {
  key: "default";
  mode: PaymentGatewayMode;
  environment: PaymentGatewayEnvironment;
  fallback_enabled: boolean;
  gateways: PaymentGatewayConfigItem[];
  created_by: mongoose.Types.ObjectId | null;
  updated_by: mongoose.Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const HealthSchema = new Schema<PaymentGatewayHealth>(
  {
    status: {
      type: String,
      enum: ["unknown", "healthy", "unhealthy"],
      default: "unknown",
      required: true,
    },
    checked_at: { type: Date, default: null },
    message: { type: String, default: null, trim: true },
  },
  { _id: false },
);

const GatewayItemSchema = new Schema<PaymentGatewayConfigItem>(
  {
    gateway: {
      type: String,
      enum: ["vnpay", "momo", "sepay"],
      required: true,
    },
    enabled: { type: Boolean, required: true, default: false },
    priority: { type: Number, required: true, min: 1, default: 100 },
    display_name: { type: String, required: true, trim: true },
    sandbox_config: { type: Schema.Types.Mixed, default: {} },
    credentials: {
      type: Schema.Types.Mixed,
      default: () => ({ sandbox: {}, production: {} }),
    },
    last_health_check: { type: HealthSchema, default: () => ({}) },
  },
  { _id: false },
);

const PaymentGatewayConfigSchema = new Schema<IPaymentGatewayConfig>(
  {
    key: {
      type: String,
      enum: ["default"],
      default: "default",
      unique: true,
      required: true,
    },
    mode: {
      type: String,
      enum: ["user_select", "auto_priority"],
      default: "user_select",
      required: true,
    },
    environment: {
      type: String,
      enum: ["sandbox", "production"],
      default: "sandbox",
      required: true,
    },
    fallback_enabled: { type: Boolean, default: true, required: true },
    gateways: { type: [GatewayItemSchema], default: [] },
    created_by: { type: Schema.Types.ObjectId, ref: "User", default: null },
    updated_by: { type: Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true },
);


export const DEFAULT_GATEWAY_ITEMS: PaymentGatewayConfigItem[] = [
  {
    gateway: "vnpay",
    enabled: true,
    priority: 1,
    display_name: "VNPAY",
    sandbox_config: {},
    credentials: { sandbox: {}, production: {} },
    last_health_check: { status: "unknown", checked_at: null, message: null },
  },
  {
    gateway: "sepay",
    enabled: false,
    priority: 2,
    display_name: "SePay",
    sandbox_config: {},
    credentials: { sandbox: {}, production: {} },
    last_health_check: { status: "unknown", checked_at: null, message: null },
  },
  {
    gateway: "momo",
    enabled: true,
    priority: 3,
    display_name: "MoMo",
    sandbox_config: {},
    credentials: { sandbox: {}, production: {} },
    last_health_check: { status: "unknown", checked_at: null, message: null },
  },
];

export function createDefaultGatewayConfig(): Pick<
  IPaymentGatewayConfig,
  "key" | "mode" | "environment" | "fallback_enabled" | "gateways"
> {
  return {
    key: "default",
    mode: "user_select",
    environment: "sandbox",
    fallback_enabled: true,
    gateways: DEFAULT_GATEWAY_ITEMS.map((gateway) => ({
      ...gateway,
      sandbox_config: { ...gateway.sandbox_config },
      credentials: {
        sandbox: { ...(gateway.credentials?.sandbox ?? {}) },
        production: { ...(gateway.credentials?.production ?? {}) },
      },
      last_health_check: { ...gateway.last_health_check },
    })),
  };
}

export const PaymentGatewayConfigModel = mongoose.model<IPaymentGatewayConfig>(
  "PaymentGatewayConfig",
  PaymentGatewayConfigSchema,
);

export class PaymentGatewayConfigRepository extends BaseRepository<IPaymentGatewayConfig> {
  constructor() {
    super(PaymentGatewayConfigModel);
  }

  public async getActive(
    session?: ClientSession,
  ): Promise<IPaymentGatewayConfig | null> {
    const query = this.model.findOne({ key: "default" });
    if (session) query.session(session);
    return query.exec();
  }

  public async getOrDefault(
    session?: ClientSession,
  ): Promise<IPaymentGatewayConfig | Pick<IPaymentGatewayConfig, "key" | "mode" | "environment" | "fallback_enabled" | "gateways">> {
    const config = await this.getActive(session);
    return config ?? createDefaultGatewayConfig();
  }

  public async upsertActive(
    data: Partial<IPaymentGatewayConfig>,
    session?: ClientSession,
  ): Promise<IPaymentGatewayConfig> {
    return this.model
      .findOneAndUpdate(
        { key: "default" },
        { $set: { ...data, key: "default" } },
        { new: true, upsert: true, session: session ?? undefined },
      )
      .exec() as Promise<IPaymentGatewayConfig>;
  }
}

export const paymentGatewayConfigRepository =
  new PaymentGatewayConfigRepository();
