import type { PaymentGateway } from "../../models/payment-transaction.model";
import {
  createDefaultGatewayConfig,
  paymentGatewayConfigRepository,
  type IPaymentGatewayConfig,
  type PaymentGatewayConfigItem,
  type PaymentGatewayConfigRepository,
  type PaymentGatewayEnvironment,
} from "../../models/payment-gateway-config.model";
import {
  GatewayCredentialResolver,
  gatewayCredentialResolver,
} from "./gateway-credentials";
import type {
  GatewayCredentialSet,
  GatewayPublicConfig,
  GatewayPublicStatus,
  GatewaySelection,
} from "./gateway.types";

export interface PaymentGatewayRegistryDependencies {
  configRepo?: Pick<PaymentGatewayConfigRepository, "getOrDefault" | "upsertActive">;
  credentialResolver?: GatewayCredentialResolver;
}

export class PaymentGatewayRegistry {
  private readonly configRepo: Pick<
    PaymentGatewayConfigRepository,
    "getOrDefault" | "upsertActive"
  >;
  private readonly credentialResolver: GatewayCredentialResolver;

  constructor(dependencies: PaymentGatewayRegistryDependencies = {}) {
    this.configRepo = dependencies.configRepo ?? paymentGatewayConfigRepository;
    this.credentialResolver = dependencies.credentialResolver ?? gatewayCredentialResolver;
  }

  public async getConfig(): Promise<
    IPaymentGatewayConfig | ReturnType<typeof createDefaultGatewayConfig>
  > {
    return this.configRepo.getOrDefault();
  }

  public async getPublicConfig(): Promise<GatewayPublicConfig> {
    const config = await this.getConfig();
    return {
      mode: config.mode,
      environment: config.environment,
      fallback_enabled: config.fallback_enabled,
      gateways: this.normalizeGatewayItems(config.gateways).map((item) =>
        this.toPublicStatus(item, config.environment),
      ),
    };
  }

  public async getAvailableGateways(): Promise<GatewayPublicStatus[]> {
    const publicConfig = await this.getPublicConfig();
    return publicConfig.gateways.filter(
      (gateway) => gateway.enabled && gateway.available,
    );
  }

  public async selectGateway(
    selection: GatewaySelection | undefined,
  ): Promise<PaymentGateway[]> {
    const config = await this.getConfig();
    const items = this.normalizeGatewayItems(config.gateways).filter(
      (item) => item.enabled,
    );

    if (selection && selection !== "auto") {
      const item = items.find((candidate) => candidate.gateway === selection);
      if (!item) {
        throw new PaymentGatewayRegistryError(
          "GATEWAY_DISABLED",
          `Cổng thanh toán '${selection}' chưa được bật`,
        );
      }
      const credentials = this.resolveCredentials(item, config.environment);
      if (credentials.missing.length > 0) {
        throw new PaymentGatewayRegistryError(
          "GATEWAY_NOT_CONFIGURED",
          `Cổng thanh toán '${selection}' chưa được cấu hình`,
          { missing_credentials: credentials.missing },
        );
      }
      return [selection];
    }

    const available = items
      .map((item) => ({ item, credentials: this.resolveCredentials(item, config.environment) }))
      .filter(({ credentials }) => credentials.missing.length === 0)
      .sort((a, b) => a.item.priority - b.item.priority)
      .map(({ item }) => item.gateway);

    if (available.length === 0) {
      throw new PaymentGatewayRegistryError(
        "PAYMENT_GATEWAYS_UNAVAILABLE",
        "Không có cổng thanh toán khả dụng",
      );
    }

    if (config.mode === "auto_priority" && config.fallback_enabled) {
      return available;
    }

    return [available[0]];
  }

  public async resolveGatewayCredentials(
    gateway: PaymentGateway,
  ): Promise<GatewayCredentialSet> {
    const config = await this.getConfig();
    const item = this.normalizeGatewayItems(config.gateways).find(
      (candidate) => candidate.gateway === gateway,
    );
    if (!item) {
      throw new PaymentGatewayRegistryError(
        "UNSUPPORTED_GATEWAY",
        `Cổng thanh toán '${gateway}' không được hỗ trợ`,
      );
    }
    return this.resolveCredentials(item, config.environment);
  }

  public async updateConfig(
    data: Partial<IPaymentGatewayConfig>,
  ): Promise<GatewayPublicConfig> {
    await this.configRepo.upsertActive(data);
    return this.getPublicConfig();
  }

  public async updateGatewayCredentials(
    gateway: PaymentGateway,
    environment: PaymentGatewayEnvironment,
    values: Record<string, unknown>,
  ): Promise<GatewayPublicConfig> {
    const config = await this.getConfig();
    const items = this.normalizeGatewayItems(config.gateways);
    const fieldKeys = new Set(this.credentialResolver.fieldDefinitions(gateway).map((field) => field.key));
    const filteredValues = Object.fromEntries(
      Object.entries(values).filter(([key]) => fieldKeys.has(key)),
    );
    const encryptedValues = this.credentialResolver.encryptValues(filteredValues);

    const nextGateways = items.map((item) => {
      if (item.gateway !== gateway) return item;
      const credentials = {
        sandbox: { ...(item.credentials?.sandbox ?? {}) },
        production: { ...(item.credentials?.production ?? {}) },
      };
      credentials[environment] = {
        ...credentials[environment],
        ...encryptedValues,
      };
      return { ...item, credentials };
    });

    await this.configRepo.upsertActive({ gateways: nextGateways } as Partial<IPaymentGatewayConfig>);
    return this.getPublicConfig();
  }

  private normalizeGatewayItems(
    items: PaymentGatewayConfigItem[],
  ): PaymentGatewayConfigItem[] {
    const defaults = createDefaultGatewayConfig().gateways;
    const byGateway = new Map<PaymentGateway, PaymentGatewayConfigItem>();

    for (const item of defaults) byGateway.set(item.gateway, item);
    for (const item of items ?? []) {
      byGateway.set(item.gateway, {
        ...byGateway.get(item.gateway),
        ...item,
        sandbox_config: { ...(item.sandbox_config ?? {}) },
        credentials: {
          sandbox: { ...(item.credentials?.sandbox ?? {}) },
          production: { ...(item.credentials?.production ?? {}) },
        },
        last_health_check: item.last_health_check ?? {
          status: "unknown",
          checked_at: null,
          message: null,
        },
      } as PaymentGatewayConfigItem);
    }

    return [...byGateway.values()].sort((a, b) => a.priority - b.priority);
  }

  private resolveCredentials(
    item: PaymentGatewayConfigItem,
    environment: IPaymentGatewayConfig["environment"],
  ): GatewayCredentialSet {
    return this.credentialResolver.resolve({
      gateway: item.gateway,
      environment,
      sandboxConfig: item.sandbox_config,
      storedCredentials: item.credentials,
    });
  }

  private toPublicStatus(
    item: PaymentGatewayConfigItem,
    environment: IPaymentGatewayConfig["environment"],
  ): GatewayPublicStatus {
    const credentials = this.resolveCredentials(item, environment);
    const sandboxCredentials = this.resolveCredentials(item, "sandbox");
    const productionCredentials = this.resolveCredentials(item, "production");
    const fields = this.credentialResolver.fieldDefinitions(item.gateway).map((field) => ({
      ...field,
      sandbox_has_value: !sandboxCredentials.missing.includes(field.key),
      production_has_value: !productionCredentials.missing.includes(field.key),
      has_value: !credentials.missing.includes(field.key),
    }));
    return {
      gateway: item.gateway,
      display_name: item.display_name,
      enabled: item.enabled,
      priority: item.priority,
      configured: credentials.missing.length === 0,
      available: item.enabled && credentials.missing.length === 0,
      missing_credentials: credentials.missing,
      fields,
      health: {
        status: item.last_health_check?.status ?? "unknown",
        checked_at: item.last_health_check?.checked_at
          ? item.last_health_check.checked_at.toISOString()
          : null,
        message: item.last_health_check?.message ?? null,
      },
    };
  }
}

export class PaymentGatewayRegistryError extends Error {
  public readonly code: string;
  public readonly details?: Record<string, unknown>;

  constructor(code: string, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "PaymentGatewayRegistryError";
    this.code = code;
    this.details = details;
  }
}

export const paymentGatewayRegistry = new PaymentGatewayRegistry();
