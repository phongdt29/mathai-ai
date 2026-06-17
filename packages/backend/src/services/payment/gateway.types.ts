import type { PaymentGateway } from "../../models/payment-transaction.model";
import type {
  PaymentGatewayEnvironment,
  PaymentGatewayHealthStatus,
  PaymentGatewayMode,
  PaymentGatewaySandboxConfig,
} from "../../models/payment-gateway-config.model";

export type GatewaySelection = PaymentGateway | "auto";
export type GatewayPaymentResultType = "redirect" | "bank_transfer";

export interface GatewayCredentialFieldStatus {
  key: string;
  label: string;
  required: boolean;
  secret: boolean;
  env_key: string;
  sandbox_has_value: boolean;
  production_has_value: boolean;
  has_value: boolean;
  has_default: boolean;
}

export interface GatewayPublicStatus {
  gateway: PaymentGateway;
  display_name: string;
  enabled: boolean;
  priority: number;
  available: boolean;
  configured: boolean;
  missing_credentials: string[];
  fields: GatewayCredentialFieldStatus[];
  health: {
    status: PaymentGatewayHealthStatus;
    checked_at: string | null;
    message: string | null;
  };
}

export interface GatewayPublicConfig {
  mode: PaymentGatewayMode;
  environment: PaymentGatewayEnvironment;
  fallback_enabled: boolean;
  gateways: GatewayPublicStatus[];
}

export interface GatewayCredentialSet {
  gateway: PaymentGateway;
  environment: PaymentGatewayEnvironment;
  values: Record<string, string>;
  missing: string[];
}

export interface CreateGatewayPaymentParams {
  intent_id: string;
  amount_vnd: number;
  order_info: string;
  ip_addr?: string;
  created_at?: Date;
  expires_at: Date;
  sandbox_config?: PaymentGatewaySandboxConfig;
}

export interface BankTransferInstruction {
  amount_vnd: number;
  bank_code: string;
  bank_name: string;
  account_number: string;
  account_name: string;
  transfer_content: string;
  qr_url: string | null;
  expires_at: string;
}

export type GatewayPaymentResult =
  | {
      type: "redirect";
      gateway: PaymentGateway;
      redirect_url: string;
    }
  | {
      type: "bank_transfer";
      gateway: PaymentGateway;
      bank_transfer: BankTransferInstruction;
    };

export interface GatewayHealthResult {
  status: PaymentGatewayHealthStatus;
  message: string | null;
}

export interface GatewayWebhookVerification {
  valid: boolean;
  reason: string | null;
}

export interface GatewayWebhookEvent {
  intent_id: string | null;
  gateway_transaction_id: string | null;
  amount_vnd: number | null;
  status: "succeeded" | "failed" | "pending";
  raw: Record<string, unknown>;
}

export interface PaymentGatewayAdapter {
  gateway: PaymentGateway;
  createPayment(params: CreateGatewayPaymentParams): Promise<GatewayPaymentResult>;
  healthCheck(): Promise<GatewayHealthResult>;
}
