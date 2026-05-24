import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from "@azure/functions";
import { getAuthContext } from "../lib/auth.js";
import { jsonResponse, errorResponse } from "../lib/http.js";
import { syncSnaptradeForHousehold } from "../integrations/snaptrade/syncService.js";

async function snaptradeSyncHttpHandler(
  request: HttpRequest,
  _context: InvocationContext
): Promise<HttpResponseInit> {
  const auth = getAuthContext(request);

  try {
    const result = await syncSnaptradeForHousehold(auth.householdId);
    return jsonResponse({
      ...result,
      holdingsSynced: result.holdings,
      message: `Synced ${result.holdings} holding(s).`,
      syncedAt: new Date().toISOString(),
    });
  } catch (err) {
    return errorResponse(
      err instanceof Error ? err.message : "Sync failed",
      500
    );
  }
}

app.http("snaptradeSync", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "integrations/snaptrade/sync",
  handler: snaptradeSyncHttpHandler,
});
