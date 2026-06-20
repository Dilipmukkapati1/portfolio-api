import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from "@azure/functions";
import {
  AdvisorChatRequestSchema,
  AdvisorConversationSummarySchema,
  defaultTaxYear,
  normalizeHousehold,
  type AdvisorConversation,
  type AdvisorConversationSummary,
  type AdvisorMessage,
} from "@portfolio/contracts";
import { randomUUID } from "node:crypto";
import { advisorConversationRepository } from "../cosmos/repositories/advisorConversationRepository.js";
import { householdRepository } from "../cosmos/repositories/householdRepository.js";
import { getAuthContext } from "../lib/auth.js";
import { jsonResponse, errorResponse } from "../lib/http.js";
import {
  OpenRouterNotConfiguredError,
  openRouterChatComplete,
} from "../lib/openrouter.js";
import { getPrivacyContext } from "../lib/privacy.js";
import {
  buildAdvisorHouseholdContext,
  resolvePageContext,
} from "../services/advisorContextService.js";
import {
  ADVISOR_DISCLAIMER,
  buildAdvisorMessages,
  buildAdvisorSystemPrompt,
  buildPageContextUserPrefix,
  truncateTitle,
} from "../services/advisorPrompt.js";

const MAX_HISTORY_MESSAGES = 20;

function toSummary(conversation: AdvisorConversation): AdvisorConversationSummary {
  return AdvisorConversationSummarySchema.parse({
    id: conversation.id,
    title: conversation.title,
    sourceRoute: conversation.pageContext?.sourceRoute,
    sourceLabel: conversation.pageContext?.sourceLabel,
    messageCount: conversation.messages.length,
    updatedAt: conversation.updatedAt,
  });
}

async function listConversationsHandler(
  request: HttpRequest,
  _context: InvocationContext
): Promise<HttpResponseInit> {
  const auth = getAuthContext(request);
  const conversations = await advisorConversationRepository.listByHousehold(
    auth.householdId
  );
  return jsonResponse({
    conversations: conversations.map(toSummary),
  });
}

async function getConversationHandler(
  request: HttpRequest,
  _context: InvocationContext
): Promise<HttpResponseInit> {
  const auth = getAuthContext(request);
  const conversationId = request.params.id;
  if (!conversationId) return errorResponse("Conversation id required", 400);

  const conversation = await advisorConversationRepository.get(
    auth.householdId,
    conversationId
  );
  if (!conversation) return errorResponse("Conversation not found", 404);
  return jsonResponse({ conversation });
}

async function deleteConversationHandler(
  request: HttpRequest,
  _context: InvocationContext
): Promise<HttpResponseInit> {
  const auth = getAuthContext(request);
  const conversationId = request.params.id;
  if (!conversationId) return errorResponse("Conversation id required", 400);

  const deleted = await advisorConversationRepository.delete(
    auth.householdId,
    conversationId
  );
  if (!deleted) return errorResponse("Conversation not found", 404);
  return jsonResponse({ deleted: true });
}

async function chatHandler(
  request: HttpRequest,
  _context: InvocationContext
): Promise<HttpResponseInit> {
  const auth = getAuthContext(request);
  const body = await request.json().catch(() => ({}));
  const parsed = AdvisorChatRequestSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(parsed.error.message, 400);
  }

  const privacy = await getPrivacyContext(request, auth.householdId);
  const household = await householdRepository.get(auth.householdId);
  if (!household) return errorResponse("Household not found", 404);

  const normalized = normalizeHousehold(household);
  const taxYear = defaultTaxYear(normalized);

  const isEdit = Boolean(parsed.data.editMessageId);

  if (isEdit && !parsed.data.conversationId) {
    return errorResponse("conversationId is required when editing a message", 400);
  }

  let conversation: AdvisorConversation | null = null;
  if (parsed.data.conversationId) {
    conversation = await advisorConversationRepository.get(
      auth.householdId,
      parsed.data.conversationId
    );
    if (!conversation) return errorResponse("Conversation not found", 404);
  }

  if (isEdit && !conversation) {
    return errorResponse("Conversation not found", 404);
  }

  const isNewConversation = !conversation;
  const pageContext = isNewConversation
    ? resolvePageContext(parsed.data.pageContext)
    : resolvePageContext(conversation!.pageContext);

  const now = new Date().toISOString();
  if (!conversation) {
    conversation = {
      id: randomUUID(),
      householdId: auth.householdId,
      title: truncateTitle(parsed.data.message),
      taxYear,
      pageContext,
      messages: [],
      createdAt: now,
      updatedAt: now,
    };
  }

  let historyBeforeSend: AdvisorMessage[];
  let userMessage: AdvisorMessage;
  let includePageSnapshot: boolean;

  if (isEdit) {
    const editMessageId = parsed.data.editMessageId!;
    const msgIndex = conversation.messages.findIndex((m) => m.id === editMessageId);
    if (msgIndex === -1) return errorResponse("Message not found", 404);

    const target = conversation.messages[msgIndex]!;
    if (target.role !== "user") {
      return errorResponse("Only user messages can be edited", 400);
    }

    const lastUserMessage = [...conversation.messages]
      .reverse()
      .find((m) => m.role === "user");
    if (!lastUserMessage || lastUserMessage.id !== editMessageId) {
      return errorResponse("Only the most recent user message can be edited", 400);
    }

    historyBeforeSend = conversation.messages
      .slice(0, msgIndex)
      .filter((m) => m.role === "user" || m.role === "assistant");

    includePageSnapshot = historyBeforeSend.length === 0;

    userMessage = {
      id: editMessageId,
      role: "user",
      content: parsed.data.message.trim(),
      createdAt: target.createdAt,
    };

    conversation.messages = [...conversation.messages.slice(0, msgIndex), userMessage];

    if (msgIndex === 0) {
      conversation.title = truncateTitle(userMessage.content);
    }
  } else {
    historyBeforeSend = conversation.messages.filter(
      (m) => m.role === "user" || m.role === "assistant"
    );
    includePageSnapshot = historyBeforeSend.length === 0;

    userMessage = {
      id: randomUUID(),
      role: "user",
      content: parsed.data.message.trim(),
      createdAt: now,
    };
    conversation.messages.push(userMessage);
  }

  const householdContext = await buildAdvisorHouseholdContext(
    auth.householdId,
    privacy.isUnlocked
  );
  const systemPrompt = buildAdvisorSystemPrompt({
    pageContext,
    householdContext,
    isUnlocked: privacy.isUnlocked,
    includePageSnapshot,
  });

  const history = historyBeforeSend
    .slice(-MAX_HISTORY_MESSAGES)
    .map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));

  try {
    const pageContextPrefix = includePageSnapshot
      ? buildPageContextUserPrefix(pageContext)
      : undefined;

    const advisorMessages = buildAdvisorMessages({
      systemPrompt,
      history,
      userMessage: userMessage.content,
      pageContextPrefix,
    });

    const advisorResult = await openRouterChatComplete({ messages: advisorMessages });

    const assistantMessage: AdvisorMessage = {
      id: randomUUID(),
      role: "assistant",
      content: advisorResult.content,
      createdAt: new Date().toISOString(),
    };
    conversation.messages.push(assistantMessage);
    conversation.updatedAt = assistantMessage.createdAt;

    await advisorConversationRepository.upsert(conversation);

    return jsonResponse({
      conversationId: conversation.id,
      message: assistantMessage,
      disclaimer: ADVISOR_DISCLAIMER,
      privacyMode: privacy.isUnlocked ? "unlocked" : "locked",
      valuesUnlocked: privacy.isUnlocked,
    });
  } catch (err) {
    if (err instanceof OpenRouterNotConfiguredError) {
      return errorResponse(
        "Tax advisor is not configured. Set OPENROUTER_API_KEY on the API.",
        503
      );
    }
    const message = err instanceof Error ? err.message : "Advisor request failed";
    return errorResponse(message, 502);
  }
}

app.http("advisorConversationsList", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "advisor/conversations",
  handler: listConversationsHandler,
});

app.http("advisorConversationGet", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "advisor/conversations/{id}",
  handler: getConversationHandler,
});

app.http("advisorConversationDelete", {
  methods: ["DELETE"],
  authLevel: "anonymous",
  route: "advisor/conversations/{id}",
  handler: deleteConversationHandler,
});

app.http("advisorChat", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "advisor/chat",
  handler: chatHandler,
});
