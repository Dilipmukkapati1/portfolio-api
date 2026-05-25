import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from "@azure/functions";
import { getAuthContext } from "../lib/auth.js";
import { mapRequestError } from "../lib/errors.js";
import { jsonResponse, errorResponse } from "../lib/http.js";
import { syncSimplefinForHousehold } from "../integrations/simplefin/syncService.js";
import { executeWithStorageRetry } from "../lib/storageRetry.js";
import { getSimplefinSyncBlockReason } from "../integrations/syncPolicy.js";
import { getDataStore } from "../storage/index.js";
import { formatStorageSourceMap } from "../storage/layout.js";

async function simplefinSyncHttpHandler(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  const auth = getAuthContext(request);

  try {
    const store = await getDataStore();
    context.log(
      `[portfolio-api] SimpleFIN sync request storage sources: ${formatStorageSourceMap(store.sources)}`
    );

    const block = await getSimplefinSyncBlockReason(auth.householdId);
    if (block.blocked) {
      return errorResponse(block.message, block.status);
    }

    const result = await executeWithStorageRetry(() =>
      syncSimplefinForHousehold(auth.householdId)
    );

    return jsonResponse({
      ...result,
      accountsSynced: result.accounts,
      message: result.warnings?.length
        ? `Synced ${result.accounts} account(s). ${result.warnings.join("; ")}`
        : `Synced ${result.accounts} account(s).`,
      syncedAt: new Date().toISOString(),
    });
  } catch (err) {
    context.error("SimpleFIN sync failed", err);
    return mapRequestError(err);
  }
}

app.http("simplefinSync", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "integrations/simplefin/sync",
  handler: simplefinSyncHttpHandler,
});
