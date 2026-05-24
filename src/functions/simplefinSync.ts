import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from "@azure/functions";
import { getAuthContext } from "../lib/auth.js";
import { jsonResponse, errorResponse } from "../lib/http.js";
import { syncSimplefinForHousehold } from "../integrations/simplefin/syncService.js";
import { canSyncSimplefin } from "../integrations/syncPolicy.js";

async function simplefinSyncHttpHandler(
  request: HttpRequest,
  _context: InvocationContext
): Promise<HttpResponseInit> {
  const auth = getAuthContext(request);

  if (!(await canSyncSimplefin(auth.householdId))) {
    return errorResponse("SimpleFIN daily request limit (24) reached", 429);
  }

  try {
    const result = await syncSimplefinForHousehold(auth.householdId);
    return jsonResponse({
      ...result,
      accountsSynced: result.accounts,
      message: result.warnings?.length
        ? `Synced ${result.accounts} account(s). ${result.warnings.join("; ")}`
        : `Synced ${result.accounts} account(s).`,
      syncedAt: new Date().toISOString(),
    });
  } catch (err) {
    return errorResponse(
      err instanceof Error ? err.message : "Sync failed",
      500
    );
  }
}

app.http("simplefinSync", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "integrations/simplefin/sync",
  handler: simplefinSyncHttpHandler,
});
