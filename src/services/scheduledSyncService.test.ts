import { afterEach, describe, expect, it, vi } from "vitest";
import { runScheduledIntegrationSync } from "./scheduledSyncService.js";
import { householdRepository } from "../cosmos/repositories/householdRepository.js";
import {
  canSyncSimplefin,
  isSnaptradeConnected,
} from "../integrations/syncPolicy.js";
import { syncSimplefinForHousehold } from "../integrations/simplefin/syncService.js";
import { syncSnaptradeForHousehold } from "../integrations/snaptrade/syncService.js";

vi.mock("../cosmos/repositories/householdRepository.js", () => ({
  householdRepository: {
    list: vi.fn(),
  },
}));

vi.mock("../integrations/syncPolicy.js", () => ({
  canSyncSimplefin: vi.fn(),
  isSnaptradeConnected: vi.fn(),
}));

vi.mock("../integrations/simplefin/syncService.js", () => ({
  syncSimplefinForHousehold: vi.fn(),
}));

vi.mock("../integrations/snaptrade/syncService.js", () => ({
  syncSnaptradeForHousehold: vi.fn(),
}));

describe("runScheduledIntegrationSync", () => {
  afterEach(() => {
    delete process.env.SIMPLEFIN_SCHEDULED_SYNC_ENABLED;
    vi.clearAllMocks();
  });

  it("skips scheduled SimpleFIN sync when disabled", async () => {
    process.env.SIMPLEFIN_SCHEDULED_SYNC_ENABLED = "false";
    vi.mocked(householdRepository.list).mockResolvedValue([
      { householdId: "dev-household" } as never,
    ]);
    vi.mocked(canSyncSimplefin).mockResolvedValue(true);
    vi.mocked(isSnaptradeConnected).mockResolvedValue(false);

    await runScheduledIntegrationSync();

    expect(syncSimplefinForHousehold).not.toHaveBeenCalled();
    expect(canSyncSimplefin).not.toHaveBeenCalled();
  });

  it("runs scheduled SimpleFIN sync when enabled", async () => {
    process.env.SIMPLEFIN_SCHEDULED_SYNC_ENABLED = "true";
    vi.mocked(householdRepository.list).mockResolvedValue([
      { householdId: "dev-household" } as never,
    ]);
    vi.mocked(canSyncSimplefin).mockResolvedValue(true);
    vi.mocked(isSnaptradeConnected).mockResolvedValue(false);
    vi.mocked(syncSimplefinForHousehold).mockResolvedValue(undefined);

    await runScheduledIntegrationSync();

    expect(canSyncSimplefin).toHaveBeenCalledWith("dev-household");
    expect(syncSimplefinForHousehold).toHaveBeenCalledWith("dev-household");
  });

  it("still runs SnapTrade sync when SimpleFIN is disabled", async () => {
    process.env.SIMPLEFIN_SCHEDULED_SYNC_ENABLED = "false";
    vi.mocked(householdRepository.list).mockResolvedValue([
      { householdId: "dev-household" } as never,
    ]);
    vi.mocked(canSyncSimplefin).mockResolvedValue(true);
    vi.mocked(isSnaptradeConnected).mockResolvedValue(true);
    vi.mocked(syncSnaptradeForHousehold).mockResolvedValue(undefined);

    await runScheduledIntegrationSync();

    expect(syncSimplefinForHousehold).not.toHaveBeenCalled();
    expect(syncSnaptradeForHousehold).toHaveBeenCalledWith("dev-household");
  });
});
