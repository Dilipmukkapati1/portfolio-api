import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from "@azure/functions";
import { accountRepository } from "../cosmos/repositories/accountRepository.js";
import { holdingRepository } from "../cosmos/repositories/holdingRepository.js";
import { getAuthContext } from "../lib/auth.js";
import { jsonResponse } from "../lib/http.js";
import { getPrivacyContext } from "../lib/privacy.js";
import { redactAccounts } from "../services/privacyRedact.js";

async function accountsHandler(
  request: HttpRequest,
  _context: InvocationContext
): Promise<HttpResponseInit> {
  const auth = getAuthContext(request);
  const accounts = await accountRepository.listByHousehold(auth.householdId);
  const privacy = await getPrivacyContext(request, auth.householdId);
  const activeAccounts = accounts.filter((a) => a.isActive !== false);
  if (!privacy.isUnlocked) {
    const holdings = await holdingRepository.listByHousehold(auth.householdId);
    return jsonResponse({
      privacyMode: "locked",
      valuesUnlocked: false,
      accounts: redactAccounts(activeAccounts, holdings),
    });
  }
  return jsonResponse({
    privacyMode: "unlocked",
    valuesUnlocked: true,
    accounts: activeAccounts,
  });
}

app.http("accounts", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "accounts",
  handler: accountsHandler,
});
