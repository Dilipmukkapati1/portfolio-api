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

function buildAssistantReply(
  autoSave: Awaited<ReturnType<typeof tryAutoSaveHouseholdFromChat>>
): string {
  if (autoSave.applied && autoSave.changes.length > 0) {
    const lines = autoSave.changes.map((c) => {
      if (c.before && c.after) return `- ${c.label}: ${c.before} → ${c.after}`;
      if (c.after) return `- ${c.label}: ${c.after}`;
      return `- ${c.label}`;
    });
    return `Updated your household profile:\n${lines.join("\n")}`;
  }

  if (!autoSave.enabled) {
    return "Auto-save is off. Turn it on to update income and contributions from chat.";
  }

  switch (autoSave.skippedReason) {
    case "privacy_locked":
      return "Unlock privacy to save income and contribution amounts.";
    case "no_profile_signals":
      return "I didn't detect income or contribution updates in that message. Try being specific, e.g. “My salary is $150,000” or “I maxed out my 401(k).”";
    case "nothing_to_update":
      return "Nothing new to save — your profile already matches what you described.";
    case "extraction_failed":
      return "I couldn't parse that update. Try a shorter message with explicit amounts or “maxed 401(k).”";
    case "extraction_not_configured":
      return "Auto-save needs OpenRouter configured locally (OPENROUTER_API_KEY). Use Edit on Members for manual updates.";
    default:
      return "No profile changes were saved.";
  }
}

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

  const autoSave = await tryAutoSaveHouseholdFromChat({
    householdId: auth.householdId,
    userMessage: parsed.data.message.trim(),
    autoSaveEnabled: isAdvisorAutoSaveEnabled(normalized),
    isUnlocked: privacy.isUnlocked,
  });

  const assistantMessage = {
    id: randomUUID(),
    role: "assistant" as const,
    content: buildAssistantReply(autoSave),
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
