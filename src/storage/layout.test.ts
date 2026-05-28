import { describe, expect, it } from "vitest";
import {
  areTransactionsAvailable,
  buildStorageSourceMap,
} from "./layout.js";

describe("areTransactionsAvailable", () => {
  it("returns true when transactions use Azure SQL", () => {
    const sources = buildStorageSourceMap("cosmos", "azure-sql");
    expect(areTransactionsAvailable(sources)).toBe(true);
  });

  it("returns true when transactions use local storage", () => {
    const sources = buildStorageSourceMap("disk", "local");
    expect(areTransactionsAvailable(sources)).toBe(true);
  });

  it("returns false when transactions backend is unavailable", () => {
    const sources = buildStorageSourceMap("cosmos", "unavailable");
    expect(areTransactionsAvailable(sources)).toBe(false);
  });
});
