import {
  app,
  type HttpRequest,
  type HttpResponseInit,
  type InvocationContext,
} from "@azure/functions";
import { PrivacyUnlockRequestSchema } from "@portfolio/contracts";
import { getAuthContext } from "../lib/auth.js";
import { errorResponse, jsonResponse } from "../lib/http.js";
import { issuePrivacyToken, verifyPrivacyPassword } from "../lib/privacy.js";

async function privacyUnlockHandler(
  request: HttpRequest,
  _context: InvocationContext
): Promise<HttpResponseInit> {
  if (request.method !== "POST") {
    return errorResponse("Method not allowed", 405);
  }

  const parsed = PrivacyUnlockRequestSchema.safeParse(await request.json());
  if (!parsed.success) {
    return errorResponse(parsed.error.message, 400);
  }
  if (!verifyPrivacyPassword(parsed.data.password)) {
    return errorResponse("Invalid password", 401);
  }

  const auth = getAuthContext(request);
  return jsonResponse(await issuePrivacyToken(auth.householdId));
}

app.http("privacyUnlock", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "privacy/unlock",
  handler: privacyUnlockHandler,
});
