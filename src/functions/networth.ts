import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from "@azure/functions";
import { householdRepository } from "../cosmos/repositories/householdRepository.js";
import { accountRepository } from "../cosmos/repositories/accountRepository.js";
import { holdingRepository } from "../cosmos/repositories/holdingRepository.js";
import { getAuthContext } from "../lib/auth.js";
import { jsonResponse } from "../lib/http.js";
import { getPrivacyContext } from "../lib/privacy.js";
import {
  redactAccounts,
  redactHoldings,
  redactHousehold,
} from "../services/privacyRedact.js";

async function networthHandler(
  request: HttpRequest,
  _context: InvocationContext
): Promise<HttpResponseInit> {
  const auth = getAuthContext(request);
  const household = await householdRepository.get(auth.householdId);
  const accounts = await accountRepository.listByHousehold(auth.householdId);
  const holdings = await holdingRepository.listByHousehold(auth.householdId);
  const privacy = await getPrivacyContext(request, auth.householdId);

  if (!privacy.isUnlocked) {
    return jsonResponse({
      privacyMode: "locked",
      valuesUnlocked: false,
      summary: household ? redactHousehold(household) : null,
      accounts: redactAccounts(accounts, holdings),
      holdings: redactHoldings(holdings),
    });
  }

  return jsonResponse({
    privacyMode: "unlocked",
    valuesUnlocked: true,
    summary: household?.netWorthSummary ?? null,
    accounts,
    holdings,
  });
}

app.http("networth", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "networth",
  handler: networthHandler,
});
