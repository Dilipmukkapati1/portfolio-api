import { app, type HttpRequest, type HttpResponseInit } from "@azure/functions";
import {
  HouseholdProfileChatRequestSchema,
  isAdvisorAutoSaveEnabled,
  normalizeHousehold,
} from "@portfolio/contracts";
import { randomUUID } from "node:crypto";
import { householdRepository } from "../cosmos/repositories/householdRepository.js";
import { getAuthContext } from "../lib/auth.js";
import { jsonResponse, errorResponse } from "../lib/http.js";
import { getPrivacyContext, requirePrivacyUnlock } from "../lib/privacy.js";
import { tryAutoSaveHouseholdFromChat } from "../services/householdAutoSaveService.js";
import { buildHouseholdProfileChatReply } from "../services/householdProfileChatReply.js";

async function profileChatHandler(
  request: HttpRequest
): Promise<HttpResponseInit> {
  const auth = getAuthContext(request);
  const locked = await requirePrivacyUnlock(request, auth.householdId);
  if (locked) return locked;

  const body = await request.json().catch(() => ({}));
  const parsed = HouseholdProfileChatRequestSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(parsed.error.message, 400);
  }

  const household = await householdRepository.get(auth.householdId);
  if (!household) {
    return errorResponse("Household not found", 404);
  }

  const normalized = normalizeHousehold(household);
  const privacy = await getPrivacyContext(request, auth.householdId);
  const userMessage = parsed.data.message.trim();

  const autoSave = await tryAutoSaveHouseholdFromChat({
    householdId: auth.householdId,
    userMessage,
    autoSaveEnabled: isAdvisorAutoSaveEnabled(normalized),
    isUnlocked: privacy.isUnlocked,
  });

  const assistantContent = await buildHouseholdProfileChatReply(
    userMessage,
    autoSave
  );

  const assistantMessage = {
    id: randomUUID(),
    role: "assistant" as const,
    content: assistantContent,
    createdAt: new Date().toISOString(),
  };

  return jsonResponse({
    message: assistantMessage,
    autoSave,
    privacyMode: privacy.isUnlocked ? "unlocked" : "locked",
    valuesUnlocked: privacy.isUnlocked,
  });
}

app.http("householdProfileChat", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "household/profile-chat",
  handler: profileChatHandler,
});
