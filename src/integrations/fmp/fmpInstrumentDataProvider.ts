import type { FundProfile, InstrumentSearchResult } from "@portfolio/contracts";
import type { InstrumentDataProvider } from "../../services/instrumentDataProvider.types.js";
import { FmpClient, type FmpClientConfig } from "./client.js";
import { mapSearchRow, mapToFundProfile } from "./mapToFundProfile.js";

export interface FmpInstrumentDataProviderConfig extends FmpClientConfig {
  /** In-memory TTL for profile responses (ms). Default 5 minutes. */
  profileCacheTtlMs?: number;
}

type CacheEntry = { profile: FundProfile; expiresAt: number };

export class FmpInstrumentDataProvider implements InstrumentDataProvider {
  private readonly client: FmpClient;
  private readonly profileCache = new Map<string, CacheEntry>();
  private readonly profileCacheTtlMs: number;

  constructor(config: FmpInstrumentDataProviderConfig) {
    this.client = new FmpClient(config);
    this.profileCacheTtlMs = config.profileCacheTtlMs ?? 5 * 60 * 1000;
  }

  async search(q: string, limit: number): Promise<InstrumentSearchResult[]> {
    const query = q.trim();
    if (!query) return [];

    const rows = await this.client.searchSymbols(query, limit);
    const results: InstrumentSearchResult[] = [];
    for (const row of rows) {
      const mapped = mapSearchRow(row);
      if (mapped) results.push(mapped);
    }
    return results;
  }

  async getProfile(ticker: string): Promise<FundProfile | null> {
    const normalized = ticker.trim().toUpperCase();
    if (!normalized) return null;

    const cached = this.profileCache.get(normalized);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.profile;
    }

    const asOf = new Date().toISOString();
    const [quote, priceChange, company, etf] = await Promise.all([
      this.client.getQuote(normalized).catch(() => null),
      this.client.getStockPriceChange(normalized).catch(() => null),
      this.client.getCompanyProfile(normalized).catch(() => null),
      this.client.getEtfInfo(normalized).catch(() => null),
    ]);

    if (!quote && !priceChange && !company && !etf) {
      return null;
    }

    const profile = mapToFundProfile({
      ticker: normalized,
      quote,
      priceChange,
      company,
      etf,
      asOf,
    });

    this.profileCache.set(normalized, {
      profile,
      expiresAt: Date.now() + this.profileCacheTtlMs,
    });

    return profile;
  }
}
