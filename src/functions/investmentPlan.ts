import {
  app,
  type HttpRequest,
  type HttpResponseInit,
  type InvocationContext,
} from "@azure/functions";
import {
  UpsertInvestmentPlanRequestSchema,
  investmentPlanDocumentId,
} from "@portfolio/contracts";
import { investmentPlanRepository } from "../cosmos/repositories/investmentPlanRepository.js";
import { getAuthContext } from "../lib/auth.js";
import { jsonResponse, errorResponse } from "../lib/http.js";
import { getPrivacyContext } from "../lib/privacy.js";
import {
  buildAllocationRollup,
  buildSummary,
  dedupePlanInstruments,
  getPlan,
  planWarnings,
} from "../services/investmentPlanService.js";
import { tickerFromName } from "@portfolio/contracts";

function resolveHouseholdId(
  request: HttpRequest,
  paramId?: string
): string {
  if (paramId) return paramId;
  return getAuthContext(request).householdId;
}

async function investmentPlanGetHandler(
  request: HttpRequest,
  _context: InvocationContext
): Promise<HttpResponseInit> {
  const householdId = resolveHouseholdId(
    request,
    request.params.householdId
  );
  const plan = await getPlan(householdId);
  return jsonResponse({ plan });
}

async function investmentPlanSummaryHandler(
  request: HttpRequest,
  _context: InvocationContext
): Promise<HttpResponseInit> {
  const householdId = resolveHouseholdId(
    request,
    request.params.householdId
  );
  const privacy = await getPrivacyContext(request, householdId);
  const summary = await buildSummary(householdId, privacy.isUnlocked);
  return jsonResponse({
    privacyMode: summary.privacyMode,
    valuesUnlocked: summary.valuesUnlocked,
    summary,
  });
}

async function investmentPlanAllocationHandler(
  request: HttpRequest,
  _context: InvocationContext
): Promise<HttpResponseInit> {
  const householdId = resolveHouseholdId(
    request,
    request.params.householdId
  );
  const privacy = await getPrivacyContext(request, householdId);
  const allocation = await buildAllocationRollup(
    householdId,
    privacy.isUnlocked
  );
  return jsonResponse({
    privacyMode: privacy.isUnlocked ? "unlocked" : "locked",
    valuesUnlocked: privacy.isUnlocked,
    ...allocation,
  });
}

async function investmentPlanPutHandler(
  request: HttpRequest,
  _context: InvocationContext
): Promise<HttpResponseInit> {
  const householdId = resolveHouseholdId(
    request,
    request.params.householdId
  );

  const body = await request.json();
  const parsed = UpsertInvestmentPlanRequestSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(parsed.error.message, 400);
  }

  const instruments = dedupePlanInstruments(
    parsed.data.instruments.map((item, index) => ({
      ...item,
      ticker: tickerFromName(item.name),
      sortOrder: item.sortOrder ?? index,
    }))
  );

  const now = new Date().toISOString();
  const plan = await investmentPlanRepository.upsert({
    id: investmentPlanDocumentId(householdId),
    householdId,
    instruments,
    updatedAt: now,
  });

  const privacy = await getPrivacyContext(request, householdId);
  const summary = await buildSummary(householdId, privacy.isUnlocked);
  const warnings = planWarnings(summary);

  return jsonResponse({
    plan,
    summary,
    ...(warnings.length > 0 ? { warnings } : {}),
  });
}

app.http("investmentPlanAuth", {
  methods: ["GET", "PUT"],
  authLevel: "anonymous",
  route: "investment-plan",
  handler: async (request, context) => {
    const path = request.url.split("?")[0] ?? "";
    if (path.endsWith("/summary") && request.method === "GET") {
      return investmentPlanSummaryHandler(request, context);
    }
    if (path.endsWith("/allocation") && request.method === "GET") {
      return investmentPlanAllocationHandler(request, context);
    }
    if (request.method === "GET") {
      return investmentPlanGetHandler(request, context);
    }
    if (request.method === "PUT") {
      return investmentPlanPutHandler(request, context);
    }
    return errorResponse("Method not allowed", 405);
  },
});

app.http("investmentPlanSummaryAuth", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "investment-plan/summary",
  handler: investmentPlanSummaryHandler,
});

app.http("investmentPlanAllocationAuth", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "investment-plan/allocation",
  handler: investmentPlanAllocationHandler,
});

app.http("investmentPlanByHousehold", {
  methods: ["GET", "PUT"],
  authLevel: "anonymous",
  route: "households/{householdId}/investment-plan",
  handler: async (request, context) => {
    if (request.method === "GET") {
      return investmentPlanGetHandler(request, context);
    }
    if (request.method === "PUT") {
      return investmentPlanPutHandler(request, context);
    }
    return errorResponse("Method not allowed", 405);
  },
});
