import {
  app,
  type HttpRequest,
  type HttpResponseInit,
  type InvocationContext,
} from "@azure/functions";
import { buildOpenApiSpec } from "../openapi/spec.js";
import { buildSwaggerHtml } from "../openapi/swaggerHtml.js";

function serverUrlFromRequest(request: HttpRequest): string {
  const url = new URL(request.url);
  return `${url.protocol}//${url.host}`;
}

function corsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

async function openApiHandler(
  request: HttpRequest,
  _context: InvocationContext
): Promise<HttpResponseInit> {
  if (request.method === "OPTIONS") {
    return { status: 204, headers: corsHeaders() };
  }

  const spec = buildOpenApiSpec(serverUrlFromRequest(request));
  return {
    status: 200,
    headers: {
      ...corsHeaders(),
      "Content-Type": "application/json",
      "Cache-Control": "no-cache",
    },
    body: JSON.stringify(spec, null, 2),
  };
}

async function swaggerUiHandler(
  request: HttpRequest,
  _context: InvocationContext
): Promise<HttpResponseInit> {
  if (request.method === "OPTIONS") {
    return { status: 204, headers: corsHeaders() };
  }

  const base = serverUrlFromRequest(request);
  const openApiUrl = `${base}/api/openapi.json`;
  const html = buildSwaggerHtml(openApiUrl);

  return {
    status: 200,
    headers: {
      ...corsHeaders(),
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-cache",
    },
    body: html,
  };
}

app.http("openApiSpec", {
  methods: ["GET", "OPTIONS"],
  authLevel: "anonymous",
  route: "openapi.json",
  handler: openApiHandler,
});

app.http("swaggerUi", {
  methods: ["GET", "OPTIONS"],
  authLevel: "anonymous",
  route: "docs",
  handler: swaggerUiHandler,
});
