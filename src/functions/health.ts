import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from "@azure/functions";
import { jsonResponse } from "../lib/http.js";

async function healthHandler(
  _request: HttpRequest,
  _context: InvocationContext
): Promise<HttpResponseInit> {
  return jsonResponse({
    status: "ok",
    service: "portfolio-api",
    timestamp: new Date().toISOString(),
  });
}

app.http("health", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "health",
  handler: healthHandler,
});
