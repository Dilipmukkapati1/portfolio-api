import { householdRepository } from "../cosmos/repositories/householdRepository.js";
import {
  canSyncSimplefin,
  isSnaptradeConnected,
} from "../integrations/syncPolicy.js";
import { syncSimplefinForHousehold } from "../integrations/simplefin/syncService.js";
import { syncSnaptradeForHousehold } from "../integrations/snaptrade/syncService.js";
import { getConfig } from "../lib/config.js";

export async function runScheduledIntegrationSync(): Promise<void> {
  const households = await householdRepository.list();
  const householdIds =
    households.length > 0
      ? households.map((household) => household.householdId)
      : [getConfig().defaultHouseholdId];

  for (const householdId of householdIds) {
    if (await canSyncSimplefin(householdId)) {
      try {
        await syncSimplefinForHousehold(householdId);
      } catch (err) {
        console.error(
          `Scheduled SimpleFIN sync failed for ${householdId}:`,
          err
        );
      }
    }

    if (await isSnaptradeConnected(householdId)) {
      try {
        await syncSnaptradeForHousehold(householdId);
      } catch (err) {
        console.error(
          `Scheduled SnapTrade sync failed for ${householdId}:`,
          err
        );
      }
    }
  }
}
