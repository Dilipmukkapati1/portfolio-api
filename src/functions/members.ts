import {
  app,
  type HttpRequest,
  type HttpResponseInit,
  type InvocationContext,
} from "@azure/functions";
import {
  CreateMemberRequestSchema,
  SaveMembersRequestSchema,
  UpdateMemberRequestSchema,
} from "@portfolio/contracts";
import { memberRepository } from "../cosmos/repositories/memberRepository.js";
import { getAuthContext } from "../lib/auth.js";
import { jsonResponse, errorResponse } from "../lib/http.js";
import { recomputeTaxProfile } from "../services/householdTaxService.js";
import { defaultTaxYear } from "@portfolio/contracts";
import { householdRepository } from "../cosmos/repositories/householdRepository.js";

function resolveHouseholdId(
  request: HttpRequest,
  paramId?: string
): string {
  if (paramId) return paramId;
  return getAuthContext(request).householdId;
}

async function membersListHandler(
  request: HttpRequest,
  _context: InvocationContext
): Promise<HttpResponseInit> {
  const householdId = resolveHouseholdId(
    request,
    request.params.householdId
  );
  const members = await memberRepository.listByHousehold(householdId);
  return jsonResponse({ members });
}

async function memberCreateHandler(
  request: HttpRequest,
  _context: InvocationContext
): Promise<HttpResponseInit> {
  const householdId = resolveHouseholdId(
    request,
    request.params.householdId
  );
  const body = await request.json();
  const parsed = CreateMemberRequestSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(parsed.error.message, 400);
  }
  const member = await memberRepository.create(householdId, parsed.data);
  const household = await householdRepository.get(householdId);
  if (household) {
    await recomputeTaxProfile(householdId, defaultTaxYear(household));
  }
  return jsonResponse(member, 201);
}

async function membersBulkHandler(
  request: HttpRequest,
  _context: InvocationContext
): Promise<HttpResponseInit> {
  const householdId = resolveHouseholdId(
    request,
    request.params.householdId
  );
  const body = await request.json();
  const parsed = SaveMembersRequestSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(parsed.error.message, 400);
  }
  const members = await memberRepository.replaceAll(householdId, parsed.data);
  const household = await householdRepository.get(householdId);
  if (household) {
    await recomputeTaxProfile(householdId, defaultTaxYear(household));
  }
  return jsonResponse({ members });
}

async function memberByIdHandler(
  request: HttpRequest,
  _context: InvocationContext
): Promise<HttpResponseInit> {
  const householdId = resolveHouseholdId(
    request,
    request.params.householdId
  );
  const memberId = request.params.memberId;
  if (!memberId) {
    return errorResponse("memberId is required", 400);
  }

  if (request.method === "GET") {
    const member = await memberRepository.get(householdId, memberId);
    if (!member) return errorResponse("Member not found", 404);
    return jsonResponse(member);
  }

  if (request.method === "PUT") {
    const body = await request.json();
    const parsed = UpdateMemberRequestSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(parsed.error.message, 400);
    }
    try {
      const updated = await memberRepository.update(
        householdId,
        memberId,
        parsed.data
      );
      const household = await householdRepository.get(householdId);
      if (household) {
        await recomputeTaxProfile(householdId, defaultTaxYear(household));
      }
      return jsonResponse(updated);
    } catch {
      return errorResponse("Member not found", 404);
    }
  }

  if (request.method === "DELETE") {
    const deleted = await memberRepository.delete(householdId, memberId);
    if (!deleted) return errorResponse("Member not found", 404);
    const household = await householdRepository.get(householdId);
    if (household) {
      await recomputeTaxProfile(householdId, defaultTaxYear(household));
    }
    return jsonResponse({ deleted: true });
  }

  return errorResponse("Method not allowed", 405);
}

app.http("membersAuth", {
  methods: ["GET", "POST", "PUT"],
  authLevel: "anonymous",
  route: "members",
  handler: async (request, context) => {
    if (request.method === "GET") {
      return membersListHandler(request, context);
    }
    if (request.method === "POST") {
      return memberCreateHandler(request, context);
    }
    if (request.method === "PUT") {
      return membersBulkHandler(request, context);
    }
    return errorResponse("Method not allowed", 405);
  },
});

app.http("membersByHousehold", {
  methods: ["GET", "POST", "PUT"],
  authLevel: "anonymous",
  route: "households/{householdId}/members",
  handler: async (request, context) => {
    if (request.method === "GET") {
      return membersListHandler(request, context);
    }
    if (request.method === "POST") {
      return memberCreateHandler(request, context);
    }
    if (request.method === "PUT") {
      return membersBulkHandler(request, context);
    }
    return errorResponse("Method not allowed", 405);
  },
});

app.http("memberByIdAuth", {
  methods: ["GET", "PUT", "DELETE"],
  authLevel: "anonymous",
  route: "members/{memberId}",
  handler: (request, context) => memberByIdHandler(request, context),
});

app.http("memberById", {
  methods: ["GET", "PUT", "DELETE"],
  authLevel: "anonymous",
  route: "households/{householdId}/members/{memberId}",
  handler: (request, context) => memberByIdHandler(request, context),
});
