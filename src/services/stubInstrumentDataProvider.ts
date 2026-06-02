import type {
  AssetClass,
  FeeKind,
  FundProfile,
  InstrumentSearchResult,
} from "@portfolio/contracts";
import { inferAssetClassFromName, tickerFromName } from "@portfolio/contracts";

export interface InstrumentDataProvider {
  search(q: string, limit: number): InstrumentSearchResult[];
  getProfile(ticker: string): FundProfile | null;
}

const CLASS_DEFAULT_EXPENSE_RATIO: Record<AssetClass, number> = {
  "index-funds": 0.0003,
  "mutual-funds": 0.0015,
  bonds: 0.0004,
  stocks: 0,
  cash: 0,
};

const CLASS_DEFAULT_FEE_KIND: Record<AssetClass, FeeKind> = {
  "index-funds": "expense_ratio",
  "mutual-funds": "expense_ratio",
  bonds: "expense_ratio",
  stocks: "commission",
  cash: "none",
};

const CLASS_DEFAULT_DIVIDEND_YIELD: Record<AssetClass, number> = {
  "index-funds": 0.012,
  "mutual-funds": 0.01,
  bonds: 0.03,
  stocks: 0.008,
  cash: 0,
};

const CLASS_DEFAULT_RETURN: Record<AssetClass, number> = {
  "index-funds": 0.08,
  "mutual-funds": 0.09,
  bonds: 0.04,
  stocks: 0.1,
  cash: 0.045,
};

const TICKER_PROFILES: Record<string, FundProfile> = {
  VTI: {
    ticker: "VTI",
    return1y: 0.124,
    return3y: 0.082,
    return5y: 0.095,
    annualizedReturn: 0.098,
    dividendYield: 0.013,
    yearsSinceInception: 18,
    inceptionLabel: "2006",
    expenseRatio: 0.0003,
    feeKind: "expense_ratio",
  },
  VXUS: {
    ticker: "VXUS",
    return1y: 0.118,
    return3y: 0.041,
    return5y: 0.048,
    annualizedReturn: 0.051,
    dividendYield: 0.028,
    yearsSinceInception: 14,
    inceptionLabel: "2011",
    expenseRatio: 0.0007,
    feeKind: "expense_ratio",
  },
  VOO: {
    ticker: "VOO",
    return1y: 0.13,
    return3y: 0.09,
    return5y: 0.1,
    annualizedReturn: 0.1,
    dividendYield: 0.012,
    yearsSinceInception: 14,
    inceptionLabel: "2010",
    expenseRatio: 0.0003,
    feeKind: "expense_ratio",
  },
  IVV: {
    ticker: "IVV",
    return1y: 0.128,
    return3y: 0.088,
    return5y: 0.098,
    annualizedReturn: 0.099,
    dividendYield: 0.012,
    yearsSinceInception: 24,
    inceptionLabel: "2000",
    expenseRatio: 0.0003,
    feeKind: "expense_ratio",
  },
  FXAIX: {
    ticker: "FXAIX",
    return1y: 0.142,
    return3y: 0.098,
    return5y: 0.108,
    annualizedReturn: 0.105,
    dividendYield: 0.011,
    yearsSinceInception: 34,
    inceptionLabel: "1990",
    expenseRatio: 0.0015,
    feeKind: "expense_ratio",
  },
  VFIAX: {
    ticker: "VFIAX",
    return1y: 0.14,
    return3y: 0.096,
    return5y: 0.106,
    annualizedReturn: 0.104,
    dividendYield: 0.011,
    yearsSinceInception: 30,
    inceptionLabel: "1994",
    expenseRatio: 0.0004,
    feeKind: "expense_ratio",
  },
  BND: {
    ticker: "BND",
    return1y: 0.028,
    return3y: -0.012,
    return5y: 0.008,
    annualizedReturn: 0.038,
    dividendYield: 0.031,
    yearsSinceInception: 17,
    inceptionLabel: "2007",
    expenseRatio: 0.0003,
    feeKind: "expense_ratio",
  },
  AGG: {
    ticker: "AGG",
    return1y: 0.026,
    return3y: -0.014,
    return5y: 0.006,
    annualizedReturn: 0.036,
    dividendYield: 0.029,
    yearsSinceInception: 20,
    inceptionLabel: "2004",
    expenseRatio: 0.0004,
    feeKind: "expense_ratio",
  },
  AAPL: {
    ticker: "AAPL",
    return1y: 0.186,
    return3y: 0.122,
    return5y: 0.158,
    annualizedReturn: 0.182,
    dividendYield: 0.0044,
    yearsSinceInception: 40,
    inceptionLabel: "1984",
    expenseRatio: 0,
    feeKind: "commission",
  },
  MSFT: {
    ticker: "MSFT",
    return1y: 0.152,
    return3y: 0.118,
    return5y: 0.142,
    annualizedReturn: 0.164,
    dividendYield: 0.007,
    yearsSinceInception: 38,
    inceptionLabel: "1986",
    expenseRatio: 0,
    feeKind: "commission",
  },
  GOOGL: {
    ticker: "GOOGL",
    return1y: 0.16,
    return3y: 0.11,
    return5y: 0.14,
    annualizedReturn: 0.15,
    dividendYield: 0,
    yearsSinceInception: 20,
    inceptionLabel: "2004",
    expenseRatio: 0,
    feeKind: "commission",
  },
  SCHD: {
    ticker: "SCHD",
    return1y: 0.11,
    return3y: 0.08,
    return5y: 0.09,
    annualizedReturn: 0.085,
    dividendYield: 0.035,
    yearsSinceInception: 13,
    inceptionLabel: "2011",
    expenseRatio: 0.0006,
    feeKind: "expense_ratio",
  },
  CASH: {
    ticker: "CASH",
    return1y: 0.045,
    return3y: 0.042,
    return5y: 0.038,
    annualizedReturn: 0.045,
    dividendYield: 0,
    yearsSinceInception: 10,
    inceptionLabel: "2015",
    expenseRatio: 0,
    feeKind: "none",
  },
};

const EXPLORER_INSTRUMENT_OPTIONS: InstrumentSearchResult[] = [
  { ticker: "VTI", name: "VTI — Total US Market" },
  { ticker: "VXUS", name: "VXUS — Intl Developed" },
  { ticker: "VOO", name: "VOO — S&P 500 ETF" },
  { ticker: "IVV", name: "IVV — Core S&P 500" },
  { ticker: "FXAIX", name: "FXAIX — 500 Index" },
  { ticker: "VFIAX", name: "VFIAX — 500 Index Admiral" },
  { ticker: "BND", name: "BND — Aggregate Bond" },
  { ticker: "AGG", name: "AGG — US Aggregate Bond" },
  { ticker: "AAPL", name: "AAPL" },
  { ticker: "MSFT", name: "MSFT" },
  { ticker: "GOOGL", name: "GOOGL" },
  { ticker: "SCHD", name: "SCHD — Dividend Equity" },
  { ticker: "CASH", name: "High-yield savings" },
];

function estimatedReturns(assetClass: AssetClass, life: number) {
  return {
    return1y: life * 1.1,
    return3y: life * 0.95,
    return5y: life * 0.98,
  };
}

function profileForTicker(ticker: string, assetClass?: AssetClass): FundProfile {
  const upper = ticker.toUpperCase();
  const known = TICKER_PROFILES[upper];
  if (known) return known;

  const cls = assetClass ?? inferAssetClassFromName(upper);
  const life = CLASS_DEFAULT_RETURN[cls];
  return {
    ticker: upper,
    ...estimatedReturns(cls, life),
    annualizedReturn: life,
    dividendYield: CLASS_DEFAULT_DIVIDEND_YIELD[cls],
    yearsSinceInception: 8,
    inceptionLabel: "Est.",
    expenseRatio: CLASS_DEFAULT_EXPENSE_RATIO[cls],
    feeKind: CLASS_DEFAULT_FEE_KIND[cls],
  };
}

export class StubInstrumentDataProvider implements InstrumentDataProvider {
  search(q: string, limit: number): InstrumentSearchResult[] {
    const query = q.trim().toLowerCase();
    if (!query) return EXPLORER_INSTRUMENT_OPTIONS.slice(0, limit);
    return EXPLORER_INSTRUMENT_OPTIONS.filter(
      (opt) =>
        opt.ticker.toLowerCase().includes(query) ||
        opt.name.toLowerCase().includes(query)
    ).slice(0, limit);
  }

  getProfile(ticker: string): FundProfile | null {
    const normalized = ticker.trim().toUpperCase();
    if (!normalized) return null;
    return profileForTicker(normalized);
  }

  profileFromName(name: string): FundProfile {
    return profileForTicker(tickerFromName(name), inferAssetClassFromName(name));
  }
}

export const stubInstrumentDataProvider = new StubInstrumentDataProvider();

export function getInstrumentDataProvider(): InstrumentDataProvider {
  const kind = process.env.INSTRUMENT_DATA_PROVIDER ?? "stub";
  if (kind === "stub") return stubInstrumentDataProvider;
  return stubInstrumentDataProvider;
}
