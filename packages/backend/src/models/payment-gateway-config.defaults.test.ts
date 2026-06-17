/**
 * Spec test — Module 11: cổng thanh toán mặc định bật VNPAY + MoMo.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_GATEWAY_ITEMS,
} from "./payment-gateway-config.model";

describe("DEFAULT_GATEWAY_ITEMS", () => {
  it("VNPAY và MoMo đều enabled mặc định (đặc tả M11)", () => {
    const vnpay = DEFAULT_GATEWAY_ITEMS.find((g) => g.gateway === "vnpay");
    const momo = DEFAULT_GATEWAY_ITEMS.find((g) => g.gateway === "momo");
    assert.ok(vnpay, "phải có cấu hình vnpay");
    assert.ok(momo, "phải có cấu hình momo");
    assert.equal(vnpay.enabled, true);
    assert.equal(momo.enabled, true);
  });

  it("priority duy nhất và hợp lệ", () => {
    const priorities = DEFAULT_GATEWAY_ITEMS.map((g) => g.priority);
    assert.equal(new Set(priorities).size, priorities.length);
    for (const p of priorities) assert.ok(p >= 1);
  });
});
