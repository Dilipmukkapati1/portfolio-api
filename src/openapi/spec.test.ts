import { describe, expect, it } from "vitest";
import { buildOpenApiSpec } from "./spec.js";

describe("buildOpenApiSpec", () => {
  const spec = buildOpenApiSpec("http://localhost:7071");

  it("declares all public HTTP routes", () => {
    const paths = Object.keys(spec.paths).sort();
    expect(paths).toEqual(
      [
        "/api/accounts",
        "/api/batch/submit",
        "/api/health",
        "/api/holdings",
        "/api/household",
        "/api/integrations/simplefin/connect",
        "/api/integrations/simplefin/sync",
        "/api/integrations/snaptrade/callback",
        "/api/integrations/snaptrade/connect",
        "/api/integrations/snaptrade/webhook",
        "/api/networth",
        "/api/tax/estimate",
        "/api/tax/strategies",
        "/api/transactions",
        "/api/transactions/categorize",
      ].sort()
    );
  });

  it("uses request host as server", () => {
    const deployed = buildOpenApiSpec("https://my-api.azurewebsites.net");
    expect(deployed.servers?.[0]?.url).toBe(
      "https://my-api.azurewebsites.net"
    );
  });

  it("requires household header by default", () => {
    expect(spec.security).toEqual([{ HouseholdId: [] }]);
    expect(spec.components?.securitySchemes?.HouseholdId?.name).toBe(
      "x-household-id"
    );
  });
});
