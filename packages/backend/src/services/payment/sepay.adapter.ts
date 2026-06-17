import * as crypto from "node:crypto";
import type { PaymentStatus } from "../../models/payment-transaction.model";
import type {
  CreateGatewayPaymentParams,
  GatewayHealthResult,
  GatewayPaymentResult,
  GatewayWebhookEvent,
  GatewayWebhookVerification,
} from "./gateway.types";

export interface SePayConfig {
  apiKey: string;
  webhookSecret: string;
  bankAccount: string;
  bankCode: string;
  accountName: string;
  bankName?: string;
  qrTemplateUrl?: string;
}

export interface SePayWebhookHeaders {
  authorization?: string;
  "x-sepay-signature"?: string;
  [key: string]: string | undefined;
}

export interface SePayMappedStatus {
  status: PaymentStatus;
  failure_code?: string;
  failure_message?: string;
}

export class SePayAdapter {
  public readonly gateway = "sepay" as const;

  constructor(private readonly config: SePayConfig) {}

  public async createPayment(
    params: CreateGatewayPaymentParams,
  ): Promise<GatewayPaymentResult> {
    const transferContent = this.buildTransferContent(params.intent_id);
    return {
      type: "bank_transfer",
      gateway: this.gateway,
      bank_transfer: {
        amount_vnd: params.amount_vnd,
        bank_code: this.config.bankCode,
        bank_name: this.config.bankName ?? this.config.bankCode,
        account_number: this.config.bankAccount,
        account_name: this.config.accountName,
        transfer_content: transferContent,
        qr_url: this.buildQrUrl({
          amount_vnd: params.amount_vnd,
          transfer_content: transferContent,
        }),
        expires_at: params.expires_at.toISOString(),
      },
    };
  }

  public async healthCheck(): Promise<GatewayHealthResult> {
    const required = [
      this.config.apiKey,
      this.config.webhookSecret,
      this.config.bankAccount,
      this.config.bankCode,
      this.config.accountName,
    ];
    const healthy = required.every((value) => value.trim().length > 0);
    return {
      status: healthy ? "healthy" : "unhealthy",
      message: healthy ? null : "SePay configuration is incomplete",
    };
  }

  public verifyWebhook(
    rawBody: string,
    headers: SePayWebhookHeaders,
  ): GatewayWebhookVerification {
    const authHeader = headers.authorization ?? headers.Authorization;
    const bearerToken = authHeader?.startsWith("Bearer ")
      ? authHeader.slice("Bearer ".length)
      : null;
    if (bearerToken && bearerToken === this.config.apiKey) {
      return { valid: true, reason: null };
    }

    const signature = headers["x-sepay-signature"];
    if (!signature) {
      return { valid: false, reason: "MISSING_SIGNATURE" };
    }

    const expected = crypto
      .createHmac("sha256", this.config.webhookSecret)
      .update(rawBody)
      .digest("hex");

    if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) {
      return { valid: false, reason: "INVALID_SIGNATURE" };
    }

    return { valid: true, reason: null };
  }

  public mapWebhook(body: Record<string, unknown>): GatewayWebhookEvent {
    const content = this.firstString(
      body.content,
      body.transfer_content,
      body.description,
      body.transaction_content,
    );
    const intentId = content ? this.extractIntentId(content) : null;
    const amount = this.firstNumber(body.amount, body.transferAmount, body.transfer_amount);
    const gatewayTxnId = this.firstString(
      body.id,
      body.transaction_id,
      body.referenceCode,
      body.reference_code,
    );

    return {
      intent_id: intentId,
      gateway_transaction_id: gatewayTxnId,
      amount_vnd: amount,
      status: amount && amount > 0 ? "succeeded" : "pending",
      raw: body,
    };
  }

  public mapStatus(event: GatewayWebhookEvent): SePayMappedStatus {
    if (event.status === "succeeded") return { status: "succeeded" };
    if (event.status === "failed") return { status: "failed" };
    return { status: "pending" };
  }

  public buildTransferContent(intentId: string): string {
    return `MATHAI ${intentId}`;
  }

  private extractIntentId(content: string): string | null {
    const match = content.match(/MATHAI\s+([A-Z0-9_-]+)/i);
    return match?.[1] ?? null;
  }

  private buildQrUrl(input: {
    amount_vnd: number;
    transfer_content: string;
  }): string | null {
    if (!this.config.qrTemplateUrl) return null;
    return this.config.qrTemplateUrl
      .replace("{bankCode}", encodeURIComponent(this.config.bankCode))
      .replace("{bankAccount}", encodeURIComponent(this.config.bankAccount))
      .replace("{amount}", encodeURIComponent(String(input.amount_vnd)))
      .replace("{content}", encodeURIComponent(input.transfer_content));
  }

  private firstString(...values: unknown[]): string | null {
    for (const value of values) {
      if (typeof value === "string" && value.trim().length > 0) return value.trim();
      if (typeof value === "number") return String(value);
    }
    return null;
  }

  private firstNumber(...values: unknown[]): number | null {
    for (const value of values) {
      if (typeof value === "number" && Number.isFinite(value)) return value;
      if (typeof value === "string") {
        const parsed = Number(value.replace(/[^0-9.-]/g, ""));
        if (Number.isFinite(parsed)) return parsed;
      }
    }
    return null;
  }
}

export interface SePayAdapterOptions extends Partial<SePayConfig> {}

export const createSePayAdapter = (
  options: SePayAdapterOptions = {},
): SePayAdapter =>
  new SePayAdapter({
    apiKey: options.apiKey ?? process.env.PAYMENT_SEPAY_API_KEY ?? "",
    webhookSecret:
      options.webhookSecret ?? process.env.PAYMENT_SEPAY_WEBHOOK_SECRET ?? "",
    bankAccount:
      options.bankAccount ?? process.env.PAYMENT_SEPAY_BANK_ACCOUNT ?? "",
    bankCode: options.bankCode ?? process.env.PAYMENT_SEPAY_BANK_CODE ?? "",
    accountName:
      options.accountName ?? process.env.PAYMENT_SEPAY_ACCOUNT_NAME ?? "",
    bankName: options.bankName ?? process.env.PAYMENT_SEPAY_BANK_NAME,
    qrTemplateUrl:
      options.qrTemplateUrl ?? process.env.PAYMENT_SEPAY_QR_TEMPLATE_URL,
  });

export const sepayAdapter = createSePayAdapter();
