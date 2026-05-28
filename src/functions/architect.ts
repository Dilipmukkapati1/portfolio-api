import {
  app,
  type HttpRequest,
  type HttpResponseInit,
  type InvocationContext,
} from "@azure/functions";
import {
  ArchitectSectorTimeframeSchema,
  UpdateArchitectPlanRequestSchema,
} from "@portfolio/contracts";
import { getAuthContext } from "../lib/auth.js";
import { errorResponse, jsonResponse } from "../lib/http.js";
import { getArchitectDashboard } from "../services/architectService.js";
import { upsertArchitectPlan } from "../sql/architectStore.js";
import { SqlUnavailableError } from "../storage/compositeStore.js";

function parseTimeframe(
  value: string | null
): "1d" | "1w" | "1m" | undefined {
  if (!value) return undefined;
  const parsed = ArchitectSectorTimeframeSchema.safeParse(value.toLowerCase());
  return parsed.success ? parsed.data : undefined;
}

async function architectDashboardHandler(
  request: HttpRequest,
  _context: InvocationContext
): Promise<HttpResponseInit> {
  const auth = getAuthContext(request);
  const url = new URL(request.url);
  const timeframe = parseTimeframe(url.searchParams.get("timeframe"));

  if (url.searchParams.get("timeframe") && !timeframe) {
    return errorResponse("timeframe must be one of: 1d, 1w, 1m", 400);
  }

  try {
    const dashboard = await getArchitectDashboard(auth.householdId, {
      timeframe,
    });
    return jsonResponse(dashboard);
  } catch (err) {
    if (err instanceof SqlUnavailableError) {
      return errorResponse(err.message, 503);
    }
    throw err;
  }
}

async function architectPlanHandler(
  request: HttpRequest,
  _context: InvocationContext
): Promise<HttpResponseInit> {
  const auth = getAuthContext(request);
  const body = UpdateArchitectPlanRequestSchema.safeParse(
    await request.json().catch(() => ({}))
  );
  if (!body.success) {
    return errorResponse(body.error.message, 400);
  }

  try {
    await upsertArchitectPlan(auth.householdId, body.data);
    const dashboard = await getArchitectDashboard(auth.householdId);
    return jsonResponse(dashboard);
  } catch (err) {
    if (err instanceof SqlUnavailableError) {
      return errorResponse(err.message, 503);
    }
    throw err;
  }
}

app.http("architectDashboard", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "architect/dashboard",
  handler: architectDashboardHandler,
});

app.http("architect", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "architect",
  handler: architectDashboardHandler,
});

app.http("architectPlan", {
  methods: ["PUT"],
  authLevel: "anonymous",
  route: "architect/plan",
  handler: architectPlanHandler,
});
