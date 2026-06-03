import type {
  FmpCompanyProfileRow,
  FmpEtfInfoRow,
  FmpQuoteRow,
  FmpSearchSymbolRow,
  FmpStockPriceChangeRow,
} from "./types.js";

export interface FmpClientConfig {
  apiKey: string;
  baseUrl?: string;
  fetchFn?: typeof fetch;
}

export class FmpClientError extends Error {
  constructor(
    message: string,
    readonly status?: number
  ) {
    super(message);
    this.name = "FmpClientError";
  }
}

export class FmpClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchFn: typeof fetch;

  constructor(config: FmpClientConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = (config.baseUrl ?? "https://financialmodelingprep.com/stable").replace(
      /\/$/,
      ""
    );
    this.fetchFn = config.fetchFn ?? fetch;
  }

  async searchSymbols(query: string, limit: number): Promise<FmpSearchSymbolRow[]> {
    const rows = await this.getJson<FmpSearchSymbolRow[]>("/search-symbol", {
      query,
    });
    return rows.slice(0, limit);
  }

  async getQuote(symbol: string): Promise<FmpQuoteRow | null> {
    const rows = await this.getJson<FmpQuoteRow[]>("/quote", { symbol });
    return rows[0] ?? null;
  }

  async getStockPriceChange(symbol: string): Promise<FmpStockPriceChangeRow | null> {
    const rows = await this.getJson<FmpStockPriceChangeRow[]>("/stock-price-change", {
      symbol,
    });
    return rows[0] ?? null;
  }

  async getCompanyProfile(symbol: string): Promise<FmpCompanyProfileRow | null> {
    const rows = await this.getJson<FmpCompanyProfileRow[]>("/profile", { symbol });
    return rows[0] ?? null;
  }

  async getEtfInfo(symbol: string): Promise<FmpEtfInfoRow | null> {
    const rows = await this.getJson<FmpEtfInfoRow[]>("/etf/info", { symbol });
    return rows[0] ?? null;
  }

  private async getJson<T>(path: string, params: Record<string, string>): Promise<T> {
    const url = new URL(`${this.baseUrl}${path}`);
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
    url.searchParams.set("apikey", this.apiKey);

    const response = await this.fetchFn(url.toString(), {
      headers: { Accept: "application/json" },
    });

    if (!response.ok) {
      throw new FmpClientError(
        `FMP request failed (${response.status} ${response.statusText})`,
        response.status
      );
    }

    const body: unknown = await response.json();
    if (body && typeof body === "object" && "Error Message" in body) {
      const message = String((body as { "Error Message": string })["Error Message"]);
      throw new FmpClientError(message);
    }

    return body as T;
  }
}
