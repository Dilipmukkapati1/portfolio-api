import type {
  SimpleFinAccount,
  SimpleFinConnection,
  SimpleFinHolding,
} from "./client.js";

export function slugifySimpleFinSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_|_$/g, "") || "unknown";
}

/** Stable document id; unique per connection + account. */
export function simpleFinAccountDocumentId(
  connId: string,
  accountId: string
): string {
  return `sf-${slugifySimpleFinSegment(connId)}-${slugifySimpleFinSegment(accountId)}`;
}

/** Stored on Account.externalId for upsert matching. */
export function simpleFinExternalId(connId: string, accountId: string): string {
  return `${connId}:${accountId}`;
}

export function parseSimpleFinExternalId(
  externalId: string
): { connId: string; accountId: string } | null {
  const idx = externalId.indexOf(":");
  if (idx <= 0) return null;
  return {
    connId: externalId.slice(0, idx),
    accountId: externalId.slice(idx + 1),
  };
}

export function buildConnectionIndex(
  connections: SimpleFinConnection[] | undefined
): Map<string, SimpleFinConnection> {
  const map = new Map<string, SimpleFinConnection>();
  for (const conn of connections ?? []) {
    if (conn.conn_id) map.set(conn.conn_id, conn);
  }
  return map;
}

export function resolveInstitutionName(
  account: SimpleFinAccount,
  connections: Map<string, SimpleFinConnection>
): string | undefined {
  if (account.conn_id) {
    const conn = connections.get(account.conn_id);
    if (conn?.org_name) return conn.org_name;
    if (conn?.name) return conn.name;
  }
  if (account.conn_name) return account.conn_name;
  return account.org?.name;
}

export function inferAccountType(name: string): string | undefined {
  const lower = name.toLowerCase();
  if (
    lower.includes("checking") ||
    lower.includes("chequing") ||
    lower.includes("savings")
  ) {
    return "depository";
  }
  if (
    lower.includes("credit card") ||
    /\bvisa\b/.test(lower) ||
    /\bmastercard\b/.test(lower) ||
    /\bamex\b/.test(lower) ||
    /\bdiscover\b/.test(lower) ||
    /\bdebit card\b/.test(lower)
  ) {
    return "credit";
  }
  if (lower.includes("mortgage") || /\bloan\b/.test(lower)) {
    return "loan";
  }
  if (lower.includes("cash") && !lower.includes("brokerage")) {
    return "depository";
  }
  if (
    lower.includes("brokerage") ||
    lower.includes("investment") ||
    lower.includes("401") ||
    lower.includes("ira")
  ) {
    return "investment";
  }
  return undefined;
}

/** True when the account has non-cash security positions (not just a cash sweep). */
export function hasSimpleFinSecurities(holdings: SimpleFinHolding[]): boolean {
  return holdings.some((h) => {
    const sym = (h.symbol?.trim() || h.id).toUpperCase();
    if (sym === "CASH") return false;
    const qty = parseFloat(h.shares ?? "0") || 0;
    const mv = parseFloat(h.market_value ?? "0") || 0;
    return qty > 0 || mv > 0;
  });
}

/** Classify synced accounts so bank/credit totals can be computed reliably. */
export function resolveSyncedAccountType(
  accountName: string,
  balance: number,
  holdings: SimpleFinHolding[]
): string {
  const inferred = inferAccountType(accountName);
  const hasSecurities = hasSimpleFinSecurities(holdings);

  if (inferred === "credit" || inferred === "loan") return inferred;
  if (inferred === "investment" || hasSecurities) return "investment";
  if (inferred === "depository") return "depository";
  if (balance < 0) return "credit";
  return "depository";
}

/** SimpleFIN recommends ~45 days per request for daily sync; use 44 to avoid UTC boundary drift. */
export const SIMPLEFIN_DEFAULT_TRANSACTION_DAYS = 44;

/** Hard cap enforced by SimpleFIN Bridge (chunk for longer backfills). */
export const SIMPLEFIN_HARD_MAX_TRANSACTION_DAYS = 89;

/** Overlap when diff-syncing so late-posted transactions are not missed. */
export const SIMPLEFIN_INCREMENTAL_OVERLAP_DAYS = 1;

export function unixStartOfDayUtc(daysAgo: number): string {
  const start = new Date();
  start.setUTCDate(start.getUTCDate() - daysAgo);
  start.setUTCHours(0, 0, 0, 0);
  return String(Math.floor(start.getTime() / 1000));
}

export function defaultTransactionStartDate(
  days = SIMPLEFIN_DEFAULT_TRANSACTION_DAYS
): string {
  return unixStartOfDayUtc(days);
}

/** Full backfill window for first sync or newly discovered accounts. */
export function hardRefreshStartDate(): string {
  return unixStartOfDayUtc(SIMPLEFIN_HARD_MAX_TRANSACTION_DAYS);
}

/** Diff sync from the last successful sync with a small overlap. */
export function incrementalStartDate(lastSyncedAt: string): string {
  const synced = new Date(lastSyncedAt);
  synced.setUTCDate(synced.getUTCDate() - SIMPLEFIN_INCREMENTAL_OVERLAP_DAYS);
  synced.setUTCHours(0, 0, 0, 0);
  return String(Math.floor(synced.getTime() / 1000));
}

export type SimplefinSyncWindow = {
  mode: "hard" | "incremental";
  startDate: string;
};

/** Whether this household has never completed a SimpleFIN sync. */
export function isInitialSimplefinSync(
  hasSimplefinAccounts: boolean,
  lastSyncedAt: string | undefined
): boolean {
  return !hasSimplefinAccounts || !lastSyncedAt;
}

/**
 * Pick the fetch window for the next SimpleFIN request.
 * Initial sync uses hard refresh; daily sync diffs from the last sync timestamp.
 */
export function resolveSimplefinSyncWindow(options: {
  hasSimplefinAccounts: boolean;
  lastSyncedAt: string | undefined;
  accountLastSyncedAt: Array<string | undefined>;
}): SimplefinSyncWindow {
  if (
    isInitialSimplefinSync(
      options.hasSimplefinAccounts,
      options.lastSyncedAt
    )
  ) {
    return { mode: "hard", startDate: hardRefreshStartDate() };
  }

  const starts: number[] = [];
  if (options.lastSyncedAt) {
    starts.push(Number(incrementalStartDate(options.lastSyncedAt)));
  }
  for (const accountSyncedAt of options.accountLastSyncedAt) {
    starts.push(
      Number(
        accountSyncedAt
          ? incrementalStartDate(accountSyncedAt)
          : hardRefreshStartDate()
      )
    );
  }

  if (starts.length === 0) {
    return { mode: "hard", startDate: hardRefreshStartDate() };
  }

  return {
    mode: "incremental",
    startDate: String(Math.min(...starts)),
  };
}
