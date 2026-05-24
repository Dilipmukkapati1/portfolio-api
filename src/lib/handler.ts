import type {
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
} from "@azure/functions";
import { getDataStore } from "../storage/index.js";
import { errorResponse } from "./http.js";

export type HttpHandler = (
  request: HttpRequest,
  context: InvocationContext
) => Promise<HttpResponseInit>;

function storageErrorMessage(err: unknown): string | null {
  if (!(err instanceof Error)) return null;
  const msg = err.message.toLowerCase();
  if (
    msg.includes("econnrefused") ||
    msg.includes("connection refused") ||
    msg.includes("cosmos_endpoint") ||
    msg.includes("getaddrinfo") ||
    msg.includes("certificate") ||
    msg.includes("resterror")
  ) {
    return err.message;
  }
  return null;
}

/** Ensures storage is initialized and maps connection failures to 503 JSON. */
export function withStorage(
  handler: (
    request: HttpRequest,
    context: InvocationContext,
    store: Awaited<ReturnType<typeof getDataStore>>
  ) => Promise<HttpResponseInit>
): HttpHandler {
  return async (request, context) => {
    try {
      const store = await getDataStore();
      return await handler(request, context, store);
    } catch (err) {
      context.error("Request failed", err);
      const storageMsg = storageErrorMessage(err);
      if (storageMsg) {
        return errorResponse(
          `Storage unavailable: ${storageMsg}. Start Cosmos emulator or set STORAGE_MODE=disk or STORAGE_MODE=memory in local.settings.json.`,
          503
        );
      }
      if (err instanceof Error && err.message === "Household not found") {
        return errorResponse(err.message, 404);
      }
      return errorResponse(
        err instanceof Error ? err.message : "Internal server error",
        500
      );
    }
  };
}
