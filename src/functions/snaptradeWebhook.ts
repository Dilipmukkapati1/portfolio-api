import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from "@azure/functions";
import { integrationRepository } from "../cosmos/repositories/integrationRepository.js";
import {
  parseWebhookPayload,
  verifySnaptradeWebhookFromVault,
} from "../integrations/snaptrade/webhook.js";
import { jsonResponse, errorResponse } from "../lib/http.js";
import { enqueueMessage } from "../lib/queue.js";
import { getConfig } from "../lib/config.js";

async function snaptradeWebhookHandler(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  const rawBody = await request.text();
  const signature =
    request.headers.get("x-snaptrade-signature") ??
    request.headers.get("X-Snaptrade-Signature");

  const verified = await verifySnaptradeWebhookFromVault(rawBody, signature);
  if (!verified) {
    return errorResponse("Invalid webhook signature", 401);
  }

  const payload = parseWebhookPayload(rawBody);
  const eventId = payload.webhookId ?? `evt-${Date.now()}`;
  const { defaultHouseholdId } = getConfig();
  const householdId = defaultHouseholdId;

  const isNew = await integrationRepository.recordWebhookEvent(
    householdId,
    eventId,
    payload as Record<string, unknown>
  );
  if (!isNew) {
    return jsonResponse({ duplicate: true });
  }

  if (
    payload.eventType === "ACCOUNT_HOLDINGS_UPDATED" ||
    !payload.eventType
  ) {
    await enqueueMessage({
      type: "sync.snaptrade",
      householdId,
      accountId: payload.accountId,
    });
  }

  context.log("SnapTrade webhook processed", eventId);
  return jsonResponse({ received: true });
}

app.http("snaptradeWebhook", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "integrations/snaptrade/webhook",
  handler: snaptradeWebhookHandler,
});
