import type { FundProfile, InstrumentSearchResult } from "@portfolio/contracts";
import type { InstrumentDataProvider } from "./instrumentDataProvider.types.js";
import { stubInstrumentDataProvider } from "./stubInstrumentDataProvider.js";

/**
 * Uses a live market data provider when available, falling back to the stub
 * catalog for search suggestions and estimated projection fields.
 */
export class CompositeInstrumentDataProvider implements InstrumentDataProvider {
  constructor(
    private readonly live: InstrumentDataProvider,
    private readonly fallback = stubInstrumentDataProvider
  ) {}

  async search(q: string, limit: number): Promise<InstrumentSearchResult[]> {
    const query = q.trim();
    if (!query) {
      return this.fallback.search(query, limit);
    }

    try {
      const results = await this.live.search(query, limit);
      if (results.length > 0) return results;
    } catch {
      // Fall through to stub catalog.
    }
    return this.fallback.search(query, limit);
  }

  async getProfile(ticker: string): Promise<FundProfile | null> {
    const normalized = ticker.trim().toUpperCase();
    if (!normalized) return null;

    const stubProfile = await this.fallback.getProfile(normalized);

    try {
      const liveProfile = await this.live.getProfile(normalized);
      if (!liveProfile) return stubProfile;

      if (!stubProfile) return liveProfile;

      return mergeProfiles(liveProfile, stubProfile);
    } catch {
      return stubProfile;
    }
  }
}

function mergeProfiles(live: FundProfile, stub: FundProfile): FundProfile {
  const hasLiveReturns =
    live.return1y !== 0 || live.return3y !== 0 || live.return5y !== 0;

  return {
    ...stub,
    ...live,
    return1y: hasLiveReturns ? live.return1y : stub.return1y,
    return3y: hasLiveReturns ? live.return3y : stub.return3y,
    return5y: hasLiveReturns ? live.return5y : stub.return5y,
    annualizedReturn: hasLiveReturns ? live.annualizedReturn : stub.annualizedReturn,
    dividendYield: live.dividendYield > 0 ? live.dividendYield : stub.dividendYield,
    expenseRatio:
      live.expenseRatio > 0 && live.feeKind === "expense_ratio"
        ? live.expenseRatio
        : stub.expenseRatio,
    feeKind: live.feeKind !== "commission" || live.expenseRatio > 0 ? live.feeKind : stub.feeKind,
    yearsSinceInception:
      live.inceptionLabel !== "—" ? live.yearsSinceInception : stub.yearsSinceInception,
    inceptionLabel: live.inceptionLabel !== "—" ? live.inceptionLabel : stub.inceptionLabel,
    dataSource: live.dataSource ?? "fmp",
  };
}
