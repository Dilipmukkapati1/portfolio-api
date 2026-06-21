import { getConfig } from "./config.js";

/** OpenRouter auto-routing when OPENROUTER_MODEL is unset (not a user config default). */
const OPENROUTER_AUTO_MODEL = "openrouter/auto";

export class OpenRouterNotConfiguredError extends Error {
  readonly code = "OPENROUTER_NOT_CONFIGURED";

  constructor() {
    super("OpenRouter API key is not configured");
    this.name = "OpenRouterNotConfiguredError";
  }
}

export class OpenRouterEmptyResponseError extends Error {
  readonly code = "OPENROUTER_EMPTY_RESPONSE";

  constructor(detail: string) {
    super(`OpenRouter returned an empty response (${detail})`);
    this.name = "OpenRouterEmptyResponseError";
  }
}

export interface OpenRouterMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface OpenRouterChatOptions {
  messages: OpenRouterMessage[];
  maxTokens?: number;
  temperature?: number;
  model?: string;
}

export interface OpenRouterChatResult {
  content: string;
  model: string;
}

type ContentPart = string | { type?: string; text?: string };

type OpenRouterChoiceMessage = {
  content?: string | ContentPart[] | null;
  refusal?: string | null;
  reasoning?: string | null;
};

type OpenRouterCompletionResponse = {
  model?: string;
  error?: { message?: string; code?: string | number };
  choices?: Array<{
    message?: OpenRouterChoiceMessage;
    finish_reason?: string | null;
    native_finish_reason?: string | null;
  }>;
};

function openRouterReferer(webAppUrl: string): string {
  try {
    const { hostname } = new URL(webAppUrl);
    if (hostname === "localhost" || hostname === "127.0.0.1") {
      return "http://localhost";
    }
    return webAppUrl;
  } catch {
    return "http://localhost";
  }
}

export function extractOpenRouterMessageContent(
  message: OpenRouterChoiceMessage | undefined
): string | null {
  if (!message) return null;

  if (typeof message.refusal === "string" && message.refusal.trim()) {
    return message.refusal.trim();
  }

  const content = message.content;
  if (typeof content === "string" && content.trim()) {
    return content.trim();
  }

  if (Array.isArray(content)) {
    const text = content
      .map((part) => {
        if (typeof part === "string") return part;
        return part.text ?? "";
      })
      .join("")
      .trim();
    if (text) return text;
  }

  return null;
}

export async function openRouterChatComplete(
  options: OpenRouterChatOptions
): Promise<OpenRouterChatResult> {
  const { openRouter, webAppUrl } = getConfig();
  const apiKey = openRouter.apiKey;
  if (!apiKey) {
    throw new OpenRouterNotConfiguredError();
  }

  const model = options.model ?? openRouter.model ?? OPENROUTER_AUTO_MODEL;
  const referer = openRouterReferer(webAppUrl);

  const body = {
    model,
    messages: options.messages,
    max_tokens: options.maxTokens ?? 1500,
    temperature: options.temperature ?? 0.2,
    stream: false,
    include_reasoning: false,
    // Prefer non-reasoning models via auto-router; exclude hidden reasoning tokens.
    reasoning: { effort: "none", exclude: true },
  };

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": referer,
      Referer: referer,
      "X-Title": "Portfolio Tax Advisor",
    },
    body: JSON.stringify(body),
  });

  const rawText = await res.text();
  let data: OpenRouterCompletionResponse;
  try {
    data = JSON.parse(rawText) as OpenRouterCompletionResponse;
  } catch {
    throw new Error(
      `OpenRouter returned non-JSON response (${res.status}): ${rawText.slice(0, 200)}`
    );
  }

  if (!res.ok) {
    const apiMessage = data.error?.message ?? rawText.slice(0, 300);
    throw new Error(`OpenRouter request failed (${res.status}): ${apiMessage}`);
  }

  if (data.error?.message) {
    throw new Error(`OpenRouter error: ${data.error.message}`);
  }

  const choice = data.choices?.[0];
  const content = extractOpenRouterMessageContent(choice?.message);
  if (!content) {
    const finish = choice?.finish_reason ?? "none";
    const native = choice?.native_finish_reason;
    const detail = native
      ? `model=${data.model ?? model}, finish_reason=${finish}, native=${native}`
      : `model=${data.model ?? model}, finish_reason=${finish}`;
    throw new OpenRouterEmptyResponseError(detail);
  }

  return { content, model: data.model ?? model };
}

function stripJsonFence(text: string): string {
  const trimmed = text.trim();
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch?.[1]) return fenceMatch[1].trim();
  return trimmed;
}

/** Pull the first JSON object from model output (handles prose wrappers). */
export function extractJsonObjectFromText(text: string): string {
  const unfenced = stripJsonFence(text);
  const start = unfenced.indexOf("{");
  const end = unfenced.lastIndexOf("}");
  if (start >= 0 && end > start) {
    return unfenced.slice(start, end + 1);
  }
  return unfenced;
}

export async function openRouterExtractJson<T>(
  options: Omit<OpenRouterChatOptions, "maxTokens" | "temperature"> & {
    parse: (value: unknown) => T;
  }
): Promise<T> {
  const { openRouter } = getConfig();
  const result = await openRouterChatComplete({
    ...options,
    model: options.model ?? openRouter.extractionModel,
    maxTokens: 900,
    temperature: 0,
  });
  const raw = extractJsonObjectFromText(result.content);
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`Extraction model returned invalid JSON: ${raw.slice(0, 200)}`);
  }
  return options.parse(parsed);
}
