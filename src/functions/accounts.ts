import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from "@azure/functions";
import { accountRepository } from "../cosmos/repositories/accountRepository.js";
import { getAuthContext } from "../lib/auth.js";
import { jsonResponse } from "../lib/http.js";

async function accountsHandler(
  request: HttpRequest,
  _context: InvocationContext
): Promise<HttpResponseInit> {
  const auth = getAuthContext(request);
  const accounts = await accountRepository.listByHousehold(auth.householdId);
  return jsonResponse({
    accounts: accounts.filter((a) => a.isActive !== false),
  });
}

app.http("accounts", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "accounts",
  handler: accountsHandler,
});
