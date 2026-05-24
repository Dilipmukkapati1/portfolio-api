import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from "@azure/functions";
import { integrationRepository } from "../cosmos/repositories/integrationRepository.js";
import { getSecret, secretNameForSimplefin } from "../lib/keyvault.js";
import { getAuthContext } from "../lib/auth.js";
import { jsonResponse } from "../lib/http.js";

async function integrationsStatusHandler(
  request: HttpRequest,
  _context: InvocationContext
): Promise<HttpResponseInit> {
  const auth = getAuthContext(request);
  const householdId = auth.householdId;

  const simplefinToken = await integrationRepository.getToken(
    householdId,
    "simplefin"
  );
  const simplefinSecret =
    (await getSecret(secretNameForSimplefin(householdId))) ??
    (await getSecret("simplefin-access-url"));
  const snaptradeToken = await integrationRepository.getToken(
    householdId,
    "snaptrade"
  );
  const simplefinSync = await integrationRepository.getSyncState(
    householdId,
    "simplefin"
  );

  return jsonResponse({
    simplefin: {
      connected: Boolean(simplefinToken || simplefinSecret),
      lastSyncedAt: simplefinSync?.lastSyncedAt,
      lastError: simplefinSync?.lastError,
    },
    snaptrade: {
      connected: Boolean(snaptradeToken),
    },
  });
}

app.http("integrationsStatus", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "integrations/status",
  handler: integrationsStatusHandler,
});
