import type { HttpResponseInit } from "@azure/functions";
import { errorResponse } from "./http.js";

function readNestedMessage(body: unknown): string | undefined {
  if (!body || typeof body !== "object") return undefined;
  const record = body as Record<string, unknown>;
  if (typeof record.message === "string" && record.message.trim()) {
    return record.message.trim();
  }
  if (typeof record.error === "string" && record.error.trim()) {
    return record.error.trim();
  }
  return undefined;
}

/** Normalize SDK and network errors that often have an empty `.message`. */
export function formatRequestError(err: unknown): string {
  if (typeof err === "string" && err.trim()) {
    return err.trim();
  }

  if (err instanceof Error && err.message.trim()) {
    return err.message.trim();
  }

  if (err && typeof err === "object") {
    const record = err as Record<string, unknown>;
    const fromBody = readNestedMessage(record.body);
    if (fromBody) return fromBody;

    if (typeof record.code === "string" && record.code.trim()) {
      const status = record.statusCode;
      return typeof status === "number"
        ? `${record.code} (HTTP ${status})`
        : record.code.trim();
    }

    if (typeof record.statusCode === "number") {
      const name =
        typeof record.name === "string" && record.name.trim()
          ? record.name.trim()
          : "Request failed";
      return `${name} (HTTP ${record.statusCode})`;
    }

    if (err instanceof Error && err.name.trim()) {
      return err.name.trim();
    }
  }

  return "Internal server error";
}

function isStorageError(err: unknown, message: string): boolean {
  const lower = message.toLowerCase();
  if (
    lower.includes("econnrefused") ||
    lower.includes("connection refused") ||
    lower.includes("getaddrinfo") ||
    lower.includes("cosmos_endpoint") ||
    lower.includes("certificate") ||
    lower.includes("azure sql is not configured") ||
    lower.includes("storage unavailable")
  ) {
    return true;
  }

  if (err && typeof err === "object") {
    const name = (err as { name?: string }).name;
    if (name === "RestError") return true;
  }

  return false;
}

export function isStorageConnectionError(err: unknown): boolean {
  return isStorageError(err, formatRequestError(err));
}

/** Map thrown validation errors from services (date range, cursors) to HTTP 400. */
export function mapClientValidationError(err: unknown): HttpResponseInit | null {
  if (!(err instanceof Error)) return null;
  const message = err.message;
  if (
    message.includes("startDate") ||
    message.includes("endDate") ||
    message.includes("cursor") ||
    message.includes("Date range")
  ) {
    return errorResponse(message, 400);
  }
  return null;
}

export function mapRequestError(err: unknown): HttpResponseInit {
  const message = formatRequestError(err);

  if (message === "Household not found") {
    return errorResponse(
      "Household not found. Shared Azure dev data uses household id dev-household — check x-household-id / DEFAULT_HOUSEHOLD_ID.",
      404
    );
  }

  if (isStorageError(err, message)) {
    return errorResponse(
      `${message}. Cosmos emulator unstable? Run npm run cosmos:restart — or the API will use disk fallback (.local-data/) until Cosmos is back.`,
      503
    );
  }

  const lower = message.toLowerCase();
  if (lower.includes("simplefin")) {
    return errorResponse(message, 502);
  }

  return errorResponse(message, 500);
}
