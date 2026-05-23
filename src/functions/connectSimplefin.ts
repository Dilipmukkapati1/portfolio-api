import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from "@azure/functions";
import { ConnectSimplefinRequestSchema } from "@portfolio/contracts";
import { integrationRepository } from "../cosmos/repositories/integrationRepository.js";
import { claimSetupToken } from "../integrations/simplefin/client.js";
import { getAuthContext } from "../lib/auth.js";
import { jsonResponse, errorResponse } from "../lib/http.js";
import { setSecret, secretNameForSimplefin } from "../lib/keyvault.js";
import { enqueueMessage } from "../lib/queue.js";

async function connectSimplefinHandler(
  request: HttpRequest,
  _context: InvocationContext
): Promise<HttpResponseInit> {
  const auth = getAuthContext(request);
  const body = await request.json();
  const parsed = ConnectSimplefinRequestSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(parsed.error.message, 400);
  }

  try {
    const accessUrl = await claimSetupToken(parsed.data.setupToken);
    const secretName = secretNameForSimplefin(auth.householdId);
    const stored = await setSecret(secretName, accessUrl);

    const now = new Date().toISOString();
    await integrationRepository.upsertToken({
      id: "simplefin",
      householdId: auth.householdId,
      provider: "simplefin",
      keyVaultSecretName: secretName,
      createdAt: now,
      updatedAt: now,
    });

    await enqueueMessage({
      type: "sync.simplefin",
      householdId: auth.householdId,
    });

    return jsonResponse({
      connected: true,
      secretStored: stored,
      message: stored
        ? "SimpleFIN connected. Initial sync queued."
        : "SimpleFIN claimed. Set SIMPLEFIN_ACCESS_URL locally or Key Vault for sync.",
    });
  } catch (err) {
    return errorResponse(
      err instanceof Error ? err.message : "Failed to connect SimpleFIN",
      400
    );
  }
}

app.http("connectSimplefin", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "integrations/simplefin/connect",
  handler: connectSimplefinHandler,
});
