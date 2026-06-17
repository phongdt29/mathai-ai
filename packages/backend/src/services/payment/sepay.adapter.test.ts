import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as crypto from "node:crypto";

import { SePayAdapter, type SePayConfig } from "./sepay.adapter";

const TEST_SEPAY_CONFIG: SePayConfig = {
  apiKey: "sepay-api-key",
  webhookSecret: "sepay-webhook-secret",
  bankAccount: "123456789",
  bankCode: "VCB",
  bankName: "Vietcombank",
  accountName: "CONG TY MATHAI",
  qrTemplateUrl: "https://qr.example.test/{bankCode}/{bankAccount}?amount={amount}&content={content}",
};

describe("SePayAdapter", () => {
  it("creates bank transfer instructions with unique payment content", async () => {
    const adapter = new SePayAdapter(TEST_SEPAY_CONFIG);

    const result = await adapter.createPayment({
      intent_id: "01HXYZSEPAY",
      amount_vnd: 199000,
      order_info: "Thanh toan goi Premium - MathAI",
      expires_at: new Date("2026-06-07T06:00:00.000Z"),
    });

    assert.equal(result.type, "bank_transfer");
    assert.equal(result.gateway, "sepay");
    assert.equal(result.bank_transfer.transfer_content, "MATHAI 01HXYZSEPAY");
    assert.equal(result.bank_transfer.amount_vnd, 199000);
    assert.equal(result.bank_transfer.bank_code, "VCB");
    assert.ok(result.bank_transfer.qr_url?.includes("01HXYZSEPAY"));
  });

  it("verifies webhook using bearer API key", () => {
    const adapter = new SePayAdapter(TEST_SEPAY_CONFIG);

    const result = adapter.verifyWebhook("{}", {
      authorization: "Bearer sepay-api-key",
    });

    assert.equal(result.valid, true);
    assert.equal(result.reason, null);
  });

  it("verifies webhook using HMAC signature", () => {
    const adapter = new SePayAdapter(TEST_SEPAY_CONFIG);
    const rawBody = JSON.stringify({ content: "MATHAI 01HXYZSEPAY", amount: 199000 });
    const signature = crypto
      .createHmac("sha256", TEST_SEPAY_CONFIG.webhookSecret)
      .update(rawBody)
      .digest("hex");

    const result = adapter.verifyWebhook(rawBody, {
      "x-sepay-signature": signature,
    });

    assert.equal(result.valid, true);
  });

  it("maps webhook payload to internal payment event", () => {
    const adapter = new SePayAdapter(TEST_SEPAY_CONFIG);

    const event = adapter.mapWebhook({
      id: "SP123",
      amount: 199000,
      content: "Thanh toan MATHAI 01HXYZSEPAY",
    });

    assert.equal(event.intent_id, "01HXYZSEPAY");
    assert.equal(event.gateway_transaction_id, "SP123");
    assert.equal(event.amount_vnd, 199000);
    assert.equal(event.status, "succeeded");
  });
});
