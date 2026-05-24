import { describe, expect, it, afterEach } from "vitest";
import {
  getConfig,
  householdEnvSuffix,
  readHouseholdEnv,
} from "./config.js";
import { getEnvSecret } from "./envSecrets.js";

describe("config", () => {
  afterEach(() => {
    delete process.env.APP_ENV;
    delete process.env.SIMPLEFIN_ACCESS_URL;
    delete process.env.SIMPLEFIN_ACCESS_URL__LOCAL_HOUSEHOLD;
    delete process.env.API_PUBLIC_BASE_URL;
  });

  it("defaults to local app env", () => {
    expect(getConfig().appEnv).toBe("local");
    expect(getConfig().apiPublicBaseUrl).toBe("http://localhost:7071");
  });

  it("builds household env suffixes", () => {
    expect(householdEnvSuffix("local-household")).toBe("LOCAL_HOUSEHOLD");
  });

  it("reads household-specific SimpleFIN access URL", () => {
    process.env.SIMPLEFIN_ACCESS_URL = "https://global@example/simplefin";
    process.env.SIMPLEFIN_ACCESS_URL__LOCAL_HOUSEHOLD =
      "https://household@example/simplefin";

    expect(readHouseholdEnv("SIMPLEFIN_ACCESS_URL", "local-household")).toBe(
      "https://household@example/simplefin"
    );
    expect(readHouseholdEnv("SIMPLEFIN_ACCESS_URL", "other-household")).toBe(
      "https://global@example/simplefin"
    );
  });

  it("maps key vault names to env secrets", () => {
    process.env.SIMPLEFIN_ACCESS_URL__LOCAL_HOUSEHOLD =
      "https://household@example/simplefin";

    expect(getEnvSecret("simplefin-access-url-local-household")).toBe(
      "https://household@example/simplefin"
    );
  });
});
