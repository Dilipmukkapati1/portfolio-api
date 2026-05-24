import type { TransactionSummaryResponse } from "@portfolio/contracts";
import sql from "mssql";
import { getSqlPool, withSqlRetry } from "../sql/client.js";

const EXCLUDED_CATEGORIES = ["transfer", "investment"];

export type SummarizePeriodInput = {
  startDate: string;
  endDate: string;
  accountId?: string;
};

function validatePeriod(input: SummarizePeriodInput): void {
  if (!input.startDate || !input.endDate) {
    throw new Error("startDate and endDate are required");
  }
  if (input.startDate > input.endDate) {
    throw new Error("startDate must be on or before endDate");
  }
  const start = new Date(`${input.startDate}T00:00:00.000Z`);
  const end = new Date(`${input.endDate}T00:00:00.000Z`);
  const days =
    (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24) + 1;
  if (days > 366) {
    throw new Error("Date range cannot exceed 366 days");
  }
}

export async function summarizePeriod(
  householdId: string,
  input: SummarizePeriodInput
): Promise<TransactionSummaryResponse> {
  validatePeriod(input);

  return withSqlRetry(async () => {
    const pool = await getSqlPool();
    const totalsRequest = pool.request();
    totalsRequest.input("hid", sql.NVarChar(128), householdId);
    totalsRequest.input("start", sql.Date, input.startDate);
    totalsRequest.input("end", sql.Date, input.endDate);

    let totalsQuery = `
      SELECT
        SUM(CASE
          WHEN amount > 0 AND category NOT IN ('transfer', 'investment')
          THEN amount ELSE 0 END) AS total_credits,
        SUM(CASE
          WHEN amount < 0 AND category NOT IN ('transfer', 'investment')
          THEN ABS(amount) ELSE 0 END) AS total_spend,
        COUNT(*) AS transaction_count
      FROM transactions
      WHERE household_id = @hid
        AND pending = 0
        AND txn_date >= @start
        AND txn_date <= @end`;

    if (input.accountId) {
      totalsRequest.input("aid", sql.NVarChar(128), input.accountId);
      totalsQuery += " AND account_id = @aid";
    }

    const totalsResult = await totalsRequest.query<{
      total_credits: number | null;
      total_spend: number | null;
      transaction_count: number | null;
    }>(totalsQuery);

    const totalsRow = totalsResult.recordset[0];
    const categoryRequest = pool.request();
    categoryRequest.input("hid", sql.NVarChar(128), householdId);
    categoryRequest.input("start", sql.Date, input.startDate);
    categoryRequest.input("end", sql.Date, input.endDate);

    let categoryQuery = `
      SELECT category, SUM(ABS(amount)) AS spend
      FROM transactions
      WHERE household_id = @hid
        AND pending = 0
        AND amount < 0
        AND category NOT IN ('transfer', 'investment')
        AND txn_date >= @start
        AND txn_date <= @end`;

    if (input.accountId) {
      categoryRequest.input("aid", sql.NVarChar(128), input.accountId);
      categoryQuery += " AND account_id = @aid";
    }

    categoryQuery += " GROUP BY category";

    const categoryResult = await categoryRequest.query<{
      category: string;
      spend: number | null;
    }>(categoryQuery);

    const spendByCategory: Record<string, number> = {};
    for (const row of categoryResult.recordset) {
      if (!row.category) continue;
      spendByCategory[row.category] = Number(row.spend ?? 0);
    }

    return {
      totalCredits: Number(totalsRow?.total_credits ?? 0),
      totalSpend: Number(totalsRow?.total_spend ?? 0),
      spendByCategory,
      transactionCount: Number(totalsRow?.transaction_count ?? 0),
    };
  });
}
