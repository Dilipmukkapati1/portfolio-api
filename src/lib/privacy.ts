import type { HttpRequest, HttpResponseInit } from "@azure/functions";
import { SignJWT, jwtVerify } from "jose";
import { timingSafeEqual } from "node:crypto";
import { getAuthContext } from "./auth.js";
import { getConfig } from "./config.js";
import { errorResponse } from "./http.js";

const PRIVACY_TOKEN_TTL_SECONDS = 15 * 60;
const encoder = new TextEncoder();

export interface PrivacyContext {
  householdId: string;
  isUnlocked: boolean;
  expiresAt?: string;
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
}

function privacySecretKey(): Uint8Array {
  return encoder.encode(getConfig().privacyJwtSecret);
}

function readPrivacyToken(request: HttpRequest): string | undefined {
  return (
    request.headers.get("x-privacy-token") ??
    request.headers.get("X-Privacy-Token") ??
    undefined
  );
}

export function verifyPrivacyPassword(password: string): boolean {
  return safeEqual(password, getConfig().authPassword);
}

export async function issuePrivacyToken(householdId: string): Promise<{
  privacyToken: string;
  expiresAt: string;
}> {
  const expiresAt = new Date(
    Date.now() + PRIVACY_TOKEN_TTL_SECONDS * 1000
  ).toISOString();
  const privacyToken = await new SignJWT({ householdId })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(householdId)
    .setIssuedAt()
    .setExpirationTime(`${PRIVACY_TOKEN_TTL_SECONDS}s`)
    .sign(privacySecretKey());

  return { privacyToken, expiresAt };
}

export async function getPrivacyContext(
  request: HttpRequest,
  expectedHouseholdId = getAuthContext(request).householdId
): Promise<PrivacyContext> {
  const token = readPrivacyToken(request);
  if (!token) {
    return { householdId: expectedHouseholdId, isUnlocked: false };
  }

  try {
    const result = await jwtVerify(token, privacySecretKey());
    const expiresAt =
      typeof result.payload.exp === "number"
        ? new Date(result.payload.exp * 1000).toISOString()
        : undefined;
    // Session-wide unlock: valid token grants access to any household the user
    // manages (MVP single-user). Do not tie unlock to x-household-id at issue time.
    return {
      householdId: expectedHouseholdId,
      isUnlocked: true,
      expiresAt,
    };
  } catch {
    return { householdId: expectedHouseholdId, isUnlocked: false };
  }
}

export async function requirePrivacyUnlock(
  request: HttpRequest,
  householdId: string
): Promise<HttpResponseInit | null> {
  const ctx = await getPrivacyContext(request, householdId);
  return ctx.isUnlocked
    ? null
    : errorResponse("Privacy unlock required", 403);
}
