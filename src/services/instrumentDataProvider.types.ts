import type {
  FundProfile,
  InstrumentSearchResult,
} from "@portfolio/contracts";

export interface InstrumentDataProvider {
  search(q: string, limit: number): Promise<InstrumentSearchResult[]>;
  getProfile(ticker: string): Promise<FundProfile | null>;
}
