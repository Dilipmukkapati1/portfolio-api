import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from "@azure/functions";
import { jsonResponse } from "../lib/http.js";
import { getDataStore } from "../storage/index.js";

async function healthHandler(
  _request: HttpRequest,
  _context: InvocationContext
): Promise<HttpResponseInit> {
  let storage: string = "unknown";
  try {
    const store = await getDataStore();
    storage = store.mode;
  } catch {
    storage = "unavailable";
  }
  return jsonResponse({
    status: "ok",
    service: "portfolio-api",
    storage,
    timestamp: new Date().toISOString(),
  });
}

app.http("health", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "health",
  handler: healthHandler,
});
