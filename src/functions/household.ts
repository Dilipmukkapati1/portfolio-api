import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from "@azure/functions";
import {
  CreateHouseholdRequestSchema,
  UpdateHouseholdRequestSchema,
} from "@portfolio/contracts";
import { householdRepository } from "../cosmos/repositories/householdRepository.js";
import { getAuthContext } from "../lib/auth.js";
import { jsonResponse, errorResponse } from "../lib/http.js";
import { getPrivacyContext } from "../lib/privacy.js";
import { enrichHousehold } from "../services/householdTaxService.js";
import { redactHousehold } from "../services/privacyRedact.js";

async function householdHandler(
  request: HttpRequest,
  _context: InvocationContext
): Promise<HttpResponseInit> {
  const auth = getAuthContext(request);

  if (request.method === "GET") {
    const household = await householdRepository.get(auth.householdId);
    if (!household) {
      return errorResponse("Household not found", 404);
    }
    const enriched = await enrichHousehold(household);
    const privacy = await getPrivacyContext(request, auth.householdId);
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
      const updated = await householdRepository.update(
        auth.householdId,
        parsed.data
      );
      return jsonResponse(await enrichHousehold(updated));
    } catch {
      const created = await householdRepository.create(
        auth.householdId,
        CreateHouseholdRequestSchema.parse({
          ...parsed.data,
          displayName: parsed.data.displayName ?? "My Household",
          primaryState: parsed.data.primaryState ?? parsed.data.state ?? "CA",
          state: parsed.data.state ?? parsed.data.primaryState ?? "CA",
          persona: parsed.data.persona ?? "w2_employee",
        })
      );
      return jsonResponse(await enrichHousehold(created));
    }
  }

  if (request.method === "POST") {
    const body = await request.json();
    const parsed = CreateHouseholdRequestSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(parsed.error.message, 400);
    }
    const existing = await householdRepository.get(auth.householdId);
    if (existing) {
      return errorResponse(
        "Household already exists for this id. Use PUT to update.",
        409
      );
    }
    const created = await householdRepository.create(
      auth.householdId,
      parsed.data
    );
    return jsonResponse(await enrichHousehold(created), 201);
  }

  return errorResponse("Method not allowed", 405);
}

app.http("household", {
  methods: ["GET", "PUT", "POST"],
  authLevel: "anonymous",
  route: "household",
  handler: householdHandler,
});
