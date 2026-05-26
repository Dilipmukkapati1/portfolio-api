import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from "@azure/functions";
import { holdingRepository } from "../cosmos/repositories/holdingRepository.js";
import { getAuthContext } from "../lib/auth.js";
import { jsonResponse } from "../lib/http.js";
import { getPrivacyContext } from "../lib/privacy.js";
import { redactHoldings } from "../services/privacyRedact.js";

async function holdingsHandler(
  request: HttpRequest,
  _context: InvocationContext
): Promise<HttpResponseInit> {
  const auth = getAuthContext(request);
  const holdings = await holdingRepository.listByHousehold(auth.householdId);
  const privacy = await getPrivacyContext(request, auth.householdId);
  return jsonResponse(
    privacy.isUnlocked
      ? { privacyMode: "unlocked", valuesUnlocked: true, holdings }
      : {
          privacyMode: "locked",
          valuesUnlocked: false,
          holdings: redactHoldings(holdings),
        }
  );
}

app.http("holdings", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "holdings",
  handler: holdingsHandler,
});
