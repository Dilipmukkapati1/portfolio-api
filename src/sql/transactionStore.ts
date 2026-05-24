import type { Transaction, TransactionFilter } from "@portfolio/contracts";
import sql from "mssql";
import { getSqlPool, withSqlRetry } from "./client.js";
import { rowToTransaction, transactionToRow, type TransactionRow } from "./rowMapper.js";

export class SqlTransactionStore {
  async list(
    householdId: string,
    filter: TransactionFilter = { limit: 100 }
  ): Promise<Transaction[]> {
    return withSqlRetry(async () => {
      const pool = await getSqlPool();
      const request = pool.request();
      request.input("hid", sql.NVarChar(128), householdId);
      request.input("limit", sql.Int, filter.limit ?? 100);

      let query = `
        SELECT TOP (@limit) *
        FROM transactions
        WHERE household_id = @hid`;

      if (filter.accountId) {
        request.input("aid", sql.NVarChar(128), filter.accountId);
        query += " AND account_id = @aid";
      }
      if (filter.category) {
        request.input("cat", sql.NVarChar(32), filter.category);
        query += " AND category = @cat";
      }
      if (filter.source) {
        request.input("src", sql.NVarChar(32), filter.source);
        query += " AND source = @src";
      }
      if (filter.pending !== undefined) {
        request.input("pending", sql.Bit, filter.pending ? 1 : 0);
        query += " AND pending = @pending";
      }
      if (filter.startDate) {
        request.input("start", sql.Date, filter.startDate);
        query += " AND txn_date >= @start";
      }
      if (filter.endDate) {
        request.input("end", sql.Date, filter.endDate);
        query += " AND txn_date <= @end";
      }

      query += " ORDER BY txn_date DESC, id DESC";

      const result = await request.query<TransactionRow>(query);
      return result.recordset.map(rowToTransaction);
    });
  }

  async upsert(txn: Transaction): Promise<Transaction> {
    return withSqlRetry(async () => {
      const pool = await getSqlPool();
      const row = transactionToRow(txn);
      const request = pool.request();
      request.input("id", sql.NVarChar(256), row.id);
      request.input("household_id", sql.NVarChar(128), row.household_id);
      request.input("txn_id", sql.NVarChar(256), row.txn_id);
      request.input("account_id", sql.NVarChar(128), row.account_id);
      request.input("account_name", sql.NVarChar(256), row.account_name);
      request.input("source", sql.NVarChar(32), row.source);
      request.input("amount", sql.Decimal(18, 4), row.amount);
      request.input("currency", sql.Char(3), row.currency);
      request.input("txn_date", sql.Date, row.txn_date);
      request.input("transacted_at", sql.DateTime2, row.transacted_at);
      request.input("posted_at", sql.DateTime2, row.posted_at);
      request.input("description", sql.NVarChar(512), row.description);
      request.input("memo", sql.NVarChar(512), row.memo);
      request.input("merchant", sql.NVarChar(256), row.merchant);
      request.input("category", sql.NVarChar(32), row.category);
      request.input("category_source", sql.NVarChar(16), row.category_source);
      request.input("provider_category", sql.NVarChar(64), row.provider_category);
      request.input("pending", sql.Bit, row.pending ? 1 : 0);
      request.input("external_id", sql.NVarChar(256), row.external_id);
      request.input("created_at", sql.DateTime2, row.created_at);
      request.input("updated_at", sql.DateTime2, row.updated_at);

      await request.query(`
        MERGE transactions AS target
        USING (SELECT @id AS id) AS source
        ON target.id = source.id
        WHEN MATCHED THEN
          UPDATE SET
            household_id = @household_id,
            txn_id = @txn_id,
            account_id = @account_id,
            account_name = @account_name,
            source = @source,
            amount = @amount,
            currency = @currency,
            txn_date = @txn_date,
            transacted_at = @transacted_at,
            posted_at = @posted_at,
            description = @description,
            memo = @memo,
            merchant = @merchant,
            category = @category,
            category_source = @category_source,
            provider_category = @provider_category,
            pending = @pending,
            external_id = @external_id,
            updated_at = @updated_at
        WHEN NOT MATCHED THEN
          INSERT (
            id, household_id, txn_id, account_id, account_name, source, amount, currency,
            txn_date, transacted_at, posted_at, description, memo, merchant,
            category, category_source, provider_category, pending, external_id,
            created_at, updated_at
          )
          VALUES (
            @id, @household_id, @txn_id, @account_id, @account_name, @source, @amount, @currency,
            @txn_date, @transacted_at, @posted_at, @description, @memo, @merchant,
            @category, @category_source, @provider_category, @pending, @external_id,
            @created_at, @updated_at
          );`);

      return txn;
    });
  }

  async get(householdId: string, txnId: string): Promise<Transaction | null> {
    return withSqlRetry(async () => {
      const pool = await getSqlPool();
      const result = await pool
        .request()
        .input("hid", sql.NVarChar(128), householdId)
        .input("txn_id", sql.NVarChar(128), txnId)
        .query<TransactionRow>(`
          SELECT TOP 1 *
          FROM transactions
          WHERE household_id = @hid AND txn_id = @txn_id`);

      const row = result.recordset[0];
      return row ? rowToTransaction(row) : null;
    });
  }

  async replace(txn: Transaction): Promise<Transaction> {
    return this.upsert(txn);
  }

  async deleteAllForHousehold(householdId: string): Promise<void> {
    await withSqlRetry(async () => {
      const pool = await getSqlPool();
      await pool
        .request()
        .input("hid", sql.NVarChar(128), householdId)
        .query("DELETE FROM transactions WHERE household_id = @hid");
    });
  }
}

export const sqlTransactionStore = new SqlTransactionStore();
