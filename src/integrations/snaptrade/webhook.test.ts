import { describe, it, expect } from "vitest";
import { verifySnaptradeWebhook } from "./webhook.js";
import { createHmac } from "node:crypto";

describe("verifySnaptradeWebhook", () => {
  it("verifies valid HMAC signature", () => {
    const secret = "test-secret";
    const payload = JSON.stringify({ eventType: "ACCOUNT_HOLDINGS_UPDATED" });
    const signature = createHmac("sha256", secret)
      .update(payload)
      .digest("hex");
    expect(verifySnaptradeWebhook(payload, signature, secret)).toBe(true);
  });

  it("rejects invalid signature", () => {
    expect(
      verifySnaptradeWebhook("{}", "invalid", "secret")
    ).toBe(false);
  });
});
