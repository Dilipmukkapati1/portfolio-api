import {
  app,
  type HttpRequest,
  type HttpResponseInit,
  type InvocationContext,
} from "@azure/functions";
import { AnalyzerPeriodSchema } from "@portfolio/contracts";
import { errorResponse, jsonResponse } from "../lib/http.js";
import { getInstrumentAnalysis } from "../services/analyzerService.js";

function parsePeriod(
  value: string | null
): "quarterly" | "yearly" | undefined {
  if (!value) return undefined;
  const parsed = AnalyzerPeriodSchema.safeParse(value.toLowerCase());
  return parsed.success ? parsed.data : undefined;
}

async function instrumentAnalysisHandler(
  request: HttpRequest,
  _context: InvocationContext
): Promise<HttpResponseInit> {
  const symbol = request.params.symbol?.trim();
  if (!symbol) {
    return errorResponse("symbol is required", 400);
  }

  const url = new URL(request.url);
  const period = parsePeriod(url.searchParams.get("period")) ?? "quarterly";

  if (url.searchParams.get("period") && !parsePeriod(url.searchParams.get("period"))) {
    return errorResponse("period must be quarterly or yearly", 400);
  }

  const analysis = getInstrumentAnalysis(symbol, period);
  return jsonResponse(analysis);
}

app.http("analyzerInstrumentAnalysis", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "analyzer/{symbol}/instrument-analysis",
  handler: instrumentAnalysisHandler,
});
