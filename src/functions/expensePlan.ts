import {
  app,
  type HttpRequest,
  type HttpResponseInit,
  type InvocationContext,
} from "@azure/functions";
import {
  ApplyMappingRulesRequestSchema,
  UpsertExpensePlanRequestSchema,
} from "@portfolio/contracts";
import { getAuthContext } from "../lib/auth.js";
import { jsonResponse, errorResponse } from "../lib/http.js";
import {
  applyMappingRules,
  getOrCreatePlan,
  upsertPlan,
} from "../services/expensePlanService.js";
import { SqlUnavailableError } from "../storage/compositeStore.js";

function mapStorageError(err: unknown): HttpResponseInit | null {
  if (err instanceof SqlUnavailableError) {
    return errorResponse(err.message, 503);
  }
  return null;
}

async function expensePlanGetHandler(
  request: HttpRequest,
  _context: InvocationContext
): Promise<HttpResponseInit> {
  const auth = getAuthContext(request);
  const plan = await getOrCreatePlan(auth.householdId);
  return jsonResponse({ plan });
}

async function expensePlanPutHandler(
  request: HttpRequest,
  _context: InvocationContext
): Promise<HttpResponseInit> {
  const auth = getAuthContext(request);
  const body = await request.json();
  const parsed = UpsertExpensePlanRequestSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(parsed.error.message, 400);
  }

  const plan = await upsertPlan(auth.householdId, parsed.data);
  return jsonResponse({ plan });
}

async function expensePlanApplyMappingsHandler(
  request: HttpRequest,
  _context: InvocationContext
): Promise<HttpResponseInit> {
  const auth = getAuthContext(request);
  try {
    const body = (await request.json().catch(() => ({}))) as unknown;
    const parsed = ApplyMappingRulesRequestSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(parsed.error.message, 400);
    }

    const updatedCount = await applyMappingRules(
      auth.householdId,
      parsed.data.ruleIds
    );
    return jsonResponse({ updatedCount });
  } catch (err) {
    const mapped = mapStorageError(err);
    if (mapped) return mapped;
    throw err;
  }
}

app.http("expensePlanAuth", {
  methods: ["GET", "PUT"],
  authLevel: "anonymous",
  route: "expense-plan",
  handler: async (request, context) => {
    if (request.method === "GET") {
      return expensePlanGetHandler(request, context);
    }
    if (request.method === "PUT") {
      return expensePlanPutHandler(request, context);
    }
    return errorResponse("Method not allowed", 405);
  },
});

app.http("expensePlanApplyMappings", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "expense-plan/mappings/apply",
  handler: expensePlanApplyMappingsHandler,
});
