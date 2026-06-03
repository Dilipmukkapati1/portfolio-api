import type {
  ExpenseMappingRule,
  ExpensePlan,
  UpsertExpensePlanRequest,
} from "@portfolio/contracts";
import {
  buildDefaultExpensePlan,
  expensePlanDocumentId,
  ruleMatchesTransaction,
} from "@portfolio/contracts";
import { expensePlanRepository } from "../cosmos/repositories/expensePlanRepository.js";
import { transactionRepository } from "../cosmos/repositories/transactionRepository.js";

export async function getOrCreatePlan(householdId: string): Promise<ExpensePlan> {
  const existing = await expensePlanRepository.get(householdId);
  if (existing) return existing;

  const plan = buildDefaultExpensePlan(householdId);
  return expensePlanRepository.upsert(plan);
}

function normalizeRules(rules: ExpenseMappingRule[]): ExpenseMappingRule[] {
  return rules.map((rule, index) => ({
    ...rule,
    sortOrder: rule.sortOrder ?? index,
  }));
}

export async function upsertPlan(
  householdId: string,
  input: UpsertExpensePlanRequest
): Promise<ExpensePlan> {
  const existing = await getOrCreatePlan(householdId);
  const now = new Date().toISOString();

  const plan: ExpensePlan = {
    id: expensePlanDocumentId(householdId),
    householdId,
    categories: input.categories ?? existing.categories,
    mappingRules: input.mappingRules
      ? normalizeRules(input.mappingRules)
      : existing.mappingRules,
    updatedAt: now,
  };

  return expensePlanRepository.upsert(plan);
}

export async function applyMappingRules(
  householdId: string,
  ruleIds?: string[]
): Promise<number> {
  const plan = await getOrCreatePlan(householdId);
  let rules = plan.mappingRules.filter((rule) => rule.applyToPast);
  if (ruleIds && ruleIds.length > 0) {
    const idSet = new Set(ruleIds);
    rules = plan.mappingRules.filter((rule) => idSet.has(rule.id));
  }

  if (rules.length === 0) return 0;

  let updatedCount = 0;
  let cursor: string | undefined;
  const maxPages = 20;

  for (let page = 0; page < maxPages; page += 1) {
    const result = await transactionRepository.list(householdId, {
      limit: 500,
      cursor,
      pending: false,
    });

    for (const txn of result.transactions) {
      if (txn.amount >= 0) continue;
      if (txn.categorySource === "user") continue;

      for (const rule of rules) {
        if (!ruleMatchesTransaction(txn, rule)) continue;
        await transactionRepository.replace({
          ...txn,
          category: rule.category,
          categorySource: "user",
          updatedAt: new Date().toISOString(),
        });
        updatedCount += 1;
        break;
      }
    }

    if (!result.hasMore || !result.nextCursor) break;
    cursor = result.nextCursor;
  }

  return updatedCount;
}
