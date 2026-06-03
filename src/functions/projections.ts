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
  tickerFromName,
  type FundProfile,
  type PlannedInstrument,
} from "@portfolio/contracts";
import { jsonResponse, errorResponse } from "../lib/http.js";
import { getInstrumentDataProvider } from "../services/instrumentDataProvider.js";

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
  const profile = await provider.getProfile(parsed.data.ticker);
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

  const provider = getInstrumentDataProvider();
  const profileByTicker = new Map<string, FundProfile>();
  await Promise.all(
    planItems.map(async (item) => {
      const ticker = tickerFromName(item.name).toUpperCase();
      if (profileByTicker.has(ticker)) return;
      const profile = await provider.getProfile(ticker);
      if (profile) profileByTicker.set(ticker, profile);
    })
  );

  const resolveProfile = (item: PlannedInstrument): FundProfile => {
    const ticker = tickerFromName(item.name).toUpperCase();
    return (
      profileByTicker.get(ticker) ?? {
        ticker,
        return1y: 0.08,
        return3y: 0.08,
        return5y: 0.08,
        annualizedReturn: 0.08,
        dividendYield: 0,
        yearsSinceInception: 8,
        inceptionLabel: "Est.",
        expenseRatio: 0,
        feeKind: "none",
        dataSource: "estimated",
      }
    );
  };

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
