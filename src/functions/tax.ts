import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from "@azure/functions";
import { TaxYearInputSchema } from "@portfolio/contracts";
import {
  estimateFederalTax,
  suggestStrategies,
  loadRulePack,
} from "@portfolio/tax-engine";
import { householdRepository } from "../cosmos/repositories/householdRepository.js";
import { getAuthContext } from "../lib/auth.js";
import { jsonResponse, errorResponse } from "../lib/http.js";

async function taxEstimateHandler(
  request: HttpRequest,
  _context: InvocationContext
): Promise<HttpResponseInit> {
  const auth = getAuthContext(request);
  const body = await request.json();
  const parsed = TaxYearInputSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(parsed.error.message, 400);
  }

  const rules = loadRulePack(2025);
  const estimate = estimateFederalTax(parsed.data, rules);
  return jsonResponse({
    estimate,
    disclaimer:
      "Educational estimates only. Not tax, legal, or investment advice.",
  });
}

async function taxStrategiesHandler(
  request: HttpRequest,
  _context: InvocationContext
): Promise<HttpResponseInit> {
  const auth = getAuthContext(request);
  const household = await householdRepository.get(auth.householdId);
  const url = new URL(request.url);
  const wages = parseFloat(url.searchParams.get("wages") ?? "0");

  const taxInput = TaxYearInputSchema.parse({
    taxYear: 2025,
    filingStatus: household?.filingStatus ?? "single",
    wages,
    dependents: household?.dependents ?? 0,
  });

  const rules = loadRulePack(2025);
  const strategies = suggestStrategies(
    {
      householdId: auth.householdId,
      persona: household?.persona ?? "w2_employee",
      filingStatus: household?.filingStatus ?? "single",
      state: household?.state ?? "CA",
      dependents: household?.dependents ?? 0,
      taxInput,
    },
    rules
  );

  return jsonResponse({
    strategies,
    disclaimer:
      "Educational estimates only. Not tax, legal, or investment advice.",
  });
}

app.http("taxEstimate", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "tax/estimate",
  handler: taxEstimateHandler,
});

app.http("taxStrategies", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "tax/strategies",
  handler: taxStrategiesHandler,
});
