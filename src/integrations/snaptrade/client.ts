import { getSecret } from "../../lib/keyvault.js";

export interface SnapTradeConnectResult {
  redirectUri: string;
  userId: string;
}

/**
 * SnapTrade SDK skeleton — production uses snaptrade-typescript-sdk.
 * MVP returns a placeholder OAuth URL for local/dev testing.
 */
export class SnapTradeClient {
  private clientId?: string;
  private consumerKey?: string;

  async init(): Promise<void> {
    this.clientId = await getSecret("snaptrade-client-id");
    this.consumerKey = await getSecret("snaptrade-consumer-key");
  }

  async registerUser(userId: string): Promise<{ userSecret: string }> {
    await this.init();
    if (!this.clientId || !this.consumerKey) {
      // Dev mode: deterministic mock secret
      return { userSecret: `mock-secret-${userId}` };
    }
    // TODO: snaptrade-typescript-sdk registerUser
    return { userSecret: `secret-${userId}` };
  }

  async getLoginLink(
    userId: string,
    userSecret: string,
    redirectUrl: string
  ): Promise<string> {
    await this.init();
    if (!this.clientId) {
      return `${redirectUrl}?snaptrade=mock&userId=${encodeURIComponent(userId)}`;
    }
    // TODO: loginSnapTradeUser via SDK
    return `https://app.snaptrade.com/snapTrade/redeemToken?clientId=${this.clientId}&userId=${userId}&redirect=${encodeURIComponent(redirectUrl)}`;
  }

  async fetchHoldings(
    _userId: string,
    _userSecret: string,
    accountId: string
  ): Promise<
    Array<{
      symbol: string;
      units: number;
      price: number;
      description?: string;
    }>
  > {
    // MVP mock holdings when SDK not configured
    if (!this.clientId) {
      return [
        {
          symbol: "VTI",
          units: 10,
          price: 250,
          description: "Vanguard Total Stock Market ETF",
        },
        {
          symbol: "BND",
          units: 20,
          price: 72,
          description: "Vanguard Total Bond Market ETF",
        },
      ];
    }
    return [];
  }
}

export const snapTradeClient = new SnapTradeClient();
