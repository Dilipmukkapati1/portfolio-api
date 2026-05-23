import type { HttpRequest } from "@azure/functions";
import { getConfig } from "./config.js";

export interface AuthContext {
  householdId: string;
  userId?: string;
}

/**
 * MVP auth: header `x-household-id` or default household.
 * Production: SWA Easy Auth session → Cosmos user mapping.
 */
export function getAuthContext(request: HttpRequest): AuthContext {
  const header =
    request.headers.get("x-household-id") ??
    request.headers.get("X-Household-Id");
  const { defaultHouseholdId } = getConfig();
  return {
    householdId: header ?? defaultHouseholdId,
    userId: request.headers.get("x-user-id") ?? undefined,
  };
}

export function requireHouseholdMatch(
  auth: AuthContext,
  householdId: string
): boolean {
  return auth.householdId === householdId;
}
