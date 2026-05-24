import {
  app,
  type HttpRequest,
  type HttpResponseInit,
  type InvocationContext,
} from "@azure/functions";
import { UpsertTaxProfileRequestSchema } from "@portfolio/contracts";
import { taxProfileRepository } from "../cosmos/repositories/taxProfileRepository.js";
import { getAuthContext } from "../lib/auth.js";
import { jsonResponse, errorResponse } from "../lib/http.js";
import {
  enrichHousehold,
  getOrCreateTaxProfile,
  recomputeTaxProfile,
} from "../services/householdTaxService.js";
import { householdRepository } from "../cosmos/repositories/householdRepository.js";
import {
  buildTaxProfileFromMembers,
  defaultTaxYear,
} from "@portfolio/contracts";
import { memberRepository } from "../cosmos/repositories/memberRepository.js";
import { loadRulePack } from "@portfolio/tax-engine";

function parseTaxYear(request: HttpRequest): number | null {
  const yearParam = request.params.year ?? request.params.taxYear;
  if (!yearParam) return null;
  const year = parseInt(yearParam, 10);
  return Number.isFinite(year) ? year : null;
}

function resolveHouseholdId(
  request: HttpRequest,
  paramId?: string
): string {
  if (paramId) return paramId;
  return getAuthContext(request).householdId;
}

async function taxProfileGetHandler(
  request: HttpRequest,
  _context: InvocationContext
): Promise<HttpResponseInit> {
  const householdId = resolveHouseholdId(
    request,
    request.params.householdId
  );
  const taxYear = parseTaxYear(request);
  if (taxYear === null) {
    return errorResponse("Valid tax year is required", 400);
  }

  const profile =
    (await taxProfileRepository.get(householdId, taxYear)) ??
    (await getOrCreateTaxProfile(householdId, taxYear));

  if (!profile) {
    return errorResponse("Tax profile not found", 404);
  }

  return jsonResponse(profile);
}

async function taxProfilePutHandler(
  request: HttpRequest,
  _context: InvocationContext
): Promise<HttpResponseInit> {
  const householdId = resolveHouseholdId(
    request,
    request.params.householdId
  );
  const taxYear = parseTaxYear(request);
  if (taxYear === null) {
    return errorResponse("Valid tax year is required", 400);
  }

  const household = await householdRepository.get(householdId);
  if (!household) {
    return errorResponse("Household not found", 404);
  }

  const body = await request.json();
  const parsed = UpsertTaxProfileRequestSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(parsed.error.message, 400);
  }

  const members = await memberRepository.listByHousehold(householdId);
  const existing = await taxProfileRepository.get(householdId, taxYear);
  const rules = loadRulePack(2025);
  let profile = buildTaxProfileFromMembers(household, members, {
    taxYear,
    filingStatus: parsed.data.filingStatus ?? existing?.filingStatus,
    inputOverrides: parsed.data.inputs,
    existing: existing ?? undefined,
    rules: {
      retirement401kLimit: rules.retirement401kLimit,
      hsaFamilyLimit: rules.hsaFamilyLimit,
      hsaSingleLimit: rules.hsaSingleLimit,
    },
  });

  if (parsed.data.withholding) {
    profile.withholding = parsed.data.withholding;
  }
  if (parsed.data.estimatedPayments) {
    profile.estimatedPayments = parsed.data.estimatedPayments;
  }

  profile = await taxProfileRepository.upsert(profile);
  const enriched = await enrichHousehold(household);
  return jsonResponse({ taxProfile: profile, household: enriched });
}

async function taxProfileRecomputeHandler(
  request: HttpRequest,
  _context: InvocationContext
): Promise<HttpResponseInit> {
  const householdId = resolveHouseholdId(
    request,
    request.params.householdId
  );
  const taxYear = parseTaxYear(request);
  if (taxYear === null) {
    return errorResponse("Valid tax year is required", 400);
  }

  let filingStatus: import("@portfolio/contracts").FilingStatus | undefined;
  try {
    const body = await request.json();
    if (
      body &&
      typeof body === "object" &&
      "filingStatus" in body &&
      typeof (body as { filingStatus: unknown }).filingStatus === "string"
    ) {
      filingStatus = (body as { filingStatus: import("@portfolio/contracts").FilingStatus })
        .filingStatus;
    }
  } catch {
    // empty body
  }

  try {
    const profile = await recomputeTaxProfile(householdId, taxYear, {
      filingStatus,
    });
    const household = await householdRepository.get(householdId);
    const enriched = household ? await enrichHousehold(household) : null;
    return jsonResponse({ taxProfile: profile, household: enriched });
  } catch (err) {
    if (err instanceof Error && err.message === "Household not found") {
      return errorResponse(err.message, 404);
    }
    throw err;
  }
}

app.http("taxProfileAuth", {
  methods: ["GET", "PUT"],
  authLevel: "anonymous",
  route: "tax-profiles/{year}",
  handler: async (request, context) => {
    if (request.method === "GET") {
      return taxProfileGetHandler(request, context);
    }
    if (request.method === "PUT") {
      return taxProfilePutHandler(request, context);
    }
    return errorResponse("Method not allowed", 405);
  },
});

app.http("taxProfileRecomputeAuth", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "tax-profiles/{year}/recompute",
  handler: taxProfileRecomputeHandler,
});

app.http("taxProfileByHousehold", {
  methods: ["GET", "PUT"],
  authLevel: "anonymous",
  route: "households/{householdId}/tax-profiles/{year}",
  handler: async (request, context) => {
    if (request.method === "GET") {
      return taxProfileGetHandler(request, context);
    }
    if (request.method === "PUT") {
      return taxProfilePutHandler(request, context);
    }
    return errorResponse("Method not allowed", 405);
  },
});

app.http("taxProfileRecomputeByHousehold", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "households/{householdId}/tax-profiles/{year}/recompute",
  handler: taxProfileRecomputeHandler,
});
