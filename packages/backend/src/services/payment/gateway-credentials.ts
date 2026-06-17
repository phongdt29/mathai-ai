import crypto from "node:crypto";
import type { PaymentGateway } from "../../models/payment-transaction.model";
import type {
  PaymentGatewayEnvironment,
  PaymentGatewaySandboxConfig,
  EncryptedGatewayCredential,
  PaymentGatewayStoredCredentials,
} from "../../models/payment-gateway-config.model";
import type { GatewayCredentialSet } from "./gateway.types";

export type GatewayEnv = Pick<NodeJS.ProcessEnv, string>;

export const REQUIRED_KEYS: Record<PaymentGateway, string[]> = {
  vnpay: ["tmnCode", "hashSecret", "paymentUrl", "returnUrl"],
  momo: ["partnerCode", "accessKey", "secretKey", "paymentUrl", "returnUrl", "ipnUrl"],
  sepay: ["apiKey", "webhookSecret", "bankAccount", "bankCode", "accountName"],
};

export const ENV_KEYS: Record<PaymentGateway, Record<string, string>> = {
  vnpay: {
    tmnCode: "PAYMENT_VNPAY_TMN_CODE",
    hashSecret: "PAYMENT_VNPAY_HASH_SECRET",
    paymentUrl: "PAYMENT_VNPAY_PAYMENT_URL",
    returnUrl: "PAYMENT_VNPAY_RETURN_URL",
  },
  momo: {
    partnerCode: "PAYMENT_MOMO_PARTNER_CODE",
    accessKey: "PAYMENT_MOMO_ACCESS_KEY",
    secretKey: "PAYMENT_MOMO_SECRET_KEY",
    paymentUrl: "PAYMENT_MOMO_PAYMENT_URL",
    returnUrl: "PAYMENT_MOMO_RETURN_URL",
    ipnUrl: "PAYMENT_MOMO_IPN_URL",
  },
  sepay: {
    apiKey: "PAYMENT_SEPAY_API_KEY",
    webhookSecret: "PAYMENT_SEPAY_WEBHOOK_SECRET",
    bankAccount: "PAYMENT_SEPAY_BANK_ACCOUNT",
    bankCode: "PAYMENT_SEPAY_BANK_CODE",
    accountName: "PAYMENT_SEPAY_ACCOUNT_NAME",
    qrTemplateUrl: "PAYMENT_SEPAY_QR_TEMPLATE_URL",
  },
};

export const SANDBOX_DEFAULTS: Partial<Record<PaymentGateway, Record<string, string>>> = {
  vnpay: {
    paymentUrl: "https://sandbox.vnpayment.vn/paymentv2/vpcpay.html",
    returnUrl: "http://localhost:3444/dashboard/billing/return?vnpay=1",
  },
  momo: {
    paymentUrl: "https://test-payment.momo.vn/v2/gateway/api/create",
    returnUrl: "http://localhost:3444/dashboard/billing/return?momo=1",
    ipnUrl: "http://localhost:3001/api/webhooks/momo",
  },
};

export interface GatewayCredentialFieldDefinition {
  key: string;
  label: string;
  required: boolean;
  secret: boolean;
  env_key: string;
  has_default: boolean;
}

const FIELD_LABELS: Record<string, string> = {
  tmnCode: "TMN Code",
  hashSecret: "Hash Secret",
  paymentUrl: "Payment URL",
  returnUrl: "Return URL",
  partnerCode: "Partner Code",
  accessKey: "Access Key",
  secretKey: "Secret Key",
  ipnUrl: "IPN URL",
  apiKey: "API Key",
  webhookSecret: "Webhook Secret",
  bankAccount: "Bank Account",
  bankCode: "Bank Code",
  accountName: "Account Name",
  qrTemplateUrl: "QR Template URL",
};

const SECRET_KEYS = new Set([
  "hashSecret",
  "secretKey",
  "accessKey",
  "apiKey",
  "webhookSecret",
]);

function normalizeEncryptionKey(key: string): Buffer {
  return crypto.createHash("sha256").update(key).digest();
}

function getEncryptionKey(explicitKey?: string): Buffer {
  return normalizeEncryptionKey(
    explicitKey ?? process.env.PAYMENT_CREDENTIAL_ENCRYPTION_KEY ?? "mathai-local-payment-credential-key",
  );
}

export function encryptCredentialValue(value: string, explicitKey?: string): EncryptedGatewayCredential {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getEncryptionKey(explicitKey), iv);
  const cipherText = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return {
    cipher_text: cipherText.toString("base64"),
    iv: iv.toString("base64"),
    auth_tag: cipher.getAuthTag().toString("base64"),
  };
}

export function decryptCredentialValue(credential: EncryptedGatewayCredential, explicitKey?: string): string | undefined {
  try {
    const decipher = crypto.createDecipheriv(
      "aes-256-gcm",
      getEncryptionKey(explicitKey),
      Buffer.from(credential.iv, "base64"),
    );
    decipher.setAuthTag(Buffer.from(credential.auth_tag, "base64"));
    return Buffer.concat([
      decipher.update(Buffer.from(credential.cipher_text, "base64")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    return undefined;
  }
}

function stringifyConfigValue(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim().length > 0) return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return undefined;
}

export class GatewayCredentialResolver {
  constructor(
    private readonly env: GatewayEnv = process.env,
    private readonly encryptionKey?: string,
  ) {}

  public resolve(input: {
    gateway: PaymentGateway;
    environment: PaymentGatewayEnvironment;
    sandboxConfig?: PaymentGatewaySandboxConfig;
    storedCredentials?: PaymentGatewayStoredCredentials;
  }): GatewayCredentialSet {
    const values: Record<string, string> = {};
    const required = REQUIRED_KEYS[input.gateway];
    const envMap = ENV_KEYS[input.gateway];
    const sandboxDefaults = SANDBOX_DEFAULTS[input.gateway] ?? {};

    for (const key of Object.keys(envMap)) {
      const envValue = stringifyConfigValue(this.env[envMap[key]]);
      const legacySandboxValue = stringifyConfigValue(input.sandboxConfig?.[key]);
      const storedValue = input.storedCredentials?.[input.environment]?.[key]
        ? decryptCredentialValue(input.storedCredentials[input.environment][key], this.encryptionKey)
        : undefined;
      const defaultValue = sandboxDefaults[key];

      const resolved =
        input.environment === "production"
          ? storedValue ?? envValue
          : storedValue ?? legacySandboxValue ?? envValue ?? defaultValue;

      if (resolved) values[key] = resolved;
    }

    const missing = required.filter((key) => !values[key]);

    return {
      gateway: input.gateway,
      environment: input.environment,
      values,
      missing,
    };
  }

  public requiredKeys(gateway: PaymentGateway): string[] {
    return [...REQUIRED_KEYS[gateway]];
  }

  public fieldDefinitions(gateway: PaymentGateway): GatewayCredentialFieldDefinition[] {
    const required = new Set(REQUIRED_KEYS[gateway]);
    const defaults = SANDBOX_DEFAULTS[gateway] ?? {};
    return Object.keys(ENV_KEYS[gateway]).map((key) => ({
      key,
      label: FIELD_LABELS[key] ?? key,
      required: required.has(key),
      secret: SECRET_KEYS.has(key),
      env_key: ENV_KEYS[gateway][key],
      has_default: defaults[key] !== undefined,
    }));
  }

  public encryptValues(values: Record<string, unknown>): Record<string, EncryptedGatewayCredential> {
    const encrypted: Record<string, EncryptedGatewayCredential> = {};
    for (const [key, value] of Object.entries(values)) {
      const normalized = stringifyConfigValue(value);
      if (normalized) encrypted[key] = encryptCredentialValue(normalized, this.encryptionKey);
    }
    return encrypted;
  }
}


export const gatewayCredentialResolver = new GatewayCredentialResolver();
