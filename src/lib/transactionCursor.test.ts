import { describe, expect, it } from "vitest";
import {
  decodeTransactionCursor,
  encodeTransactionCursor,
} from "./transactionCursor.js";

describe("transactionCursor", () => {
  it("round-trips date and id", () => {
    const encoded = encodeTransactionCursor({
      date: "2026-05-01",
      id: "hid:acct:txn-1",
    });
    expect(decodeTransactionCursor(encoded)).toEqual({
      date: "2026-05-01",
      id: "hid:acct:txn-1",
    });
  });

  it("returns null for invalid cursor", () => {
    expect(decodeTransactionCursor("not-valid")).toBeNull();
  });
});
