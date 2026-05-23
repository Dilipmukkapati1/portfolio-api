import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from "@azure/functions";
import { getAuthContext } from "../lib/auth.js";
import { jsonResponse } from "../lib/http.js";

async function submitBatchHandler(
  request: HttpRequest,
  _context: InvocationContext
): Promise<HttpResponseInit> {
  const auth = getAuthContext(request);
  return jsonResponse({
    deferred: true,
    message:
      "Azure Batch jobs are Phase 2+. Use queue workers for MVP sync and categorization.",
    householdId: auth.householdId,
  });
}

app.http("submitBatch", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "batch/submit",
  handler: submitBatchHandler,
});
