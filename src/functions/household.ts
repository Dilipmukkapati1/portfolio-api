import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from "@azure/functions";
import {
  CreateHouseholdRequestSchema,
  UpdateHouseholdRequestSchema,
} from "@portfolio/contracts";
import { householdRepository } from "../cosmos/repositories/householdRepository.js";
import { getAuthContext } from "../lib/auth.js";
import { jsonResponse, errorResponse } from "../lib/http.js";

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
    return jsonResponse(household);
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
      return jsonResponse(updated);
    } catch {
      const created = await householdRepository.create(
        auth.householdId,
        CreateHouseholdRequestSchema.parse({
          ...parsed.data,
          displayName: parsed.data.displayName ?? "My Household",
          state: parsed.data.state ?? "CA",
          filingStatus: parsed.data.filingStatus ?? "single",
          persona: parsed.data.persona ?? "w2_employee",
        })
      );
      return jsonResponse(created);
    }
  }

  if (request.method === "POST") {
    const body = await request.json();
    const parsed = CreateHouseholdRequestSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(parsed.error.message, 400);
    }
    const created = await householdRepository.create(
      auth.householdId,
      parsed.data
    );
    return jsonResponse(created, 201);
  }

  return errorResponse("Method not allowed", 405);
}

app.http("household", {
  methods: ["GET", "PUT", "POST"],
  authLevel: "anonymous",
  route: "household",
  handler: householdHandler,
});
