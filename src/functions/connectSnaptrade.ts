import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from "@azure/functions";
import { ConnectSnaptradeRequestSchema } from "@portfolio/contracts";
import { integrationRepository } from "../cosmos/repositories/integrationRepository.js";
import { snapTradeClient } from "../integrations/snaptrade/client.js";
import { getAuthContext } from "../lib/auth.js";
import { jsonResponse, errorResponse } from "../lib/http.js";
import { setSecret } from "../lib/keyvault.js";

async function connectSnaptradeHandler(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  const auth = getAuthContext(request);
  const body = request.method === "POST" ? await request.json() : {};
  const parsed = ConnectSnaptradeRequestSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(parsed.error.message, 400);
  }

  const userId = `pf-${auth.householdId}`;
  const { userSecret } = await snapTradeClient.registerUser(userId);
  const secretName = `snaptrade-user-secret-${auth.householdId}`;
  await setSecret(secretName, userSecret);

  const redirectUrl =
    parsed.data.redirectUrl ??
    `${request.url.split("/api")[0]}/api/integrations/snaptrade/callback`;

  const loginLink = await snapTradeClient.getLoginLink(
    userId,
    userSecret,
    redirectUrl
  );

  const now = new Date().toISOString();
  await integrationRepository.upsertToken({
    id: "snaptrade",
    householdId: auth.householdId,
    provider: "snaptrade",
    keyVaultSecretName: secretName,
    externalUserId: userId,
    createdAt: now,
    updatedAt: now,
  });

  return jsonResponse({ redirectUri: loginLink, userId });
}

async function snaptradeCallbackHandler(
  request: HttpRequest,
  _context: InvocationContext
): Promise<HttpResponseInit> {
  const auth = getAuthContext(request);
  const url = new URL(request.url);
  const status = url.searchParams.get("snaptrade") ?? "connected";

  const { enqueueMessage } = await import("../lib/queue.js");
  await enqueueMessage({
    type: "sync.snaptrade",
    householdId: auth.householdId,
  });

  return jsonResponse({
    status,
    message: "SnapTrade connection received. Sync queued.",
  });
}

app.http("connectSnaptrade", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "integrations/snaptrade/connect",
  handler: connectSnaptradeHandler,
});

app.http("snaptradeCallback", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "integrations/snaptrade/callback",
  handler: snaptradeCallbackHandler,
});
