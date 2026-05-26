import {
  app,
  type HttpRequest,
  type HttpResponseInit,
  type InvocationContext,
} from "@azure/functions";
import { getAuthContext } from "../lib/auth.js";
import { errorResponse, jsonResponse } from "../lib/http.js";
import { getPrivacyContext } from "../lib/privacy.js";
import { getDashboardAnalytics } from "../services/privacyAnalyticsService.js";
import { SqlUnavailableError } from "../storage/compositeStore.js";

function mapAnalyticsError(err: unknown): HttpResponseInit | null {
  if (err instanceof SqlUnavailableError) {
    return errorResponse(err.message, 503);
  }
  if (
    err instanceof Error &&
    (err.message.includes("startDate") || err.message.includes("endDate"))
  ) {
    return errorResponse(err.message, 400);
  }
  return null;
}

async function dashboardAnalyticsHandler(
  request: HttpRequest,
  _context: InvocationContext
): Promise<HttpResponseInit> {
  const auth = getAuthContext(request);
  const privacy = await getPrivacyContext(request, auth.householdId);
  const url = new URL(request.url);

  try {
    const analytics = await getDashboardAnalytics(auth.householdId, {
      startDate: url.searchParams.get("startDate") ?? undefined,
      endDate: url.searchParams.get("endDate") ?? undefined,
    });
    return jsonResponse(privacy.isUnlocked ? analytics.unlocked : analytics.locked);
  } catch (err) {
    const mapped = mapAnalyticsError(err);
    if (mapped) return mapped;
    throw err;
  }
}

async function freedomScoreHandler(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  const response = await dashboardAnalyticsHandler(request, context);
  if (response.jsonBody && typeof response.jsonBody === "object") {
    const body = response.jsonBody as { freedomScore?: unknown };
    if (body.freedomScore) {
      return jsonResponse(body.freedomScore);
    }
  }
  return response;
}

app.http("dashboardAnalytics", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "analytics/dashboard",
  handler: dashboardAnalyticsHandler,
});

app.http("freedomScore", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "analytics/freedom-score",
  handler: freedomScoreHandler,
});
