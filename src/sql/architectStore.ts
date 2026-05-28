import type {
  ArchitectAssetClass,
  ArchitectTarget,
  ArchitectStrategyAllocation,
} from "@portfolio/contracts";
import { randomUUID } from "node:crypto";
import { getSqlPool, withSqlRetry } from "./client.js";

export type ArchitectPlanRow = {
  householdId: string;
  totalCapital: number | null;
  strategy: ArchitectStrategyAllocation;
  targets: ArchitectTarget[];
};

const DEFAULT_STRATEGY: ArchitectStrategyAllocation = {
  equitiesPercent: 55,
  bondsPercent: 35,
  cashPercent: 10,
};

export const DEFAULT_ARCHITECT_TARGETS: ArchitectTarget[] = [
  {
    symbol: "VOO",
    name: "S&P 500 Index ETF",
    assetClass: "equity",
    plannedPercent: 50,
  },
  {
    symbol: "AAPL",
    name: "Apple Inc.",
    assetClass: "equity",
    plannedPercent: 5,
  },
  {
    symbol: "BND",
    name: "Total Bond Market ETF",
    assetClass: "bond",
    plannedPercent: 35,
  },
];

function parseAssetClass(value: string): ArchitectAssetClass {
  if (value === "equity" || value === "bond" || value === "cash") return value;
  return "other";
}

export async function getArchitectPlan(
  householdId: string
): Promise<ArchitectPlanRow | null> {
  return withSqlRetry(async () => {
    const pool = await getSqlPool();
    const planResult = await pool
      .request()
      .input("householdId", householdId)
      .query<{
        total_capital: number | null;
        equities_percent: number;
        bonds_percent: number;
        cash_percent: number;
      }>(`
        SELECT total_capital, equities_percent, bonds_percent, cash_percent
        FROM architect_plan
        WHERE household_id = @householdId
      `);

    const targetsResult = await pool
      .request()
      .input("householdId", householdId)
      .query<{
        symbol: string;
        name: string;
        asset_class: string;
        planned_percent: number;
      }>(`
        SELECT symbol, name, asset_class, planned_percent
        FROM architect_targets
        WHERE household_id = @householdId
        ORDER BY sort_order ASC, symbol ASC
      `);

    if (
      planResult.recordset.length === 0 &&
      targetsResult.recordset.length === 0
    ) {
      return null;
    }

    const planRow = planResult.recordset[0];
    const strategy = planRow
      ? {
          equitiesPercent: Number(planRow.equities_percent),
          bondsPercent: Number(planRow.bonds_percent),
          cashPercent: Number(planRow.cash_percent),
        }
      : DEFAULT_STRATEGY;

    const targets =
      targetsResult.recordset.length > 0
        ? targetsResult.recordset.map((row) => ({
            symbol: row.symbol,
            name: row.name,
            assetClass: parseAssetClass(row.asset_class),
            plannedPercent: Number(row.planned_percent),
          }))
        : DEFAULT_ARCHITECT_TARGETS;

    return {
      householdId,
      totalCapital:
        planRow?.total_capital != null ? Number(planRow.total_capital) : null,
      strategy,
      targets,
    };
  });
}

export async function ensureDefaultArchitectPlan(
  householdId: string
): Promise<ArchitectPlanRow> {
  const existing = await getArchitectPlan(householdId);
  if (existing) return existing;

  const now = new Date().toISOString();
  await withSqlRetry(async () => {
    const pool = await getSqlPool();
    await pool
      .request()
      .input("householdId", householdId)
      .input("equities", DEFAULT_STRATEGY.equitiesPercent)
      .input("bonds", DEFAULT_STRATEGY.bondsPercent)
      .input("cash", DEFAULT_STRATEGY.cashPercent)
      .input("updatedAt", now)
      .query(`
        INSERT INTO architect_plan (
          household_id, total_capital, equities_percent, bonds_percent, cash_percent, updated_at
        )
        VALUES (@householdId, NULL, @equities, @bonds, @cash, @updatedAt)
      `);

    for (const [index, target] of DEFAULT_ARCHITECT_TARGETS.entries()) {
      await pool
        .request()
        .input("id", randomUUID())
        .input("householdId", householdId)
        .input("symbol", target.symbol)
        .input("name", target.name)
        .input("assetClass", target.assetClass)
        .input("plannedPercent", target.plannedPercent)
        .input("sortOrder", index)
        .input("createdAt", now)
        .input("updatedAt", now)
        .query(`
          INSERT INTO architect_targets (
            id, household_id, symbol, name, asset_class, planned_percent, sort_order, created_at, updated_at
          )
          VALUES (
            @id, @householdId, @symbol, @name, @assetClass, @plannedPercent, @sortOrder, @createdAt, @updatedAt
          )
        `);
    }
  });

  return {
    householdId,
    totalCapital: null,
    strategy: DEFAULT_STRATEGY,
    targets: DEFAULT_ARCHITECT_TARGETS,
  };
}

export async function upsertArchitectPlan(
  householdId: string,
  input: {
    totalCapital?: number;
    strategy?: ArchitectStrategyAllocation;
    targets?: ArchitectTarget[];
    addTarget?: ArchitectTarget;
  }
): Promise<ArchitectPlanRow> {
  const now = new Date().toISOString();
  const current = await ensureDefaultArchitectPlan(householdId);
  const strategy = input.strategy ?? current.strategy;

  let targets = input.targets ?? current.targets;
  if (input.addTarget) {
    const symbol = input.addTarget.symbol.trim().toUpperCase();
    const merged: ArchitectTarget = {
      ...input.addTarget,
      symbol,
    };
    targets = [
      ...targets.filter((t) => t.symbol.toUpperCase() !== symbol),
      merged,
    ];
  }
  const totalCapital = input.totalCapital ?? current.totalCapital ?? null;

  await withSqlRetry(async () => {
    const pool = await getSqlPool();
    await pool
      .request()
      .input("householdId", householdId)
      .input("totalCapital", totalCapital)
      .input("equities", strategy.equitiesPercent)
      .input("bonds", strategy.bondsPercent)
      .input("cash", strategy.cashPercent)
      .input("updatedAt", now)
      .query(`
        MERGE architect_plan AS target
        USING (SELECT @householdId AS household_id) AS source
        ON target.household_id = source.household_id
        WHEN MATCHED THEN
          UPDATE SET
            total_capital = @totalCapital,
            equities_percent = @equities,
            bonds_percent = @bonds,
            cash_percent = @cash,
            updated_at = @updatedAt
        WHEN NOT MATCHED THEN
          INSERT (
            household_id, total_capital, equities_percent, bonds_percent, cash_percent, updated_at
          )
          VALUES (
            @householdId, @totalCapital, @equities, @bonds, @cash, @updatedAt
          );
      `);

    await pool
      .request()
      .input("householdId", householdId)
      .query(`DELETE FROM architect_targets WHERE household_id = @householdId`);

    for (const [index, target] of targets.entries()) {
      await pool
        .request()
        .input("id", randomUUID())
        .input("householdId", householdId)
        .input("symbol", target.symbol.toUpperCase())
        .input("name", target.name)
        .input("assetClass", target.assetClass)
        .input("plannedPercent", target.plannedPercent)
        .input("sortOrder", index)
        .input("createdAt", now)
        .input("updatedAt", now)
        .query(`
          INSERT INTO architect_targets (
            id, household_id, symbol, name, asset_class, planned_percent, sort_order, created_at, updated_at
          )
          VALUES (
            @id, @householdId, @symbol, @name, @assetClass, @plannedPercent, @sortOrder, @createdAt, @updatedAt
          )
        `);
    }
  });

  return {
    householdId,
    totalCapital,
    strategy,
    targets,
  };
}
