import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from "@azure/functions";
import {
  TaxYearInputSchema,
  defaultTaxYear,
  normalizeHousehold,
} from "@portfolio/contracts";
import {
  estimateFederalTax,
  suggestStrategies,
  loadRulePack,
} from "@portfolio/tax-engine";
import { householdRepository } from "../cosmos/repositories/householdRepository.js";
import { taxProfileRepository } from "../cosmos/repositories/taxProfileRepository.js";
import { getAuthContext } from "../lib/auth.js";
import { jsonResponse, errorResponse } from "../lib/http.js";
import {
  enrichHousehold,
  getOrCreateTaxProfile,
} from "../services/householdTaxService.js";

async function taxEstimateHandler(
  request: HttpRequest,
  _context: InvocationContext
): Promise<HttpResponseInit> {
  const auth = getAuthContext(request);
  const household = await householdRepository.get(auth.householdId);
  const taxYear =
    household?.settings?.defaultTaxYear ??
    defaultTaxYear(
      household ?? {
        id: auth.householdId,
        householdId: auth.householdId,
        displayName: "",
        state: "CA",
        persona: "w2_employee",
        createdAt: "",
        updatedAt: "",
      }
    );

  const profile = household
    ? await getOrCreateTaxProfile(auth.householdId, taxYear)
    : null;

  const body = await request.json().catch(() => ({}));
  const hasBody = body && typeof body === "object" && Object.keys(body).length > 0;
  const parsed = hasBody
    ? TaxYearInputSchema.safeParse(body)
    : { success: true as const, data: profile?.inputs };

  if (!parsed.success) {
    return errorResponse(parsed.error.message, 400);
  }
  if (!parsed.data) {
    return errorResponse("No tax profile or request body provided", 400);
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
  const enriched = household ? await enrichHousehold(household) : null;
  const normalized = enriched ? normalizeHousehold(enriched) : null;
  const taxYear = normalized ? defaultTaxYear(normalized) : 2025;

  const profile = normalized
    ? await getOrCreateTaxProfile(auth.householdId, taxYear)
    : null;

  const url = new URL(request.url);
  const wagesOverride = url.searchParams.get("wages");

  const taxInput = TaxYearInputSchema.parse({
    ...(profile?.inputs ?? {
      taxYear,
      filingStatus: "single",
      wages: 0,
      dependents: 0,
    }),
    ...(wagesOverride !== null
      ? { wages: parseFloat(wagesOverride) || 0 }
      : {}),
  });

  const rules = loadRulePack(2025);
  const strategies = suggestStrategies(
    {
      householdId: auth.householdId,
      persona: normalized?.persona ?? "w2_employee",
      filingStatus: taxInput.filingStatus,
      state: normalized?.primaryState ?? normalized?.state ?? "CA",
      dependents: taxInput.dependents,
      taxInput,
    },
    rules
  );

  if (profile) {
    profile.strategyChecklist = strategies
      .filter((s) => s.missingData && s.missingData.length > 0)
      .map((s) => s.id);
    await taxProfileRepository.upsert(profile);
  }

  return jsonResponse({
    strategies,
    taxProfile: profile ?? undefined,
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
