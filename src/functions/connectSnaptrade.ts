import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from "@azure/functions";
import { ConnectSnaptradeRequestSchema } from "@portfolio/contracts";
import { integrationRepository } from "../cosmos/repositories/integrationRepository.js";
import { snapTradeClient } from "../integrations/snaptrade/client.js";
import { getAuthContext } from "../lib/auth.js";
import { getConfig } from "../lib/config.js";
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

  const config = getConfig();
  const redirectUrl =
    parsed.data.redirectUrl ??
    config.integrations.snaptrade.redirectUrl ??
    `${config.apiPublicBaseUrl}/api/integrations/snaptrade/callback`;

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
  const url = new URL(request.url);
  const status = url.searchParams.get("snaptrade") ?? "connected";

  return jsonResponse({
    status,
    message:
      "SnapTrade connection received. Click Sync now to fetch holdings.",
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
