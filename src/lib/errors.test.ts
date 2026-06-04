import { describe, expect, it } from "vitest";
import { formatRequestError, mapClientValidationError } from "./errors.js";

describe("formatRequestError", () => {
  it("uses a standard Error message", () => {
    expect(formatRequestError(new Error("SimpleFIN error 403"))).toBe(
      "SimpleFIN error 403"
    );
  });

  it("extracts Azure RestError details when message is empty", () => {
    const err = {
      name: "RestError",
      message: "",
      code: "ECONNREFUSED",
      statusCode: 503,
    };
    expect(formatRequestError(err)).toBe("ECONNREFUSED (HTTP 503)");
  });

  it("reads nested body.message from SDK errors", () => {
    const err = {
      name: "RestError",
      message: "",
      statusCode: 404,
      body: { message: "Resource Not Found" },
    };
    expect(formatRequestError(err)).toBe("Resource Not Found");
  });
});

describe("mapClientValidationError", () => {
  it("maps date range validation to 400", () => {
    const res = mapClientValidationError(
      new Error("Date range cannot exceed 366 days")
    );
    expect(res?.status).toBe(400);
  });
});
