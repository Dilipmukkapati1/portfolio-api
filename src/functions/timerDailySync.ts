import { app, type InvocationContext } from "@azure/functions";
import { runScheduledIntegrationSync } from "../services/scheduledSyncService.js";

async function timerDailySyncHandler(
  _timer: unknown,
  context: InvocationContext
): Promise<void> {
  context.log("Daily integration sync at 7:00 AM");
  await runScheduledIntegrationSync();
}

app.timer("timerDailySync", {
  schedule: "0 0 7 * * *",
  handler: timerDailySyncHandler,
});
