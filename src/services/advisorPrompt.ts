import type { AdvisorPageContext } from "@portfolio/contracts";
import { getAdvisorPageDefinition } from "@portfolio/contracts";

export const ADVISOR_DISCLAIMER =
  "Educational estimates only. Not tax, legal, or investment advice. Consult a qualified professional before making financial decisions.";

function formatSnapshotValue(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return "(none)";
    return value
      .map((item) => {
        if (item && typeof item === "object") {
          return Object.entries(item as Record<string, unknown>)
            .filter(([, v]) => v != null && v !== "")
            .map(([k, v]) => `${k}: ${formatSnapshotValue(v)}`)
            .join(", ");
        }
        return formatSnapshotValue(item);
      })
      .join("; ");
  }
  if (typeof value === "object") {
    return JSON.stringify(value);
  }
  return String(value);
}

export function formatPageContextForPrompt(pageContext: AdvisorPageContext): string {
  const def = getAdvisorPageDefinition(pageContext.sourceRoute);
  const lines: string[] = [
    `Source page: ${pageContext.sourceLabel} (${pageContext.sourceRoute})`,
    `Purpose: ${pageContext.pageDescription}`,
    `In-scope topics: ${pageContext.scopeTopics.join(", ")}`,
    `Captured at: ${pageContext.snapshotCapturedAt}`,
  ];

  const snapshot = pageContext.pageSnapshot ?? {};
  const snapshotKeys = Object.keys(snapshot);
  if (snapshotKeys.length > 0) {
    lines.push("What the user was viewing on that page:");
    for (const key of def.snapshotFields.length ? def.snapshotFields : snapshotKeys) {
      if (!(key in snapshot)) continue;
      const formatted = formatSnapshotValue(snapshot[key]);
      if (formatted) {
        lines.push(`- ${key.replace(/([A-Z])/g, " $1").toLowerCase()}: ${formatted}`);
      }
    }
    for (const key of snapshotKeys) {
      if (def.snapshotFields.includes(key)) continue;
      const formatted = formatSnapshotValue(snapshot[key]);
      if (formatted) {
        lines.push(`- ${key}: ${formatted}`);
      }
    }
  } else {
    lines.push("Page snapshot: (no live view data — use household context only)");
  }

  return lines.join("\n");
}

export function buildPageContextUserPrefix(pageContext: AdvisorPageContext): string {
  return `[Context — user opened this chat from their portfolio app]\n${formatPageContextForPrompt(pageContext)}`;
}

export function trimHouseholdContextForPrompt(
  householdContext: Record<string, unknown>
): Record<string, unknown> {
  const strategies = Array.isArray(householdContext.strategies)
    ? householdContext.strategies.slice(0, 5)
    : householdContext.strategies;

  const topHoldings = Array.isArray(householdContext.topHoldings)
    ? householdContext.topHoldings.slice(0, 3)
    : householdContext.topHoldings;

  return {
    household: householdContext.household,
    members: householdContext.members,
    taxProfile: householdContext.taxProfile,
    taxEstimate: householdContext.taxEstimate,
    strategies,
    accountsByTreatment: householdContext.accountsByTreatment,
    holdingsCount: householdContext.holdingsCount,
    unrealizedGainLoss: householdContext.unrealizedGainLoss,
    topHoldings,
    dataFreshness: householdContext.dataFreshness,
  };
}

export function buildAdvisorSystemPrompt(params: {
  pageContext?: AdvisorPageContext;
  householdContext: Record<string, unknown>;
  isUnlocked: boolean;
  includePageSnapshot?: boolean;
}): string {
  const {
    pageContext,
    householdContext,
    isUnlocked,
    includePageSnapshot = false,
  } = params;
  const route = pageContext?.sourceRoute ?? "/advisor";
  const def = getAdvisorPageDefinition(route);
  const scope = pageContext?.scopeTopics ?? def.scopeTopics;
  const outOfScope = pageContext?.outOfScopeHint ?? def.outOfScopeHint;
  const pageDescription = pageContext?.pageDescription ?? def.pageDescription;

  const pageSection = pageContext
    ? `## User's current page
${formatPageContextForPrompt(pageContext)}
${includePageSnapshot ? "Use the page snapshot above — especially open strategies, contribution room, and tab/view — when answering the first message." : "This conversation started from the page above; stay relevant to that context when helpful."}

`
    : "";

  const trimmedHousehold = trimHouseholdContextForPrompt(householdContext);

  return `You are a tax and financial planning advisor (CFP + CPA perspective) helping a user with their personal portfolio data.

## Your role
Give practical, data-grounded guidance on tax reduction and deferral. Federal tax only — state tax is not computed here.

${pageSection}## Conversation scope
Route: ${route}
Page purpose: ${pageDescription}
In-scope topics: ${scope.join(", ")}
Out-of-scope: ${outOfScope}

## Household data (authoritative)
Privacy: ${isUnlocked ? "unlocked — dollar amounts included" : "locked — amounts redacted"}
${JSON.stringify(trimmedHousehold, null, 2)}

## Response rules (strict)
1. Write ONLY the final answer for the user. Never show internal reasoning, deliberation, or headers like "Considering…" / "Evaluating…".
2. Keep responses concise: target under 200 words unless the user asks for detail.
3. Do not repeat the same point. Say each recommendation once.
4. Ground answers in household data${includePageSnapshot ? " and the page snapshot" : ""}. Flag missing data briefly under Data gaps when needed.
5. Stay in scope; for off-topic questions, redirect warmly using the out-of-scope hint.
6. Never claim to file returns or guarantee outcomes.
7. Household income and contributions are updated on the Household page, not in this chat. Do not claim you saved or updated the user's profile.
8. End with the disclaimer on its own line: "${ADVISOR_DISCLAIMER}"

## Required response format (markdown)
Use exactly these sections. Omit a section only if it does not apply.

## Summary
1–2 sentences with the direct answer.

## Recommendation
- **Action:** primary step
- **Impact:** estimated savings or tax effect when data supports it (otherwise "unknown")
- **Why:** one short sentence

## Next steps
1. First concrete step
2. Second step (optional)
3. Third step (optional — max 3 total)

## Data gaps
Only if key inputs are missing — bullet list, max 3 items.`;
}

export function buildAdvisorMessages(params: {
  systemPrompt: string;
  history: Array<{ role: "user" | "assistant"; content: string }>;
  userMessage: string;
  pageContextPrefix?: string;
}): Array<{ role: "system" | "user" | "assistant"; content: string }> {
  const userContent = params.pageContextPrefix
    ? `${params.pageContextPrefix}\n\n---\n\n${params.userMessage}`
    : params.userMessage;

  return [
    { role: "system", content: params.systemPrompt },
    ...params.history.map((m) => ({ role: m.role, content: m.content })),
    { role: "user", content: userContent },
  ];
}

export function truncateTitle(message: string, max = 60): string {
  const trimmed = message.trim().replace(/\s+/g, " ");
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1)}…`;
}
