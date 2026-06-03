import type {
  FeeKind,
  FundProfile,
  InstrumentAssetType,
  InstrumentSearchResult,
} from "@portfolio/contracts";
import { inferAssetClassFromName } from "@portfolio/contracts";
import type {
  FmpCompanyProfileRow,
  FmpEtfInfoRow,
  FmpQuoteRow,
  FmpSearchSymbolRow,
  FmpStockPriceChangeRow,
} from "./types.js";

function pctToDecimal(value: number | undefined): number | undefined {
  if (value === undefined || Number.isNaN(value)) return undefined;
  return value / 100;
}

/** FMP may return ER as percent points (0.03 = 0.03%) or as a decimal (0.0003). */
function normalizeExpenseRatio(raw: number | undefined): number | undefined {
  if (raw === undefined || Number.isNaN(raw)) return undefined;
  if (raw >= 1) return raw / 100;
  if (raw >= 0.01) return raw / 100;
  return raw;
}

function yearsSince(dateIso: string | undefined): {
  yearsSinceInception: number;
  inceptionLabel: string;
} {
  if (!dateIso) {
    return { yearsSinceInception: 8, inceptionLabel: "—" };
  }
  const inception = new Date(dateIso);
  if (Number.isNaN(inception.getTime())) {
    return { yearsSinceInception: 8, inceptionLabel: "—" };
  }
  const years = Math.max(
    1,
    Math.floor((Date.now() - inception.getTime()) / (365.25 * 24 * 60 * 60 * 1000))
  );
  return {
    yearsSinceInception: years,
    inceptionLabel: String(inception.getUTCFullYear()),
  };
}

function feeKindForAssetType(assetType: InstrumentAssetType | undefined): FeeKind {
  switch (assetType) {
    case "etf":
    case "mutual_fund":
    case "bond":
    case "fund":
      return "expense_ratio";
    case "stock":
      return "commission";
    default:
      return "expense_ratio";
  }
}

export function inferAssetTypeFromFmp(
  search?: FmpSearchSymbolRow,
  profile?: FmpCompanyProfileRow,
  etf?: FmpEtfInfoRow
): InstrumentAssetType | undefined {
  if (etf?.symbol) return "etf";
  if (profile?.isEtf) return "etf";
  if (profile?.isFund) return "mutual_fund";

  const haystack = [
    search?.name,
    etf?.name,
    etf?.description,
    etf?.assetClass,
    profile?.companyName,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (/\bbond\b|\baggregate\b|\btreasury\b|\btips\b/.test(haystack)) return "bond";
  if (/\betf\b/.test(haystack)) return "etf";
  if (/\bmutual\b|\bfund\b|\badmiral\b|\bindex\b/.test(haystack)) {
    return /\bmutual\b/.test(haystack) ? "mutual_fund" : "fund";
  }
  if (search?.symbol) return "stock";
  return undefined;
}

export function mapSearchRow(row: FmpSearchSymbolRow): InstrumentSearchResult | null {
  const ticker = row.symbol?.trim().toUpperCase();
  const name = row.name?.trim();
  if (!ticker || !name) return null;

  return {
    ticker,
    name,
    exchange: row.exchangeShortName ?? row.stockExchange,
    assetType: inferAssetTypeFromFmp(row),
  };
}

export function mapToFundProfile(input: {
  ticker: string;
  quote?: FmpQuoteRow | null;
  priceChange?: FmpStockPriceChangeRow | null;
  company?: FmpCompanyProfileRow | null;
  etf?: FmpEtfInfoRow | null;
  asOf: string;
}): FundProfile {
  const ticker = input.ticker.toUpperCase();
  const assetType =
    inferAssetTypeFromFmp(undefined, input.company ?? undefined, input.etf ?? undefined) ??
    (inferAssetClassFromName(ticker) === "stocks" ? "stock" : "fund");

  const return1y = pctToDecimal(input.priceChange?.["1Y"]) ?? 0;
  const return3y = pctToDecimal(input.priceChange?.["3Y"]) ?? return1y;
  const return5y = pctToDecimal(input.priceChange?.["5Y"]) ?? return3y;
  const annualizedReturn =
    pctToDecimal(input.priceChange?.["10Y"]) ??
    pctToDecimal(input.priceChange?.max) ??
    return5y;

  const price = input.quote?.price ?? input.company?.price;
  const lastDiv = input.company?.lastDiv;
  const dividendYieldFromProfile =
    input.company?.dividendYield !== undefined
      ? input.company.dividendYield > 1
        ? input.company.dividendYield / 100
        : input.company.dividendYield
      : undefined;
  const dividendYieldFromEtf =
    input.etf?.dividendYield !== undefined
      ? input.etf.dividendYield > 1
        ? input.etf.dividendYield / 100
        : input.etf.dividendYield
      : undefined;
  const dividendYield =
    dividendYieldFromEtf ??
    dividendYieldFromProfile ??
    (price && lastDiv ? lastDiv / price : 0);

  const expenseRatio =
    normalizeExpenseRatio(input.etf?.expenseRatio) ??
    (feeKindForAssetType(assetType) === "expense_ratio" ? 0.001 : 0);

  const inception = yearsSince(input.etf?.inceptionDate ?? input.company?.ipoDate);

  const name =
    input.quote?.name ??
    input.etf?.name ??
    input.company?.companyName ??
    ticker;

  const priceChangePct = input.quote?.changesPercentage;

  return {
    ticker,
    name,
    return1y,
    return3y,
    return5y,
    annualizedReturn,
    dividendYield,
    ...inception,
    expenseRatio,
    feeKind: feeKindForAssetType(assetType),
    price,
    priceChange1d: pctToDecimal(priceChangePct),
    marketCap: input.quote?.marketCap ?? input.company?.mktCap,
    volume: input.quote?.volume,
    exchange: input.quote?.exchange ?? input.company?.exchange,
    currency: input.quote?.currency ?? input.company?.currency,
    assetType,
    dataSource: "fmp",
    asOf: input.asOf,
  };
}
