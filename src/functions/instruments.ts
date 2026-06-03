import {
  app,
  type HttpRequest,
  type HttpResponseInit,
  type InvocationContext,
} from "@azure/functions";
import { jsonResponse, errorResponse } from "../lib/http.js";
import { getInstrumentDataProvider } from "../services/instrumentDataProvider.js";

async function instrumentsSearchHandler(
  request: HttpRequest,
  _context: InvocationContext
): Promise<HttpResponseInit> {
  const q = request.query.get("q") ?? "";
  const limitRaw = request.query.get("limit");
  const limit = limitRaw ? Math.min(Math.max(parseInt(limitRaw, 10) || 8, 1), 25) : 8;
  const provider = getInstrumentDataProvider();
  const results = await provider.search(q, limit);
  return jsonResponse({ results });
}

async function instrumentProfileHandler(
  request: HttpRequest,
  _context: InvocationContext
): Promise<HttpResponseInit> {
  const ticker = request.params.ticker?.trim();
  if (!ticker) {
    return errorResponse("Ticker is required", 400);
  }
  const provider = getInstrumentDataProvider();
  const profile = await provider.getProfile(ticker);
  if (!profile) {
    return errorResponse("Instrument not found", 404);
  }
  return jsonResponse({ profile });
}

app.http("instrumentsSearch", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "instruments/search",
  handler: instrumentsSearchHandler,
});

app.http("instrumentProfile", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "instruments/{ticker}/profile",
  handler: instrumentProfileHandler,
});
