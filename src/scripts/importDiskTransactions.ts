import fs from "node:fs";
import path from "node:path";
import { TransactionSchema, type Account, type Transaction } from "@portfolio/contracts";
import { sqlTransactionStore } from "../sql/transactionStore.js";
import { probeSql } from "../sql/client.js";

type DiskSnapshot = {
  transactionData?: Record<string, Transaction[]>;
  accountData?: Record<string, Account[]>;
};

function formatAccountName(account: Account): string {
  const name = account.displayName.trim();
  const institution = account.institutionName?.trim();
  if (institution && institution !== name) {
    return `${institution} — ${name}`;
  }
  return name;
}

function loadDiskTransactions(filePath: string): Transaction[] {
  if (!fs.existsSync(filePath)) {
    console.log(`No disk store at ${filePath}; nothing to import.`);
    return [];
  }

  const snapshot = JSON.parse(fs.readFileSync(filePath, "utf-8")) as DiskSnapshot;
  const accountNames = new Map<string, string>();
  for (const accounts of Object.values(snapshot.accountData ?? {})) {
    for (const account of accounts ?? []) {
      accountNames.set(account.accountId, formatAccountName(account));
    }
  }

  const rows: Transaction[] = [];
  for (const [householdId, txns] of Object.entries(snapshot.transactionData ?? {})) {
    for (const raw of txns ?? []) {
      rows.push(
        TransactionSchema.parse({
          ...raw,
          householdId: raw.householdId ?? householdId,
          accountName:
            raw.accountName ?? accountNames.get(raw.accountId) ?? undefined,
        })
      );
    }
  }
  return rows;
}

async function main(): Promise<void> {
  const filePath =
    process.env.LOCAL_STORAGE_PATH ??
    path.join(process.cwd(), ".local-data", "portfolio-store.json");

  const sqlOk = await probeSql();
  if (!sqlOk) {
    throw new Error(
      "Azure SQL is not configured or unreachable. Set AZURE_SQL_* in local.settings.json and run npm run sql:azure && npm run db:migrate."
    );
  }

  const txns = loadDiskTransactions(filePath);
  if (txns.length === 0) {
    console.log("No transactions found in disk store.");
    return;
  }

  let imported = 0;
  for (const txn of txns) {
    await sqlTransactionStore.upsert(txn);
    imported++;
  }

  console.log(`Imported ${imported} transaction(s) from ${filePath} into Azure SQL.`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
