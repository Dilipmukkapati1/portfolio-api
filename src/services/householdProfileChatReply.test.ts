import { describe, expect, it, vi } from "vitest";
import { buildHouseholdProfileChatReply } from "./householdProfileChatReply.js";

vi.mock("../lib/openrouter.js", () => ({
  OpenRouterNotConfiguredError: class OpenRouterNotConfiguredError extends Error {
    code = "OPENROUTER_NOT_CONFIGURED";
  },
  openRouterChatComplete: vi.fn(),
}));

import { openRouterChatComplete } from "../lib/openrouter.js";

describe("buildHouseholdProfileChatReply", () => {
  it("uses template when auto-save was not attempted", async () => {
    const reply = await buildHouseholdProfileChatReply("hello", {
      enabled: false,
      attempted: false,
      applied: false,
      changes: [],
    });
    expect(reply).toContain("Auto-save is off");
  });

  it("uses template when LLM is not configured", async () => {
    const { OpenRouterNotConfiguredError } = await import("../lib/openrouter.js");
    vi.mocked(openRouterChatComplete).mockRejectedValueOnce(
      new OpenRouterNotConfiguredError()
    );

    const reply = await buildHouseholdProfileChatReply("reshma bonus is 7k", {
      enabled: true,
      attempted: true,
      applied: true,
      changes: [
        {
          field: "member:Reshma:income:bonus",
          label: "Reshma bonus",
          after: "$7,000",
        },
      ],
    });

    expect(reply).toContain("Updated your household profile");
    expect(reply).toContain("Reshma bonus");
  });

  it("returns LLM reply when configured", async () => {
    vi.mocked(openRouterChatComplete).mockResolvedValueOnce({
      content: "Got it — I saved Reshma's $7,000 bonus.",
      model: "test",
    });

    const reply = await buildHouseholdProfileChatReply("reshma bonus is 7k", {
      enabled: true,
      attempted: true,
      applied: true,
      changes: [
        {
          field: "member:Reshma:income:bonus",
          label: "Reshma bonus",
          after: "$7,000",
        },
      ],
    });

    expect(reply).toBe("Got it — I saved Reshma's $7,000 bonus.");
  });
});
