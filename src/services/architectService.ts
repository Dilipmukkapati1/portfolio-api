import type {
  ArchitectDashboard,
  ArchitectExecutionAsset,
  ArchitectSectorSlice,
  ArchitectSectorTimeframe,
  ArchitectStrategyAllocation,
} from "@portfolio/contracts";
import {
  ensureDefaultArchitectPlan,
  type ArchitectPlanRow,
} from "../sql/architectStore.js";

const BAR_COLORS = ["purple", "blue", "green", "orange"] as const;

/** S&P 500–style sector snapshot for the segment heatmap (weights ≈ index). */
const SECTOR_BASE: Omit<ArchitectSectorSlice, "livePerfPercent" | "tone">[] = [
  {
    id: "technology",
    label: "Technology",
    shortLabel: "TECH",
    leadSymbol: "NVDA",
    weightPercent: 31,
    marketCapLabel: "$14.2T",
    assetCount: 78,
    accentColor: "#a855f7",
  },
  {
    id: "healthcare",
    label: "Healthcare",
    shortLabel: "HEALTH",
    leadSymbol: "UNH",
    weightPercent: 12,
    marketCapLabel: "$8.1T",
    assetCount: 65,
    accentColor: "#ec4899",
  },
  {
    id: "financials",
    label: "Financials",
    shortLabel: "FINANCE",
    leadSymbol: "JPM",
    weightPercent: 13,
    marketCapLabel: "$9.4T",
    assetCount: 72,
    accentColor: "#3b82f6",
  },
  {
    id: "consumer-discretionary",
    label: "Consumer Discretionary",
    shortLabel: "CONSUMER",
    leadSymbol: "AMZN",
    weightPercent: 10,
    marketCapLabel: "$6.8T",
    assetCount: 54,
    accentColor: "#f97316",
  },
  {
    id: "communication",
    label: "Communication Services",
    shortLabel: "COMM",
    leadSymbol: "GOOGL",
    weightPercent: 9,
    marketCapLabel: "$5.2T",
    assetCount: 24,
    accentColor: "#06b6d4",
  },
  {
    id: "industrials",
    label: "Industrials",
    shortLabel: "INDUST",
    leadSymbol: "CAT",
    weightPercent: 8,
    marketCapLabel: "$4.1T",
    assetCount: 68,
    accentColor: "#94a3b8",
  },
  {
    id: "consumer-staples",
    label: "Consumer Staples",
    shortLabel: "STAPLES",
    leadSymbol: "PG",
    weightPercent: 6,
    marketCapLabel: "$3.4T",
    assetCount: 38,
    accentColor: "#84cc16",
  },
  {
    id: "energy",
    label: "Energy",
    shortLabel: "ENERGY",
    leadSymbol: "XOM",
    weightPercent: 4,
    marketCapLabel: "$3.8T",
    assetCount: 24,
    accentColor: "#f59e0b",
  },
  {
    id: "utilities",
    label: "Utilities",
    shortLabel: "UTIL",
    leadSymbol: "NEE",
    weightPercent: 2.5,
    marketCapLabel: "$1.6T",
    assetCount: 31,
    accentColor: "#22d3ee",
  },
  {
    id: "real-estate",
    label: "Real Estate",
    shortLabel: "REIT",
    leadSymbol: "PLD",
    weightPercent: 2.2,
    marketCapLabel: "$1.2T",
    assetCount: 31,
    accentColor: "#ef4444",
  },
  {
    id: "materials",
    label: "Materials",
    shortLabel: "MAT",
    leadSymbol: "LIN",
    weightPercent: 2.3,
    marketCapLabel: "$1.9T",
    assetCount: 28,
    accentColor: "#a3e635",
  },
];

/** Base 1-day performance (%) per sector id. */
const PERF_1D: Record<string, number> = {
  technology: 4.28,
  healthcare: -1.24,
  financials: 0.85,
  "consumer-discretionary": -0.42,
  communication: 1.15,
  industrials: 0.35,
  "consumer-staples": -0.18,
  energy: 2.1,
  utilities: 0.12,
  "real-estate": -3.45,
  materials: 0.62,
};

const TIMEFRAME_SCALE: Record<ArchitectSectorTimeframe, number> = {
  "1d": 1,
  "1w": 2.4,
  "1m": 5.5,
};

function sectorTone(perf: number): ArchitectSectorSlice["tone"] {
  if (perf > 0.05) return "positive";
  if (perf < -0.05) return "negative";
  return "neutral";
}

export function buildSectorHeatmap(
  timeframe: ArchitectSectorTimeframe = "1d"
): ArchitectSectorSlice[] {
  const scale = TIMEFRAME_SCALE[timeframe];
  return SECTOR_BASE.map((sector) => {
    const basePerf = PERF_1D[sector.id] ?? 0;
    const livePerfPercent = Number((basePerf * scale).toFixed(2));
    return {
      ...sector,
      livePerfPercent,
      tone: sectorTone(livePerfPercent),
    };
  });
}

function strategyCenterLabel(strategy: ArchitectStrategyAllocation): string {
  const { equitiesPercent, bondsPercent, cashPercent } = strategy;
  if (equitiesPercent >= bondsPercent && equitiesPercent >= cashPercent) {
    return "Growth";
  }
  if (bondsPercent >= equitiesPercent && bondsPercent >= cashPercent) {
    return "Income";
  }
  return "Balanced";
}

function buildExecutionAssets(plan: ArchitectPlanRow): ArchitectExecutionAsset[] {
  return plan.targets.map((target, index) => {
    const drift = ((index % 5) - 2) * 0.8;
    const actualPercent = Math.max(
      0,
      Math.min(100, target.plannedPercent + drift)
    );
    const fillStatusPercent = Math.min(
      100,
      Math.round((actualPercent / Math.max(target.plannedPercent, 1)) * 100)
    );
    return {
      symbol: target.symbol,
      name: target.name,
      assetClass: target.assetClass,
      plannedPercent: target.plannedPercent,
      actualPercent: Number(actualPercent.toFixed(1)),
      fillStatusPercent,
      barColor: BAR_COLORS[index % BAR_COLORS.length],
    };
  });
}

export async function getArchitectDashboard(
  householdId: string,
  options?: { timeframe?: ArchitectSectorTimeframe }
): Promise<ArchitectDashboard> {
  const timeframe = options?.timeframe ?? "1d";
  const plan = await ensureDefaultArchitectPlan(householdId);
  const sectors = buildSectorHeatmap(timeframe);

  return {
    title: "Portfolio Architect",
    totalCapital: plan.totalCapital ?? undefined,
    strategy: plan.strategy,
    strategyCenterLabel: strategyCenterLabel(plan.strategy),
    executionAssets: buildExecutionAssets(plan),
    sectors,
    sharpeRatio: 1.42,
    efficiencyDescription:
      "Your allocation efficiency is above the household benchmark for this risk profile.",
    catalog: plan.targets.map((t) => ({
      symbol: t.symbol,
      name: t.name,
      assetClass: t.assetClass,
    })),
  };
}
