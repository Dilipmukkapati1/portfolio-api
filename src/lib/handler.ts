import type {
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
} from "@azure/functions";
import { getDataStore, resetStorageConnection } from "../storage/index.js";
import { formatStorageSourceMap } from "../storage/layout.js";
import { isStorageConnectionError, mapRequestError } from "./errors.js";
import { executeWithStorageRetry } from "./storageRetry.js";

export type HttpHandler = (
  request: HttpRequest,
  context: InvocationContext
) => Promise<HttpResponseInit>;

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
      return await executeWithStorageRetry(async () => {
        const store = await getDataStore();
        context.log(
          `[portfolio-api] request storage sources: ${formatStorageSourceMap(store.sources)}`
        );
        return await handler(request, context, store);
      });
    } catch (err) {
      context.error("Request failed", err);
      if (isStorageConnectionError(err)) {
        resetStorageConnection();
      }
      return mapRequestError(err);
    }
  };
}
