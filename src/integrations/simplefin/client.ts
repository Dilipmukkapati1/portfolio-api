export interface SimpleFinConnection {
  conn_id: string;
  name?: string;
  org_id?: string;
  org_name?: string;
  org_url?: string;
  sfin_url?: string;
}

export interface SimpleFinError {
  code: string;
  msg?: string;
  message?: string;
  conn_id?: string;
  account_id?: string;
}

export interface SimpleFinHolding {
  id: string;
  symbol?: string;
  description?: string;
  shares?: string;
  purchase_price?: string;
  cost_basis?: string;
  market_value?: string;
  currency?: string;
}

export interface SimpleFinAccount {
  id: string;
  name: string;
  balance: string;
  currency: string;
  conn_id?: string;
  conn_name?: string;
  "available-balance"?: string;
  "balance-date"?: number;
  org?: { name?: string };
  transactions?: SimpleFinTransaction[];
  holdings?: SimpleFinHolding[];
  /** Bridge-specific fields (e.g. investment holdings) may appear under extra. */
  extra?: {
    holdings?: SimpleFinHolding[];
    [key: string]: unknown;
  };
}

/** Holdings may be top-level or nested under extra (SimpleFIN Bridge). */
export function extractSimpleFinHoldings(
  account: SimpleFinAccount
): SimpleFinHolding[] {
  const merged = [...(account.holdings ?? []), ...(account.extra?.holdings ?? [])];
  const byId = new Map<string, SimpleFinHolding>();
  for (const holding of merged) {
    byId.set(holding.id, holding);
  }
  return [...byId.values()];
}

export interface SimpleFinTransaction {
  id: string;
  amount: string;
  posted?: number;
  payee?: string;
  description?: string;
  memo?: string;
  pending?: boolean;
  transacted_at?: number;
}

export interface SimpleFinAccountsResponse {
  errlist?: SimpleFinError[];
  errors?: string[];
  connections?: SimpleFinConnection[];
  accounts: SimpleFinAccount[];
}

export function formatSimpleFinErrors(errlist: SimpleFinError[] | undefined): string {
  if (!errlist?.length) return "";
  return errlist
    .map((e) => e.msg ?? e.message ?? e.code)
    .filter(Boolean)
    .join("; ");
}

/** SimpleFIN may return errlist entries for capped/adjusted requests that still succeed. */
export function isNonFatalSimpleFinError(error: SimpleFinError): boolean {
  const text = (error.msg ?? error.message ?? error.code ?? "").toLowerCase();
  return (
    text.includes("was capped") ||
    text.includes("may be capped") ||
    text.includes("recommended range") ||
    (text.includes("exceeds") && text.includes("date range"))
  );
}

export function partitionSimpleFinErrors(
  errlist: SimpleFinError[] | undefined
): { fatal: SimpleFinError[]; informational: SimpleFinError[] } {
  const fatal: SimpleFinError[] = [];
  const informational: SimpleFinError[] = [];
  for (const entry of errlist ?? []) {
    if (isNonFatalSimpleFinError(entry)) {
      informational.push(entry);
    } else {
      fatal.push(entry);
    }
  }
  return { fatal, informational };
}

/** Merge structured errlist with deprecated string errors from SimpleFIN responses. */
export function collectSimpleFinErrors(
  response: Pick<SimpleFinAccountsResponse, "errlist" | "errors">
): SimpleFinError[] {
  const structured = (response.errlist ?? []).map((entry) =>
    typeof entry === "string"
      ? ({ code: "error", msg: entry } satisfies SimpleFinError)
      : entry
  );
  const deprecated = (response.errors ?? []).map(
    (msg) => ({ code: "error", msg }) satisfies SimpleFinError
  );
  return [...structured, ...deprecated];
}

export type ParsedSimpleFinAccessUrl = {
  baseUrl: string;
  authorization: string;
};

/**
 * SimpleFIN Access URLs embed Basic Auth in the URL. Node fetch rejects
 * credentials in the URL string — parse them out and use Authorization header.
 */
export function parseSimpleFinAccessUrl(accessUrl: string): ParsedSimpleFinAccessUrl {
  const trimmed = accessUrl.trim();

  if (!trimmed.includes("://")) {
    throw new Error(
      "Invalid SimpleFIN Access URL. Use Connections → Connect with a setup token, or set SIMPLEFIN_ACCESS_URL to the claimed URL (https://user:pass@host/simplefin)."
    );
  }

  if (trimmed.includes("/claim/")) {
    throw new Error(
      "This is a SimpleFIN setup/claim URL, not an Access URL. Paste the setup token on Connections → Connect (do not put it in SIMPLEFIN_ACCESS_URL)."
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error("Invalid SimpleFIN Access URL format");
  }

  if (!parsed.username) {
    throw new Error(
      "SimpleFIN Access URL must include credentials (https://user:pass@beta-bridge.simplefin.org/simplefin)"
    );
  }

  const username = decodeURIComponent(parsed.username);
  const password = decodeURIComponent(parsed.password);

  if (username.startsWith("http") || username.startsWith("aHR0")) {
    throw new Error(
      "SimpleFIN Access URL looks like a setup token was stored by mistake. Clear SIMPLEFIN_ACCESS_URL / .local-secrets.json and connect again with a fresh setup token."
    );
  }

  parsed.username = "";
  parsed.password = "";
  const baseUrl = parsed.toString().replace(/\/$/, "");

  const authorization = `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;

  return { baseUrl, authorization };
}

export function assertValidAccessUrl(accessUrl: string): void {
  parseSimpleFinAccessUrl(accessUrl);
}

export class SimpleFinClient {
  constructor(private readonly accessUrl: string) {}

  async fetchAccounts(
    startDate?: string,
    endDate?: string
  ): Promise<SimpleFinAccountsResponse> {
    const { baseUrl, authorization } = parseSimpleFinAccessUrl(this.accessUrl);
    const url = new URL(`${baseUrl}/accounts`);
    url.searchParams.set("version", "2");
    if (startDate) url.searchParams.set("start-date", startDate);
    if (endDate) url.searchParams.set("end-date", endDate);

    const response = await fetch(url.toString(), {
      headers: {
        Accept: "application/json",
        Authorization: authorization,
      },
    });

    if (response.status === 403) {
      throw new Error(
        "SimpleFIN access was revoked or credentials are invalid. Reconnect with a new setup token."
      );
    }

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`SimpleFIN error ${response.status}: ${text}`);
    }

    const data = (await response.json()) as SimpleFinAccountsResponse;
    const allErrors = collectSimpleFinErrors(data);
    const { fatal } = partitionSimpleFinErrors(allErrors);
    const fatalText = formatSimpleFinErrors(fatal);
    if (fatalText && !(data.accounts?.length)) {
      throw new Error(`SimpleFIN sync failed: ${fatalText}`);
    }

    return { ...data, errlist: allErrors };
  }
}

/**
 * Decode a Setup Token (base64 claim URL) for the claim POST.
 * Accepts pasted claim URLs directly for convenience.
 */
export function decodeSetupToken(setupToken: string): string {
  const trimmed = setupToken.trim().replace(/\s+/g, "");
  if (!trimmed) {
    throw new Error("Setup token is required");
  }

  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }

  const decoded = Buffer.from(trimmed, "base64").toString("utf-8").trim();
  if (!decoded) {
    throw new Error("Invalid setup token: decoded URL is empty");
  }

  if (/^https?:\/\//i.test(decoded)) {
    return decoded;
  }

  return `https://${decoded}`;
}

/**
 * Claim a Setup Token once to obtain an Access URL.
 * @see https://bridge.simplefin.org/simplefin/access_token
 */
export async function claimSetupToken(
  setupToken: string
): Promise<string> {
  const claimUrl = decodeSetupToken(setupToken);

  if (!claimUrl.startsWith("https://")) {
    throw new Error("SimpleFIN claim URL must use HTTPS");
  }

  if (!claimUrl.includes("/claim/")) {
    throw new Error(
      "Expected a SimpleFIN setup token (base64 claim URL), not an Access URL"
    );
  }

  const response = await fetch(claimUrl, {
    method: "POST",
    headers: { "Content-Length": "0" },
    redirect: "follow",
  });

  if (response.status === 403) {
    throw new Error(
      "This setup token was already used or is invalid. Generate a new token at bridge.simplefin.org — each token works only once."
    );
  }

  if (!response.ok) {
    throw new Error(`Failed to claim SimpleFIN token: ${response.status}`);
  }

  const accessUrl = (await response.text()).trim();
  if (!accessUrl.startsWith("http")) {
    throw new Error("Invalid Access URL returned from SimpleFIN claim");
  }

  assertValidAccessUrl(accessUrl);
  return accessUrl;
}
