import {
  app,
  type HttpRequest,
  type HttpResponseInit,
  type InvocationContext,
} from "@azure/functions";
import {
  InstrumentProjectionRequestSchema,
  PortfolioProjectionRequestSchema,
  computeInstrumentProjection,
  computePlanProjection,
  type FundProfile,
  type PlannedInstrument,
} from "@portfolio/contracts";
import { jsonResponse, errorResponse } from "../lib/http.js";
import { getInstrumentDataProvider } from "../services/instrumentDataProvider.js";
import { stubInstrumentDataProvider } from "../services/stubInstrumentDataProvider.js";

async function instrumentProjectionHandler(
  request: HttpRequest,
  _context: InvocationContext
): Promise<HttpResponseInit> {
  const body = await request.json();
  const parsed = InstrumentProjectionRequestSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(parsed.error.message, 400);
  }

  const provider = getInstrumentDataProvider();
  const profile = provider.getProfile(parsed.data.ticker);
  if (!profile) {
    return errorResponse("Instrument not found", 404);
  }

  const projection = computeInstrumentProjection(
    profile,
    parsed.data.principal,
    parsed.data.period,
    parsed.data.reinvestDividends
  );
  if (!projection) {
    return errorResponse("Principal must be greater than zero", 400);
  }

  return jsonResponse({ projection });
}

async function portfolioProjectionHandler(
  request: HttpRequest,
  _context: InvocationContext
): Promise<HttpResponseInit> {
  const body = await request.json();
  const parsed = PortfolioProjectionRequestSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(parsed.error.message, 400);
  }

  const planItems: PlannedInstrument[] = parsed.data.instruments.map(
    (item, index) => ({
      id: `p${index}`,
      name: item.name,
      assetClass: item.assetClass,
      unit: item.unit,
      value: item.value,
      sortOrder: index,
    })
  );

  const resolveProfile = (item: PlannedInstrument): FundProfile =>
    stubInstrumentDataProvider.profileFromName(item.name);

  const projection = computePlanProjection(
    planItems,
    parsed.data.netWorth,
    resolveProfile,
    parsed.data.period,
    parsed.data.reinvestDividends
  );

  if (!projection) {
    return errorResponse("Plan must include positive allocations", 400);
  }

  return jsonResponse({ projection });
}

app.http("projectionsInstrument", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "projections/instrument",
  handler: instrumentProjectionHandler,
});

app.http("projectionsPortfolio", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "projections/portfolio",
  handler: portfolioProjectionHandler,
});
