import { jsonResponse } from "./http.js";
import type { PrivacyContext } from "./privacy.js";

export function respondWithPrivacy<TFull, TRedacted>(
  ctx: PrivacyContext,
  full: TFull,
  redact: (data: TFull) => TRedacted
) {
  return jsonResponse(ctx.isUnlocked ? full : redact(full));
}
