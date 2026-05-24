import { describe, expect, it } from "vitest";
import {
  decodeSetupToken,
  extractSimpleFinHoldings,
  isNonFatalSimpleFinError,
  partitionSimpleFinErrors,
  parseSimpleFinAccessUrl,
} from "./client.js";

describe("decodeSetupToken", () => {
  it("decodes a base64 claim URL", () => {
    const token =
      "aHR0cHM6Ly9iZXRhLWJyaWRnZS5zaW1wbGVmaW4ub3JnL3NpbXBsZWZpbi9jbGFpbS9ERU1PLXYyLTM5QjU1OERDRkZBNkMyQUZCNkE2";
    expect(decodeSetupToken(token)).toBe(
      "https://beta-bridge.simplefin.org/simplefin/claim/DEMO-v2-39B558DCFFA6C2AFB6A6"
    );
  });

  it("accepts a pasted claim URL", () => {
    const url =
      "https://beta-bridge.simplefin.org/simplefin/claim/DEMO-v2-39B558DCFFA6C2AFB6A6";
    expect(decodeSetupToken(url)).toBe(url);
  });

  it("strips whitespace from pasted tokens", () => {
    const token =
      "aHR0cHM6Ly9iZXRhLWJyaWRnZS5zaW1wbGVmaW4ub3JnL3NpbXBsZWZpbi9jbGFpbS9ERU1PLXYyLTM5QjU1OERDRkZBNkMyQUZCNkE2";
    expect(decodeSetupToken(`  ${token}\n`)).toBe(
      "https://beta-bridge.simplefin.org/simplefin/claim/DEMO-v2-39B558DCFFA6C2AFB6A6"
    );
  });
});

describe("parseSimpleFinAccessUrl", () => {
  it("strips embedded credentials for fetch", () => {
    const parsed = parseSimpleFinAccessUrl(
      "https://demo:demo@beta-bridge.simplefin.org/simplefin"
    );
    expect(parsed.baseUrl).toBe("https://beta-bridge.simplefin.org/simplefin");
    expect(parsed.authorization).toBe(
      `Basic ${Buffer.from("demo:demo").toString("base64")}`
    );
  });

  it("rejects claim URLs mistaken for access URLs", () => {
    expect(() =>
      parseSimpleFinAccessUrl(
        "https://beta-bridge.simplefin.org/simplefin/claim/DEMO-v2-abc"
      )
    ).toThrow(/setup\/claim URL/i);
  });

  it("rejects setup token stored as URL credentials", () => {
    const token =
      "aHR0cHM6Ly9iZXRhLWJyaWRnZS5zaW1wbGVmaW4ub3JnL3NpbXBsZWZpbi9jbGFpbS9ERU1PLXYyLTBCODYwMTZGNkRDMDA3RUMzREIx";
    expect(() =>
      parseSimpleFinAccessUrl(
        `https://${token}@beta-bridge.simplefin.org/simplefin/claim/DEMO-v2-0B86016F6DC007EC3DB1`
      )
    ).toThrow(/setup\/claim URL|setup token was stored/i);
  });
});

describe("extractSimpleFinHoldings", () => {
  it("merges top-level and extra holdings without duplicates", () => {
    const account = {
      id: "1",
      name: "Brokerage",
      balance: "1000",
      currency: "USD",
      holdings: [
        {
          id: "h1",
          symbol: "VOO",
          shares: "10",
          market_value: "4000",
        },
      ],
      extra: {
        holdings: [
          {
            id: "h1",
            symbol: "VOO",
            shares: "10",
            market_value: "4000",
          },
          {
            id: "h2",
            symbol: "AAPL",
            shares: "5",
            market_value: "1000",
          },
        ],
      },
    };
    const holdings = extractSimpleFinHoldings(account);
    expect(holdings).toHaveLength(2);
    expect(holdings.map((h) => h.symbol)).toEqual(["VOO", "AAPL"]);
  });
});

describe("partitionSimpleFinErrors", () => {
  it("treats date-range cap notices as informational", () => {
    const capped = {
      msg: "Requested date range exceeds limit of 90 days and was capped.",
    };
    expect(isNonFatalSimpleFinError(capped)).toBe(true);

    const { fatal, informational } = partitionSimpleFinErrors([capped]);
    expect(fatal).toEqual([]);
    expect(informational).toEqual([capped]);
  });

  it("treats recommended-range notices as informational", () => {
    const recommended = {
      msg: "Requested date range exceeds recommended range of 45 days. In the future, this may be capped.",
    };
    expect(isNonFatalSimpleFinError(recommended)).toBe(true);

    const { fatal, informational } = partitionSimpleFinErrors([recommended]);
    expect(fatal).toEqual([]);
    expect(informational).toEqual([recommended]);
  });

  it("keeps real errors as fatal", () => {
    const authError = { msg: "Invalid credentials" };
    expect(isNonFatalSimpleFinError(authError)).toBe(false);

    const { fatal, informational } = partitionSimpleFinErrors([authError]);
    expect(fatal).toEqual([authError]);
    expect(informational).toEqual([]);
  });
});
