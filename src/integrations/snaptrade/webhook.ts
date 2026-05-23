import { createHmac, timingSafeEqual } from "node:crypto";
import { getSecret } from "../../lib/keyvault.js";

export function verifySnaptradeWebhook(
  payload: string,
  signature: string | null,
  secret: string
): boolean {
  if (!signature) return false;
  const expected = createHmac("sha256", secret)
    .update(payload)
    .digest("hex");
  const sigBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (sigBuffer.length !== expectedBuffer.length) return false;
  return timingSafeEqual(sigBuffer, expectedBuffer);
}

export async function verifySnaptradeWebhookFromVault(
  payload: string,
  signature: string | null
): Promise<boolean> {
  const secret = await getSecret("snaptrade-webhook-secret");
  if (!secret) {
    // Dev: allow unsigned when secret not configured
    return process.env.NODE_ENV !== "production";
  }
  return verifySnaptradeWebhook(payload, signature, secret);
}

export interface SnaptradeWebhookPayload {
  webhookId?: string;
  eventType?: string;
  userId?: string;
  brokerageAuthorizationId?: string;
  accountId?: string;
}

export function parseWebhookPayload(body: string): SnaptradeWebhookPayload {
  return JSON.parse(body) as SnaptradeWebhookPayload;
}
