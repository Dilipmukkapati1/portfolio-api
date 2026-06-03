import { describe, expect, it, vi } from "vitest";
import { FmpClient, FmpClientError } from "./client.js";

describe("FmpClient", () => {
  it("appends apikey and parses search results", async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [{ symbol: "VTI", name: "Vanguard Total Stock Market ETF" }],
    });

    const client = new FmpClient({ apiKey: "test-key", fetchFn });
    const rows = await client.searchSymbols("VTI", 5);

    expect(rows).toHaveLength(1);
    expect(fetchFn).toHaveBeenCalledOnce();
    const url = String(fetchFn.mock.calls[0]?.[0]);
    expect(url).toContain("/search-symbol");
    expect(url).toContain("apikey=test-key");
    expect(url).toContain("query=VTI");
  });

  it("throws on API error message body", async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ "Error Message": "Invalid API KEY." }),
    });

    const client = new FmpClient({ apiKey: "bad", fetchFn });
    await expect(client.getQuote("AAPL")).rejects.toBeInstanceOf(FmpClientError);
  });
});
