import { describe, expect, it } from "vitest";
import {
  mapProviderCategory,
  readSimpleFinProviderCategory,
} from "./categoryMapping.js";

describe("categoryMapping", () => {
  it("maps known provider labels", () => {
    expect(mapProviderCategory("restaurants")).toBe("food");
    expect(mapProviderCategory("TRANSFER")).toBe("transfer");
  });

  it("returns null for unknown labels", () => {
    expect(mapProviderCategory("miscellaneous xyz")).toBeNull();
  });

  it("reads extra.category from SimpleFIN payload", () => {
    expect(readSimpleFinProviderCategory({ category: " groceries " })).toBe(
      "groceries"
    );
  });
});
