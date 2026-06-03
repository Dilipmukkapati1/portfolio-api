export interface FmpSearchSymbolRow {
  symbol?: string;
  name?: string;
  currency?: string;
  stockExchange?: string;
  exchangeShortName?: string;
}

export interface FmpQuoteRow {
  symbol?: string;
  name?: string;
  price?: number;
  changesPercentage?: number;
  change?: number;
  volume?: number;
  marketCap?: number;
  exchange?: string;
  currency?: string;
}

export interface FmpStockPriceChangeRow {
  symbol?: string;
  "1D"?: number;
  "5D"?: number;
  "1M"?: number;
  "3M"?: number;
  "6M"?: number;
  ytd?: number;
  "1Y"?: number;
  "3Y"?: number;
  "5Y"?: number;
  "10Y"?: number;
  max?: number;
}

export interface FmpCompanyProfileRow {
  symbol?: string;
  companyName?: string;
  price?: number;
  mktCap?: number;
  lastDiv?: number;
  dividendYield?: number;
  exchange?: string;
  currency?: string;
  ipoDate?: string;
  isEtf?: boolean;
  isFund?: boolean;
  isActivelyTrading?: boolean;
}

export interface FmpEtfInfoRow {
  symbol?: string;
  name?: string;
  expenseRatio?: number;
  dividendYield?: number;
  inceptionDate?: string;
  assetClass?: string;
  description?: string;
}
