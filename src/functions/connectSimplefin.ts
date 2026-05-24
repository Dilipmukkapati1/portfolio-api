import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from "@azure/functions";
import { ConnectSimplefinRequestSchema } from "@portfolio/contracts";
import { integrationRepository } from "../cosmos/repositories/integrationRepository.js";
import { claimSetupToken } from "../integrations/simplefin/client.js";
import { getAuthContext } from "../lib/auth.js";
import { jsonResponse, errorResponse } from "../lib/http.js";
import { setSecret, secretNameForSimplefin } from "../lib/keyvault.js";
import { tryEnqueueMessage } from "../lib/queue.js";

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

    if (!stored) {
      return errorResponse(
        "SimpleFIN token was claimed but the access URL could not be saved. Configure Key Vault or use local dev storage.",
        500
      );
    }

    const now = new Date().toISOString();
    try {
      await integrationRepository.upsertToken({
        id: "simplefin",
        householdId: auth.householdId,
        provider: "simplefin",
        keyVaultSecretName: secretName,
        createdAt: now,
        updatedAt: now,
      });
    } catch (err) {
      console.warn("SimpleFIN integration metadata save failed:", err);
    }

    const syncQueued = await tryEnqueueMessage({
      type: "sync.simplefin",
      householdId: auth.householdId,
    });

    return jsonResponse({
      connected: true,
      secretStored: true,
      syncQueued,
      message: syncQueued
        ? "SimpleFIN connected. Initial sync queued."
        : "SimpleFIN connected. Click Sync now to fetch accounts (queue unavailable).",
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
