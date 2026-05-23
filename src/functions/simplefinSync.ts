import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from "@azure/functions";
import { getAuthContext } from "../lib/auth.js";
import { jsonResponse, errorResponse } from "../lib/http.js";
import { enqueueMessage } from "../lib/queue.js";
import { syncSimplefinForHousehold } from "../integrations/simplefin/syncService.js";
import { integrationRepository } from "../cosmos/repositories/integrationRepository.js";

const DAILY_LIMIT = 24;

async function checkRateLimit(householdId: string): Promise<boolean> {
  const state = await integrationRepository.getSyncState(
    householdId,
    "simplefin"
  );
  const today = new Date().toISOString().slice(0, 10);
  const lastDate = state?.lastSyncedAt?.slice(0, 10);
  const count =
    lastDate === today ? (state?.dailyRequestCount ?? 0) : 0;
  return count < DAILY_LIMIT;
}

async function simplefinSyncHttpHandler(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  const auth = getAuthContext(request);
  const syncNow = request.query.get("now") === "true";

  if (!(await checkRateLimit(auth.householdId))) {
    return errorResponse("SimpleFIN daily request limit (24) reached", 429);
  }

  if (syncNow) {
    try {
      const result = await syncSimplefinForHousehold(auth.householdId);
      return jsonResponse({ ...result, syncedAt: new Date().toISOString() });
    } catch (err) {
      return errorResponse(
        err instanceof Error ? err.message : "Sync failed",
        500
      );
    }
  }

  await enqueueMessage({
    type: "sync.simplefin",
    householdId: auth.householdId,
  });
  return jsonResponse({ queued: true });
}

async function simplefinSyncTimerHandler(
  _timer: unknown,
  context: InvocationContext
): Promise<void> {
  const householdId = process.env.DEFAULT_HOUSEHOLD_ID ?? "local-household";
  context.log(`SimpleFIN timer sync for ${householdId}`);
  try {
    await syncSimplefinForHousehold(householdId);
  } catch (err) {
    context.error("SimpleFIN timer sync failed", err);
  }
}

app.http("simplefinSync", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "integrations/simplefin/sync",
  handler: simplefinSyncHttpHandler,
});

app.timer("simplefinSyncTimer", {
  schedule: "0 0 6,18 * * *",
  handler: simplefinSyncTimerHandler,
});
