import {
  app,
  type HttpRequest,
  type HttpResponseInit,
  type InvocationContext,
} from "@azure/functions";
import {
  CreateHouseholdWithIdSchema,
  DeleteHouseholdsRequestSchema,
  UpdateHouseholdRequestSchema,
} from "@portfolio/contracts";
import { householdRepository } from "../cosmos/repositories/householdRepository.js";
import { getAuthContext } from "../lib/auth.js";
import { jsonResponse, errorResponse } from "../lib/http.js";
import { getPrivacyContext } from "../lib/privacy.js";
import { enrichHousehold } from "../services/householdTaxService.js";
import { redactHousehold } from "../services/privacyRedact.js";

async function householdsHandler(
  request: HttpRequest,
  _context: InvocationContext
): Promise<HttpResponseInit> {
  if (request.method === "GET") {
    const auth = getAuthContext(request);
    const privacy = await getPrivacyContext(request, auth.householdId);
    const households = await householdRepository.list();
    const enriched = await Promise.all(households.map((h) => enrichHousehold(h)));
    return jsonResponse(
      privacy.isUnlocked
        ? { privacyMode: "unlocked", valuesUnlocked: true, households: enriched }
        : {
            privacyMode: "locked",
            valuesUnlocked: false,
            households: enriched.map(redactHousehold),
          }
    );
  }

  if (request.method === "POST") {
    const body = await request.json();
    const parsed = CreateHouseholdWithIdSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(parsed.error.message, 400);
    }
    const { householdId, ...profile } = parsed.data;
    const existing = await householdRepository.get(householdId);
    if (existing) {
      return errorResponse(
        `Household "${householdId}" already exists`,
        409
      );
    }
    const created = await householdRepository.create(householdId, profile);
    return jsonResponse(await enrichHousehold(created), 201);
  }

  if (request.method === "DELETE") {
    const body = await request.json();
    const parsed = DeleteHouseholdsRequestSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(parsed.error.message, 400);
    }
    const result = await householdRepository.deleteMany(
      parsed.data.householdIds
    );
    return jsonResponse(result);
  }

  return errorResponse("Method not allowed", 405);
}

async function householdByIdHandler(
  request: HttpRequest,
  _context: InvocationContext
): Promise<HttpResponseInit> {
  const householdId = request.params.householdId;
  if (!householdId) {
    return errorResponse("householdId is required", 400);
  }

  if (request.method === "GET") {
    const household = await householdRepository.get(householdId);
    if (!household) {
      return errorResponse("Household not found", 404);
    }
    const enriched = await enrichHousehold(household);
    const privacy = await getPrivacyContext(request, householdId);
    return jsonResponse(
      privacy.isUnlocked
        ? { privacyMode: "unlocked", valuesUnlocked: true, household: enriched }
        : {
            privacyMode: "locked",
            valuesUnlocked: false,
            household: redactHousehold(enriched),
          }
    );
  }

  if (request.method === "PUT") {
    const body = await request.json();
    const parsed = UpdateHouseholdRequestSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(parsed.error.message, 400);
    }
    try {
      const updated = await householdRepository.update(householdId, parsed.data);
      return jsonResponse(await enrichHousehold(updated));
    } catch {
      return errorResponse("Household not found", 404);
    }
  }

  if (request.method === "DELETE") {
    const deleted = await householdRepository.delete(householdId);
    if (!deleted) {
      return errorResponse("Household not found", 404);
    }
    return jsonResponse({ deleted: [householdId], failed: [] });
  }

  return errorResponse("Method not allowed", 405);
}

app.http("households", {
  methods: ["GET", "POST", "DELETE"],
  authLevel: "anonymous",
  route: "households",
  handler: householdsHandler,
});

app.http("householdById", {
  methods: ["GET", "PUT", "DELETE"],
  authLevel: "anonymous",
  route: "households/{householdId}",
  handler: householdByIdHandler,
});
