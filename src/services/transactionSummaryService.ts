import type { TransactionSummaryResponse } from "@portfolio/contracts";
import { expenseIgnoredCategorySqlIn } from "@portfolio/contracts";
import sql from "mssql";
import { getSqlPool, withSqlRetry } from "../sql/client.js";

const IGNORED = expenseIgnoredCategorySqlIn();

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
          WHEN amount > 0 AND category NOT IN (${IGNORED})
          THEN amount ELSE 0 END) AS total_credits,
        SUM(CASE
          WHEN amount < 0 AND category NOT IN (${IGNORED})
          THEN ABS(amount) ELSE 0 END) AS total_spend,
        SUM(CASE
          WHEN amount < 0 AND category NOT IN (${IGNORED})
          THEN 1 ELSE 0 END) AS transaction_count
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
        AND category NOT IN (${IGNORED})
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

    const accountRequest = pool.request();
    accountRequest.input("hid", sql.NVarChar(128), householdId);
    accountRequest.input("start", sql.Date, input.startDate);
    accountRequest.input("end", sql.Date, input.endDate);

    let accountQuery = `
      SELECT COALESCE(NULLIF(account_name, ''), account_id) AS account_key,
             SUM(ABS(amount)) AS spend
      FROM transactions
      WHERE household_id = @hid
        AND pending = 0
        AND amount < 0
        AND category NOT IN (${IGNORED})
        AND txn_date >= @start
        AND txn_date <= @end`;

    if (input.accountId) {
      accountRequest.input("aid", sql.NVarChar(128), input.accountId);
      accountQuery += " AND account_id = @aid";
    }

    accountQuery +=
      " GROUP BY COALESCE(NULLIF(account_name, ''), account_id)";

    const accountResult = await accountRequest.query<{
      account_key: string;
      spend: number | null;
    }>(accountQuery);

    const spendByAccount: Record<string, number> = {};
    for (const row of accountResult.recordset) {
      if (!row.account_key) continue;
      spendByAccount[row.account_key] = Number(row.spend ?? 0);
    }

    return {
      totalCredits: Number(totalsRow?.total_credits ?? 0),
      totalSpend: Number(totalsRow?.total_spend ?? 0),
      spendByCategory,
      spendByAccount,
      transactionCount: Number(totalsRow?.transaction_count ?? 0),
    };
  });
}

export async function summarizeSpendByDay(
  householdId: string,
  input: SummarizePeriodInput
): Promise<Array<{ date: string; spend: number }>> {
  validatePeriod(input);

  return withSqlRetry(async () => {
    const pool = await getSqlPool();
    const request = pool.request();
    request.input("hid", sql.NVarChar(128), householdId);
    request.input("start", sql.Date, input.startDate);
    request.input("end", sql.Date, input.endDate);

    let query = `
      SELECT txn_date AS txn_day, SUM(ABS(amount)) AS spend
      FROM transactions
      WHERE household_id = @hid
        AND pending = 0
        AND amount < 0
        AND category NOT IN (${IGNORED})
        AND txn_date >= @start
        AND txn_date <= @end`;

    if (input.accountId) {
      request.input("aid", sql.NVarChar(128), input.accountId);
      query += " AND account_id = @aid";
    }

    query += " GROUP BY txn_date ORDER BY txn_date ASC";

    const result = await request.query<{
      txn_day: Date | string;
      spend: number | null;
    }>(query);

    return result.recordset.map((row) => {
      const day =
        row.txn_day instanceof Date
          ? row.txn_day.toISOString().slice(0, 10)
          : String(row.txn_day).slice(0, 10);
      return { date: day, spend: Number(row.spend ?? 0) };
    });
  });
}

export async function summarizeTopMerchants(
  householdId: string,
  input: SummarizePeriodInput & { limit?: number }
): Promise<Array<{ merchant: string; spend: number; count: number }>> {
  validatePeriod(input);
  const limit = Math.min(Math.max(input.limit ?? 10, 1), 25);

  return withSqlRetry(async () => {
    const pool = await getSqlPool();
    const request = pool.request();
    request.input("hid", sql.NVarChar(128), householdId);
    request.input("start", sql.Date, input.startDate);
    request.input("end", sql.Date, input.endDate);
    request.input("lim", sql.Int, limit);

    let query = `
      SELECT TOP (@lim)
        COALESCE(NULLIF(merchant, ''), NULLIF(description, ''), 'Unknown') AS merchant_key,
        SUM(ABS(amount)) AS spend,
        COUNT(*) AS txn_count
      FROM transactions
      WHERE household_id = @hid
        AND pending = 0
        AND amount < 0
        AND category NOT IN (${IGNORED})
        AND txn_date >= @start
        AND txn_date <= @end`;

    if (input.accountId) {
      request.input("aid", sql.NVarChar(128), input.accountId);
      query += " AND account_id = @aid";
    }

    query += `
      GROUP BY COALESCE(NULLIF(merchant, ''), NULLIF(description, ''), 'Unknown')
      ORDER BY spend DESC`;

    const result = await request.query<{
      merchant_key: string;
      spend: number | null;
      txn_count: number | null;
    }>(query);

    return result.recordset.map((row) => ({
      merchant: row.merchant_key,
      spend: Number(row.spend ?? 0),
      count: Number(row.txn_count ?? 0),
    }));
  });
}
