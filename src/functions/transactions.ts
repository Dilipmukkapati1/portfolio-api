import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from "@azure/functions";
import {
  CategorizeTransactionRequestSchema,
  TransactionFilterSchema,
} from "@portfolio/contracts";
import { transactionRepository } from "../cosmos/repositories/transactionRepository.js";
import { getAuthContext } from "../lib/auth.js";
import { jsonResponse, errorResponse } from "../lib/http.js";
async function transactionsHandler(
  request: HttpRequest,
  _context: InvocationContext
): Promise<HttpResponseInit> {
  const auth = getAuthContext(request);
  const url = new URL(request.url);

  if (request.method === "GET") {
    const filter = TransactionFilterSchema.parse({
      accountId: url.searchParams.get("accountId") ?? undefined,
      category: url.searchParams.get("category") ?? undefined,
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
  }

  return errorResponse("Method not allowed", 405);
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

app.http("transactionsCategorize", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "transactions/categorize",
  handler: categorizeHandler,
});
