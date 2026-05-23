export interface SimpleFinAccount {
  id: string;
  name: string;
  balance: string;
  currency: string;
  org?: { name?: string };
  transactions?: SimpleFinTransaction[];
}

export interface SimpleFinTransaction {
  id: string;
  amount: string;
  posted?: number;
  payee?: string;
  description?: string;
  pending?: boolean;
}

export interface SimpleFinAccountsResponse {
  accounts: SimpleFinAccount[];
}

export class SimpleFinClient {
  constructor(private readonly accessUrl: string) {}

  private getBaseUrl(): string {
    return this.accessUrl.replace(/\/$/, "");
  }

  async fetchAccounts(
    startDate?: string,
    endDate?: string
  ): Promise<SimpleFinAccountsResponse> {
    const url = new URL(`${this.getBaseUrl()}/accounts`);
    url.searchParams.set("version", "2");
    if (startDate) url.searchParams.set("start-date", startDate);
    if (endDate) url.searchParams.set("end-date", endDate);

    const response = await fetch(url.toString(), {
      headers: { Accept: "application/json" },
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`SimpleFIN error ${response.status}: ${text}`);
    }

    return (await response.json()) as SimpleFinAccountsResponse;
  }
}

/**
 * Claim a Setup Token once to obtain an Access URL.
 * @see https://bridge.simplefin.org/simplefin/access_token
 */
export async function claimSetupToken(
  setupToken: string
): Promise<string> {
  const decoded = Buffer.from(setupToken.trim(), "base64").toString("utf-8");
  const claimUrl = decoded.startsWith("http")
    ? decoded
    : `https://${decoded}`;

  const response = await fetch(claimUrl, { method: "POST" });
  if (!response.ok) {
    throw new Error(`Failed to claim SimpleFIN token: ${response.status}`);
  }
  const accessUrl = (await response.text()).trim();
  if (!accessUrl.startsWith("http")) {
    throw new Error("Invalid Access URL returned from SimpleFIN claim");
  }
  return accessUrl;
}
