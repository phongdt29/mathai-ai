import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { createDefaultGatewayConfig } from "../../models/payment-gateway-config.model";
import { GatewayCredentialResolver } from "./gateway-credentials";
import {
  PaymentGatewayRegistry,
  PaymentGatewayRegistryError,
} from "./payment-gateway.registry";

function createRegistry(config = createDefaultGatewayConfig(), env: Record<string, string> = {}) {
  return new PaymentGatewayRegistry({
    configRepo: {
      getOrDefault: async () => config,
      upsertActive: async () => config as any,
    },
    credentialResolver: new GatewayCredentialResolver(env),
  });
}

describe("PaymentGatewayRegistry", () => {
  it("returns default public config without exposing credential values", async () => {
    const registry = createRegistry(createDefaultGatewayConfig(), {
      PAYMENT_VNPAY_TMN_CODE: "tmn",
      PAYMENT_VNPAY_HASH_SECRET: "super-private-value",
    });

    const config = await registry.getPublicConfig();

    assert.equal(config.mode, "user_select");
    assert.equal(config.environment, "sandbox");
    const vnpay = config.gateways.find((gateway) => gateway.gateway === "vnpay");
    assert.ok(vnpay);
    assert.equal(vnpay.enabled, true);
    assert.equal(vnpay.configured, true);
    assert.deepEqual(vnpay.missing_credentials, []);
    assert.equal(JSON.stringify(config).includes("super-private-value"), false);
  });

  it("filters available gateways by enabled and configured state", async () => {
    const base = createDefaultGatewayConfig();
    base.gateways = base.gateways.map((gateway) =>
      gateway.gateway === "sepay"
        ? {
            ...gateway,
            enabled: true,
            sandbox_config: {
              apiKey: "sepay-key",
              webhookSecret: "sepay-secret",
              bankAccount: "123456789",
              bankCode: "VCB",
              accountName: "MATHAI",
            },
          }
        : gateway,
    );
    const registry = createRegistry(base, {
      PAYMENT_VNPAY_TMN_CODE: "tmn",
      PAYMENT_VNPAY_HASH_SECRET: "super-private-value",
    });

    const available = await registry.getAvailableGateways();

    assert.deepEqual(
      available.map((gateway) => gateway.gateway),
      ["vnpay", "sepay"],
    );
  });

  it("uses priority order for auto selection when fallback is enabled", async () => {
    const base = createDefaultGatewayConfig();
    base.mode = "auto_priority";
    base.fallback_enabled = true;
    base.gateways = base.gateways.map((gateway) => {
      if (gateway.gateway === "vnpay") return { ...gateway, priority: 2 };
      if (gateway.gateway === "sepay") {
        return {
          ...gateway,
          enabled: true,
          priority: 1,
          sandbox_config: {
            apiKey: "sepay-key",
            webhookSecret: "sepay-secret",
            bankAccount: "123456789",
            bankCode: "VCB",
            accountName: "MATHAI",
          },
        };
      }
      return gateway;
    });
    const registry = createRegistry(base, {
      PAYMENT_VNPAY_TMN_CODE: "tmn",
      PAYMENT_VNPAY_HASH_SECRET: "super-private-value",
    });

    const selected = await registry.selectGateway("auto");

    assert.deepEqual(selected, ["sepay", "vnpay"]);
  });

  it("selects only the first available gateway when fallback is disabled", async () => {
    const base = createDefaultGatewayConfig();
    base.mode = "auto_priority";
    base.fallback_enabled = false;
    base.gateways = base.gateways.map((gateway) =>
      gateway.gateway === "sepay"
        ? {
            ...gateway,
            enabled: true,
            priority: 1,
            sandbox_config: {
              apiKey: "sepay-key",
              webhookSecret: "sepay-secret",
              bankAccount: "123456789",
              bankCode: "VCB",
              accountName: "MATHAI",
            },
          }
        : { ...gateway, priority: 2 },
    );
    const registry = createRegistry(base, {
      PAYMENT_VNPAY_TMN_CODE: "tmn",
      PAYMENT_VNPAY_HASH_SECRET: "super-private-value",
    });

    const selected = await registry.selectGateway(undefined);

    assert.deepEqual(selected, ["sepay"]);
  });

  it("throws when a manually selected gateway is disabled", async () => {
    const registry = createRegistry();

    await assert.rejects(
      () => registry.selectGateway("sepay"),
      (error: unknown) =>
        error instanceof PaymentGatewayRegistryError &&
        error.code === "GATEWAY_DISABLED",
    );
  });

  it("uses production env only for configured status", async () => {
    const base = createDefaultGatewayConfig();
    base.environment = "production";
    base.gateways = base.gateways.map((gateway) =>
      gateway.gateway === "vnpay"
        ? {
            ...gateway,
            sandbox_config: {
              tmnCode: "sandbox-tmn",
              hashSecret: "sandbox-secret",
              paymentUrl: "https://sandbox.example.test",
              returnUrl: "https://sandbox.example.test/return",
            },
          }
        : gateway,
    );
    const registry = createRegistry(base, {
      PAYMENT_VNPAY_TMN_CODE: "prod-tmn",
      PAYMENT_VNPAY_HASH_SECRET: "prod-secret",
      PAYMENT_VNPAY_PAYMENT_URL: "https://pay.example.vn",
      PAYMENT_VNPAY_RETURN_URL: "https://app.example.vn/billing/return/vnpay",
    });

    const config = await registry.getPublicConfig();
    const vnpay = config.gateways.find((gateway) => gateway.gateway === "vnpay");

    assert.ok(vnpay);
    assert.equal(vnpay.configured, true);
    assert.equal(JSON.stringify(config).includes("prod-secret"), false);
    assert.equal(JSON.stringify(config).includes("sandbox-secret"), false);
  });

  it("stores gateway credentials encrypted and exposes only metadata", async () => {
    const persisted: { value: any } = { value: createDefaultGatewayConfig() };
    const registry = new PaymentGatewayRegistry({
      configRepo: {
        getOrDefault: async () => persisted.value,
        upsertActive: async (data: any) => {
          persisted.value = { ...persisted.value, ...data };
          return persisted.value;
        },
      },
      credentialResolver: new GatewayCredentialResolver({}, "test-encryption-key"),
    });

    await registry.updateGatewayCredentials("vnpay", "production", {
      tmnCode: "prod-tmn",
      hashSecret: "prod-secret",
      paymentUrl: "https://pay.example.vn",
      returnUrl: "https://app.example.vn/return",
    });

    const rawConfig = JSON.stringify(persisted.value);
    assert.equal(rawConfig.includes("prod-secret"), false);
    assert.equal(rawConfig.includes("prod-tmn"), false);

    persisted.value.environment = "production";
    const publicConfig = await registry.getPublicConfig();
    const vnpay = publicConfig.gateways.find((gateway) => gateway.gateway === "vnpay");

    assert.ok(vnpay);
    assert.equal(vnpay.configured, true);
    assert.deepEqual(vnpay.missing_credentials, []);
    assert.equal(vnpay.fields.find((field) => field.key === "hashSecret")?.has_value, true);
    assert.equal(JSON.stringify(publicConfig).includes("prod-secret"), false);
  });

});
