import { describe, expect, it, beforeEach } from "vitest";
import type { HttpRequest } from "@azure/functions";
import {
  getPrivacyContext,
  issuePrivacyToken,
  verifyPrivacyPassword,
} from "./privacy.js";

function mockRequest(headers: Record<string, string>): HttpRequest {
  return {
    headers: {
      get: (name: string) =>
        headers[name] ?? headers[name.toLowerCase()] ?? null,
    },
  } as HttpRequest;
}

describe("privacy", () => {
  beforeEach(() => {
    process.env.AUTH_PASSWORD = "test-password";
    process.env.PRIVACY_JWT_SECRET = "test-privacy-secret-key-32chars!!";
  });

  it("treats a valid token as unlocked for any household", async () => {
    const { privacyToken } = await issuePrivacyToken("household-a");
    const request = mockRequest({
      "x-privacy-token": privacyToken,
      "x-household-id": "household-b",
    });

    const ctx = await getPrivacyContext(request, "household-b");
    expect(ctx.isUnlocked).toBe(true);
    expect(ctx.householdId).toBe("household-b");
  });

  it("rejects invalid passwords", () => {
    expect(verifyPrivacyPassword("wrong")).toBe(false);
    expect(verifyPrivacyPassword("test-password")).toBe(true);
  });
});
