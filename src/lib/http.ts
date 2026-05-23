import type { HttpResponseInit } from "@azure/functions";

export function jsonResponse(
  body: unknown,
  status = 200
): HttpResponseInit {
  return {
    status,
    headers: { "Content-Type": "application/json" },
    jsonBody: body,
  };
}

export function errorResponse(
  message: string,
  status = 400
): HttpResponseInit {
  return jsonResponse({ error: message }, status);
}
