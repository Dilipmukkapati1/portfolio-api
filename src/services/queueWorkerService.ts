import {
  parseQueueMessage,
  type QueueMessage,
} from "@portfolio/contracts";
import { syncSimplefinForHousehold } from "../integrations/simplefin/syncService.js";
import { syncSnaptradeForHousehold } from "../integrations/snaptrade/syncService.js";
import { categorizeHouseholdTransactions } from "../integrations/manual/categorize.js";

export async function processQueueMessage(raw: string): Promise<void> {
  const message: QueueMessage = parseQueueMessage(raw);
  switch (message.type) {
    case "sync.simplefin":
      await syncSimplefinForHousehold(message.householdId);
      break;
    case "sync.snaptrade":
      await syncSnaptradeForHousehold(
        message.householdId,
        message.accountId
      );
      break;
    case "categorize.transactions":
      await categorizeHouseholdTransactions(message.householdId);
      break;
    case "recompute.networth": {
      const { recomputeNetWorth } = await import(
        "../integrations/simplefin/syncService.js"
      );
      await recomputeNetWorth(message.householdId);
      break;
    }
    case "run.batch.projection":
      console.log("Batch projection deferred to Phase 2+", message);
      break;
    case "recompute.taxProfile": {
      const { recomputeTaxProfile } = await import("./householdTaxService.js");
      const year =
        message.taxYear ?? new Date().getFullYear();
      await recomputeTaxProfile(message.householdId, year);
      break;
    }
    case "rollup.monthlySpend":
      console.log("Monthly spend rollup deferred to Phase 2+", message);
      break;
    default:
      console.warn("Unknown queue message", message);
  }
}
