import type { HouseholdAutoSavePatch } from "@portfolio/contracts";

export function buildHouseholdExtractionSystemPrompt(options: {
  snapshotJson: string;
  taxYear: number;
  limits: {
    retirement401kLimit: number;
    hsaSingleLimit: number;
    hsaFamilyLimit: number;
    fsaHealthLimit: number;
    fsaDependentCareLimit: number;
    fsaDependentCareLimitMfs: number;
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

Household caps (shared across members — amounts must sum to at most the cap):
- HSA family (MFJ or dependents): $${limits.hsaFamilyLimit}
- Dependent care FSA: $${limits.fsaDependentCareLimit} ($${limits.fsaDependentCareLimitMfs} if MFS)

Per-member caps:
- 401(k)/403(b)/traditional IRA (each person): $${limits.retirement401kLimit}
- HSA single (self-only coverage): $${limits.hsaSingleLimit}
- Health FSA (each person): $${limits.fsaHealthLimit}

Parsing rules:
- Match members by first name or full name from the snapshot (case-insensitive).
- "7k", "150k", "$7k" → multiply k/K by 1,000; m/M by 1,000,000.
- Monthly amounts: set period "monthly"; annual: period "annual" (default).
- Bonus fixed dollar: amountMode "fixed" with amount. Bonus as % of wages: amountMode "percent_of_wages" with percent.
- Phrases like "bonus is 7k", "make 7k in bonus", "7k bonus", "gets 18% bonus" must map to the named member's bonus line.

Income types (store annual amounts; use period "monthly" if user gives monthly figures):
wages, bonus, cash_income, self_employment, interest, dividends, capital_gains_short, capital_gains_long, other
Synonyms: salary/W-2/income at job → wages
Bonus: use amountMode "percent_of_wages" with percent, or amountMode "fixed" with amount
cash_income: taxable cash payments → otherIncome on tax return

Contribution types:
401k, 403b, traditional_ira, roth_ira, sep_ira, solo_401k, simple_ira, hsa, fsa_health, fsa_dependent_care, 529, employer_match
- "maxed 401k" / "max 401k" → type 401k, amountExpression "max"
- "max HSA" → type hsa, amountExpression "max" (household cap under family coverage)
- "max dependent care FSA" / "max DCFSA" → type fsa_dependent_care, amountExpression "max" (household cap)
- "half max" → amountExpression "half_max"
- employer_match: amountMode "fixed" | "percent_of_wages" | "percent_of_wages_and_bonus" with percent or amount
- Roth/529/FSA health are stored; employer_match is informational

Dependents (kids) are members with relationship "dependent".
Capture child income on the dependent member, not on parents.
Do not assign retirement/HSA/DCFSA contributions to dependents.

liquidCashSnapshot: household liquid cash balance for planning (not taxable income).

Filing status values: single, married_filing_jointly, married_filing_separately, head_of_household, qualifying_surviving_spouse
Persona values: w2_employee, low_income, business_owner, family_with_kids

Member patches:
- matchName: existing member name, id, or label like "self"/"spouse"
- remove: true only if user explicitly asks to remove/delete a member
- updateMode "set" replaces line amount; "add" adds to existing

Examples (output shape only — use actual snapshot member names):
User: "reshma bonus is 7k"
→ members: [{ "matchName": "Reshma", "incomeSources": [{ "type": "bonus", "amount": 7000, "amountMode": "fixed", "period": "annual", "updateMode": "set" }] }]

User: "dilip get 18% bonus on base salary"
→ members: [{ "matchName": "Dilip", "incomeSources": [{ "type": "bonus", "amountMode": "percent_of_wages", "percent": 18, "period": "annual", "updateMode": "set" }] }]

User: "I maxed out my 401k"
→ members: [{ "matchName": "self", "contributions": [{ "type": "401k", "amountExpression": "max", "updateMode": "set" }] }]

JSON schema (strict):
{
  "displayName": string | null,
  "primaryState": "XX" | null,
  "persona": string | null,
  "filingStatus": string | null,
  "defaultTaxYear": number | null,
  "liquidCashSnapshot": number | null,
  "members": [{
    "matchName": string,
    "name": string?,
    "relationship": "self"|"spouse"|"dependent"|"other"?,
    "remove": boolean?,
    "incomeSources": [{ "type": string, "amount": number?, "period": "annual"|"monthly", "updateMode": "set"|"add", "amountMode": "fixed"|"percent_of_wages"?, "percent": number? }]?,
    "contributions": [{ "type": string, "amount": number?, "amountExpression": "explicit"|"max"|"half_max", "updateMode": "set"|"add", "amountMode": "fixed"|"percent_of_wages"|"percent_of_wages_and_bonus"?, "percent": number? }]?
  }] | null
}`;
}

export function buildHouseholdExtractionUserMessage(message: string): string {
  return `Extract profile updates from this message. Return JSON only.

User message:
${message.trim()}`;
}

export function emptyAutoSavePatch(): HouseholdAutoSavePatch {
  return {};
}
