import type {
  AnalyzerPeriod,
  InstrumentAnalysis,
  InstrumentSignal,
} from "@portfolio/contracts";

type SymbolProfile = {
  companyName: string;
  currentPrice: number;
  priceChangePercent: number;
  fiftyTwoWeekLow: number;
  fiftyTwoWeekHigh: number;
  support: number;
  resistance: number;
  ma50: number;
  ma200: number;
  avgVolumeLabel: string;
  relativeVolume: number;
  momentumScore: number;
  trend: InstrumentSignal;
  summary: string;
};

const SYMBOL_PROFILES: Record<string, SymbolProfile> = {
  NVDA: {
    companyName: "NVIDIA Corp.",
    currentPrice: 875.28,
    priceChangePercent: 2.45,
    fiftyTwoWeekLow: 393.58,
    fiftyTwoWeekHigh: 974.0,
    support: 820.0,
    resistance: 925.0,
    ma50: 842.1,
    ma200: 612.45,
    avgVolumeLabel: "48.2M",
    relativeVolume: 1.24,
    momentumScore: 82,
    trend: "bullish",
    summary:
      "Price holds above the 50-day average with expanding volume. Momentum remains constructive for AI/datacenter leadership.",
  },
  AMD: {
    companyName: "Advanced Micro Devices, Inc.",
    currentPrice: 178.42,
    priceChangePercent: -0.82,
    fiftyTwoWeekLow: 93.11,
    fiftyTwoWeekHigh: 187.28,
    support: 168.0,
    resistance: 186.5,
    ma50: 172.3,
    ma200: 148.9,
    avgVolumeLabel: "62.1M",
    relativeVolume: 0.94,
    momentumScore: 58,
    trend: "neutral",
    summary:
      "Consolidating under resistance with mixed MACD. Datacenter share gains offset softer gaming mix.",
  },
  AAPL: {
    companyName: "Apple Inc.",
    currentPrice: 189.84,
    priceChangePercent: 0.31,
    fiftyTwoWeekLow: 164.08,
    fiftyTwoWeekHigh: 199.62,
    support: 182.5,
    resistance: 195.0,
    ma50: 186.2,
    ma200: 178.4,
    avgVolumeLabel: "54.8M",
    relativeVolume: 0.88,
    momentumScore: 64,
    trend: "neutral",
    summary:
      "Range-bound near all-time highs. Services strength supports valuation while hardware cycles normalize.",
  },
};

const PERIOD_SCALE: Record<AnalyzerPeriod, number> = {
  quarterly: 1,
  yearly: 1.35,
};

function defaultProfile(symbol: string): SymbolProfile {
  const seed = symbol.split("").reduce((sum, c) => sum + c.charCodeAt(0), 0);
  const base = 80 + (seed % 420);
  return {
    companyName: `${symbol} Corp.`,
    currentPrice: base,
    priceChangePercent: Number((((seed % 17) - 8) * 0.35).toFixed(2)),
    fiftyTwoWeekLow: Number((base * 0.62).toFixed(2)),
    fiftyTwoWeekHigh: Number((base * 1.28).toFixed(2)),
    support: Number((base * 0.94).toFixed(2)),
    resistance: Number((base * 1.08).toFixed(2)),
    ma50: Number((base * 0.97).toFixed(2)),
    ma200: Number((base * 0.84).toFixed(2)),
    avgVolumeLabel: `${12 + (seed % 40)}.${seed % 10}M`,
    relativeVolume: Number((0.85 + (seed % 30) / 100).toFixed(2)),
    momentumScore: 45 + (seed % 40),
    trend: seed % 3 === 0 ? "bearish" : seed % 2 === 0 ? "neutral" : "bullish",
    summary: `Technical snapshot for ${symbol} based on trend, momentum, and liquidity indicators.`,
  };
}

function scaleIndicator(
  value: number,
  period: AnalyzerPeriod,
  decimals = 1
): number {
  return Number((value * PERIOD_SCALE[period]).toFixed(decimals));
}

function buildIndicators(
  profile: SymbolProfile,
  period: AnalyzerPeriod,
  symbol: string
): InstrumentAnalysis["indicators"] {
  const rsi =
    profile.trend === "bullish" ? 68.4 : profile.trend === "bearish" ? 38.2 : 52.1;
  const macd =
    profile.trend === "bullish" ? 12.8 : profile.trend === "bearish" ? -4.6 : 1.2;
  const beta = symbol === "NVDA" ? 1.72 : symbol === "AMD" ? 1.68 : 1.12;

  return [
    {
      id: "rsi14",
      label: "RSI (14)",
      value: scaleIndicator(rsi, period),
      signal:
        rsi >= 70 ? "bearish" : rsi <= 35 ? "bullish" : ("neutral" as InstrumentSignal),
      changePercent: period === "yearly" ? 8.4 : 2.1,
      note: rsi >= 70 ? "Approaching overbought" : undefined,
    },
    {
      id: "macd",
      label: "MACD",
      value: scaleIndicator(macd, period),
      signal: macd > 0 ? "bullish" : macd < 0 ? "bearish" : "neutral",
      changePercent: period === "yearly" ? 14.2 : 3.8,
    },
    {
      id: "beta",
      label: "Beta vs. S&P",
      value: beta,
      signal: beta > 1.4 ? "bullish" : beta < 0.9 ? "bearish" : "neutral",
      note: "Sector-relative volatility",
    },
    {
      id: "atr",
      label: "ATR %",
      value: scaleIndicator(profile.trend === "bullish" ? 3.8 : 2.9, period, 2),
      unit: "%",
      signal: "neutral",
      changePercent: period === "yearly" ? -1.2 : 0.4,
    },
  ];
}

function buildTechnicalSignals(
  profile: SymbolProfile,
  period: AnalyzerPeriod
): InstrumentAnalysis["technicalSignals"] {
  const above50 = profile.currentPrice > profile.ma50;
  const above200 = profile.currentPrice > profile.ma200;
  const goldenCross = profile.ma50 > profile.ma200;

  return [
    {
      label: "Golden cross (50/200)",
      detail: goldenCross ? "50-day above 200-day" : "50-day below 200-day",
      signal: goldenCross ? "bullish" : "bearish",
      status: goldenCross ? "active" : "inactive",
    },
    {
      label: "Price vs. 50-day MA",
      detail: above50 ? "Trading above support trend" : "Below short-term trend",
      signal: above50 ? "bullish" : "bearish",
      status: above50 ? "active" : "watch",
    },
    {
      label: "Price vs. 200-day MA",
      detail: above200 ? "Long-term uptrend intact" : "Long-term trend challenged",
      signal: above200 ? "bullish" : "neutral",
      status: above200 ? "active" : "watch",
    },
    {
      label: period === "yearly" ? "YoY relative strength" : "QoQ relative strength",
      detail:
        profile.momentumScore >= 70
          ? "Outperforming sector benchmark"
          : "In line with sector",
      signal:
        profile.momentumScore >= 70
          ? "bullish"
          : profile.momentumScore < 45
            ? "bearish"
            : "neutral",
      status: profile.momentumScore >= 70 ? "active" : "watch",
    },
  ];
}

export function getInstrumentAnalysis(
  symbolInput: string,
  period: AnalyzerPeriod = "quarterly"
): InstrumentAnalysis {
  const symbol = symbolInput.trim().toUpperCase();
  const profile = SYMBOL_PROFILES[symbol] ?? defaultProfile(symbol);

  const priceVs50 =
    ((profile.currentPrice - profile.ma50) / profile.ma50) * 100;
  const priceVs200 =
    ((profile.currentPrice - profile.ma200) / profile.ma200) * 100;

  const volumeSignal: InstrumentSignal =
    profile.relativeVolume >= 1.15
      ? "bullish"
      : profile.relativeVolume <= 0.85
        ? "bearish"
        : "neutral";

  return {
    symbol,
    companyName: profile.companyName,
    period,
    asOf: new Date().toISOString().slice(0, 10),
    currentPrice: profile.currentPrice,
    priceChangePercent: profile.priceChangePercent,
    momentumScore: profile.momentumScore,
    trend: profile.trend,
    summary: profile.summary,
    indicators: buildIndicators(profile, period, symbol),
    movingAverages: [
      {
        label: "50-day MA",
        value: profile.ma50,
        priceVsPercent: Number(priceVs50.toFixed(1)),
      },
      {
        label: "200-day MA",
        value: profile.ma200,
        priceVsPercent: Number(priceVs200.toFixed(1)),
      },
    ],
    priceStructure: {
      currentPrice: profile.currentPrice,
      support: profile.support,
      resistance: profile.resistance,
      fiftyTwoWeekLow: profile.fiftyTwoWeekLow,
      fiftyTwoWeekHigh: profile.fiftyTwoWeekHigh,
    },
    volumeProfile: {
      avgVolumeLabel: profile.avgVolumeLabel,
      relativeVolume: profile.relativeVolume,
      signal: volumeSignal,
    },
    technicalSignals: buildTechnicalSignals(profile, period),
  };
}
