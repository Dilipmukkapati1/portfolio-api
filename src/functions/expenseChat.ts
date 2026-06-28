import { app, type HttpRequest, type HttpResponseInit } from "@azure/functions";
import { ExpenseChatRequestSchema } from "@portfolio/contracts";
import { getAuthContext } from "../lib/auth.js";
import { jsonResponse, errorResponse } from "../lib/http.js";
import { getPrivacyContext, requirePrivacyUnlock } from "../lib/privacy.js";
import { buildExpenseChatResponse } from "../services/expenseChatService.js";
import { OpenRouterNotConfiguredError } from "../lib/openrouter.js";
import { SqlUnavailableError } from "../storage/compositeStore.js";

async function expenseChatHandler(
  request: HttpRequest
): Promise<HttpResponseInit> {
  const auth = getAuthContext(request);
  const locked = await requirePrivacyUnlock(request, auth.householdId);
  if (locked) return locked;

  const body = await request.json().catch(() => ({}));
  const parsed = ExpenseChatRequestSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(parsed.error.message, 400);
  }

  const privacy = await getPrivacyContext(request, auth.householdId);

  try {
    const result = await buildExpenseChatResponse(
      auth.householdId,
      parsed.data
    );
    return jsonResponse({
      ...result,
      privacyMode: privacy.isUnlocked ? "unlocked" : "locked",
      valuesUnlocked: privacy.isUnlocked,
    });
  } catch (err) {
    if (err instanceof OpenRouterNotConfiguredError) {
      return errorResponse(
        "Expense chat is not configured. Set OPENROUTER_API_KEY on the API.",
        503
      );
    }
    if (err instanceof SqlUnavailableError) {
      return errorResponse(err.message, 503);
    }
    const message =
      err instanceof Error ? err.message : "Expense chat request failed";
    return errorResponse(message, 502);
  }
}

app.http("expenseChat", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "expense-plan/chat",
  handler: expenseChatHandler,
});
