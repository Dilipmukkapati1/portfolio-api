import { integrationRepository } from "../cosmos/repositories/integrationRepository.js";
import { getSecret, secretNameForSimplefin } from "../lib/keyvault.js";

export const SIMPLEFIN_DAILY_LIMIT = 24;

export function simplefinRequestsRemaining(
  lastSyncedAt: string | undefined,
  dailyRequestCount: number | undefined,
  alreadyUsedThisRun = 0
): number {
  const today = new Date().toISOString().slice(0, 10);
  const lastDate = lastSyncedAt?.slice(0, 10);
  const count = lastDate === today ? (dailyRequestCount ?? 0) : 0;
  return Math.max(0, SIMPLEFIN_DAILY_LIMIT - count - alreadyUsedThisRun);
}

export async function isSimplefinConnected(
  householdId: string
): Promise<boolean> {
  const token = await integrationRepository.getToken(householdId, "simplefin");
  const secret =
    (await getSecret(secretNameForSimplefin(householdId))) ??
    (await getSecret("simplefin-access-url"));
  return Boolean(token || secret);
}

export async function canSyncSimplefin(householdId: string): Promise<boolean> {
  if (!(await isSimplefinConnected(householdId))) return false;

  const state = await integrationRepository.getSyncState(
    householdId,
    "simplefin"
  );
  const today = new Date().toISOString().slice(0, 10);
  const lastDate = state?.lastSyncedAt?.slice(0, 10);
  const count =
    lastDate === today ? (state?.dailyRequestCount ?? 0) : 0;
  return count < SIMPLEFIN_DAILY_LIMIT;
}

export async function isSnaptradeConnected(
  householdId: string
): Promise<boolean> {
  const token = await integrationRepository.getToken(householdId, "snaptrade");
  if (!token?.keyVaultSecretName) return false;
  const userSecret = await getSecret(token.keyVaultSecretName);
  return Boolean(userSecret);
}
