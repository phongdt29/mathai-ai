import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  PushService,
  PushProviderError,
  type PushServiceOptions,
} from "./push.service";

const baseOptions: PushServiceOptions = {
  provider: "console",
  vapidPublicKey: "",
  vapidPrivateKey: "",
  vapidContact: "mailto:test@mathai.vn",
};

const sub = (endpoint: string) =>
  ({
    endpoint,
    keys: { p256dh: "p", auth: "a" },
    is_active: true,
  }) as never;

describe("PushService", () => {
  it("provider console → trả về tất cả endpoint là đã gửi, không có invalid", async () => {
    const service = new PushService(baseOptions);
    const result = await service.sendToSubscriptions(
      [sub("https://push/1"), sub("https://push/2")],
      { title: "Hi", body: "Body" },
    );
    assert.deepEqual(result.sent, ["https://push/1", "https://push/2"]);
    assert.deepEqual(result.invalid_tokens, []);
  });

  it("danh sách rỗng → không gửi gì", async () => {
    const service = new PushService(baseOptions);
    const result = await service.sendToSubscriptions([], { title: "x", body: "y" });
    assert.deepEqual(result, { sent: [], invalid_tokens: [] });
  });

  it("provider không hợp lệ → ném PushProviderError", async () => {
    const service = new PushService({
      ...baseOptions,
      provider: "unknown" as never,
    });
    await assert.rejects(
      () => service.sendToSubscriptions([sub("https://push/1")], { title: "a", body: "b" }),
      PushProviderError,
    );
  });

  it("getVapidPublicKey trả đúng key cấu hình", () => {
    const service = new PushService({ ...baseOptions, vapidPublicKey: "PUBKEY" });
    assert.equal(service.getVapidPublicKey(), "PUBKEY");
  });
});
