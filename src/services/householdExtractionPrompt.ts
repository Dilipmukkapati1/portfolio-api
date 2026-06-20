import type { HouseholdAutoSavePatch } from "@portfolio/contracts";

export function buildHouseholdExtractionSystemPrompt(options: {
  snapshotJson: string;
  taxYear: number;
  limits: {
    retirement401kLimit: number;
    hsaSingleLimit: number;
    hsaFamilyLimit: number;
  };
}): string {
  const { snapshotJson, taxYear, limits } = options;
  return `You extract ONLY explicit household profile updates from the user's chat message.
Output a single JSON object matching the schema below. Use null for unchanged top-level fields.
Do NOT give advice. Do NOT invent values not stated by the user.

Current household snapshot:
${snapshotJson}

Tax year: ${taxYear}
Contribution limits (${taxYear}):
- 401(k)/403(b)/traditional IRA (per member, pre-tax cap reference): $${limits.retirement401kLimit}
- HSA single: $${limits.hsaSingleLimit}
- HSA family (MFJ or dependents): $${limits.hsaFamilyLimit}

Income types (store annual amounts; use period "monthly" if user gives monthly figures):
wages, self_employment, interest, dividends, capital_gains_short, capital_gains_long, other
Synonyms: salary/W-2/income at job → wages

Contribution types:
401k, 403b, traditional_ira, roth_ira, sep_ira, solo_401k, simple_ira, hsa, fsa_health, fsa_dependent_care, 529, employer_match
- "maxed 401k" / "max 401k" → type 401k, amountExpression "max"
- "max HSA" → type hsa, amountExpression "max"
- "half max" → amountExpression "half_max"
- Roth/529/FSA are stored but may not reduce taxes

Filing status values: single, married_filing_jointly, married_filing_separately, head_of_household, qualifying_surviving_spouse
Persona values: w2_employee, low_income, business_owner, family_with_kids

Member patches:
- matchName: existing member name, id, or label like "self"/"spouse"
- remove: true only if user explicitly asks to remove/delete a member
- updateMode "set" replaces line amount; "add" adds to existing

JSON schema (strict):
{
  "displayName": string | null,
  "primaryState": "XX" | null,
  "persona": string | null,
  "filingStatus": string | null,
  "defaultTaxYear": number | null,
  "members": [{
    "matchName": string,
    "name": string?,
    "relationship": "self"|"spouse"|"dependent"|"other"?,
    "remove": boolean?,
    "incomeSources": [{ "type": string, "amount": number?, "period": "annual"|"monthly", "updateMode": "set"|"add" }]?,
    "contributions": [{ "type": string, "amount": number?, "amountExpression": "explicit"|"max"|"half_max", "updateMode": "set"|"add" }]?
  }] | null
}`;
}

export function buildHouseholdExtractionUserMessage(message: string): string {
  return `User message:\n${message.trim()}`;
}

export function emptyAutoSavePatch(): HouseholdAutoSavePatch {
  return {};
}
