import type { AdvisorAutoSaveResult } from "@portfolio/contracts";
import {
  OpenRouterNotConfiguredError,
  openRouterChatComplete,
} from "../lib/openrouter.js";

function templateReply(autoSave: AdvisorAutoSaveResult): string {
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
      return "I didn't detect income or contribution updates in that message. Try being specific, e.g. “My salary is $150,000” or “Reshma's bonus is $7,000.”";
    case "nothing_to_update":
      return "Nothing new to save — your profile already matches what you described.";
    case "extraction_failed":
      return "I couldn't parse that update. Try naming the person and amount, e.g. “Reshma bonus is 7k” or “I maxed my 401(k).”";
    case "extraction_not_configured":
      return "Auto-save needs OpenRouter configured locally (OPENROUTER_API_KEY). Use Edit on Members for manual updates.";
    default:
      return "No profile changes were saved.";
  }
}

export async function buildHouseholdProfileChatReply(
  userMessage: string,
  autoSave: AdvisorAutoSaveResult
): Promise<string> {
  const fallback = templateReply(autoSave);

  if (!autoSave.attempted) {
    return fallback;
  }

  try {
    const { content } = await openRouterChatComplete({
      messages: [
        {
          role: "system",
          content: `You confirm household profile auto-save results in chat. Auto-save already ran; do not invent new numbers or claim changes that did not happen.

Rules:
- 1–3 short sentences, friendly and clear.
- If applied=true and changes exist: confirm what was saved using the change list (names and amounts).
- If applied=false: explain why briefly and suggest ONE concrete rephrase the user can try.
- Never give tax advice or unrelated financial planning tips.
- Do not use markdown bullets unless listing 2+ saved fields.`,
        },
        {
          role: "user",
          content: JSON.stringify(
            {
              userMessage: userMessage.trim(),
              applied: autoSave.applied,
              skippedReason: autoSave.skippedReason ?? null,
              changes: autoSave.changes,
            },
            null,
            2
          ),
        },
      ],
      maxTokens: 280,
      temperature: 0.35,
    });

    const trimmed = content.trim();
    return trimmed.length > 0 ? trimmed : fallback;
  } catch (err) {
    if (err instanceof OpenRouterNotConfiguredError) {
      return fallback;
    }
    return fallback;
  }
}
