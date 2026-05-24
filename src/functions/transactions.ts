import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from "@azure/functions";
import {
  CategorizeTransactionRequestSchema,
  TransactionFilterSchema,
  TransactionSummaryRequestSchema,
} from "@portfolio/contracts";
import { transactionRepository } from "../cosmos/repositories/transactionRepository.js";
import { getAuthContext } from "../lib/auth.js";
import { jsonResponse, errorResponse } from "../lib/http.js";
import { SqlUnavailableError } from "../storage/compositeStore.js";
import { summarizePeriod } from "../services/transactionSummaryService.js";

function mapStorageError(err: unknown): HttpResponseInit | null {
  if (err instanceof SqlUnavailableError) {
    return errorResponse(err.message, 503);
  }
  if (err instanceof Error && err.message.includes("startDate")) {
    return errorResponse(err.message, 400);
  }
  return null;
}
async function transactionsHandler(
  request: HttpRequest,
  _context: InvocationContext
): Promise<HttpResponseInit> {
  const auth = getAuthContext(request);
  const url = new URL(request.url);

  if (request.method === "GET") {
    try {
      const filter = TransactionFilterSchema.parse({
        accountId: url.searchParams.get("accountId") ?? undefined,
        category: url.searchParams.get("category") ?? undefined,
        source: url.searchParams.get("source") ?? undefined,
        pending:
          url.searchParams.get("pending") === null
            ? undefined
            : url.searchParams.get("pending") === "true",
        startDate: url.searchParams.get("startDate") ?? undefined,
        endDate: url.searchParams.get("endDate") ?? undefined,
        limit: url.searchParams.get("limit")
          ? parseInt(url.searchParams.get("limit")!, 10)
          : 100,
      });
      const transactions = await transactionRepository.list(
        auth.householdId,
        filter
      );
      return jsonResponse({ transactions });
    } catch (err) {
      const mapped = mapStorageError(err);
      if (mapped) return mapped;
      throw err;
    }
  }

  return errorResponse("Method not allowed", 405);
}

async function transactionsSummaryHandler(
  request: HttpRequest,
  _context: InvocationContext
): Promise<HttpResponseInit> {
  const auth = getAuthContext(request);
  const url = new URL(request.url);

  if (request.method !== "GET") {
    return errorResponse("Method not allowed", 405);
  }

  const parsed = TransactionSummaryRequestSchema.safeParse({
    startDate: url.searchParams.get("startDate") ?? undefined,
    endDate: url.searchParams.get("endDate") ?? undefined,
    accountId: url.searchParams.get("accountId") ?? undefined,
  });
  if (!parsed.success) {
    return errorResponse(parsed.error.message, 400);
  }

  try {
    const summary = await summarizePeriod(auth.householdId, parsed.data);
    return jsonResponse(summary);
  } catch (err) {
    const mapped = mapStorageError(err);
    if (mapped) return mapped;
    throw err;
  }
}

async function categorizeHandler(
  request: HttpRequest,
  _context: InvocationContext
): Promise<HttpResponseInit> {
  const auth = getAuthContext(request);
  const body = await request.json();
  const parsed = CategorizeTransactionRequestSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(parsed.error.message, 400);
  }

  const existing = await transactionRepository.get(
    auth.householdId,
    parsed.data.txnId
  );
  if (!existing) return errorResponse("Transaction not found", 404);
  const updated = await transactionRepository.replace({
    ...existing,
    category: parsed.data.category,
    categorySource: "user",
    updatedAt: new Date().toISOString(),
  });
  return jsonResponse(updated);
}

app.http("transactions", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "transactions",
  handler: transactionsHandler,
});

app.http("transactionsSummary", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "transactions/summary",
  handler: transactionsSummaryHandler,
});

app.http("transactionsCategorize", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "transactions/categorize",
  handler: categorizeHandler,
});
