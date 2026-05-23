import { app, type InvocationContext } from "@azure/functions";
import { enqueueMessage } from "../lib/queue.js";
import { getConfig } from "../lib/config.js";

async function timerNightlyHandler(
  _timer: unknown,
  context: InvocationContext
): Promise<void> {
  const { defaultHouseholdId } = getConfig();
  context.log(`Nightly reconcile for ${defaultHouseholdId}`);

  await enqueueMessage({
    type: "categorize.transactions",
    householdId: defaultHouseholdId,
  });
  await enqueueMessage({
    type: "recompute.networth",
    householdId: defaultHouseholdId,
  });
}

app.timer("timerNightly", {
  schedule: "0 0 7 * * *",
  handler: timerNightlyHandler,
});
