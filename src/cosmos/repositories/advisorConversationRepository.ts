import type { AdvisorConversation } from "@portfolio/contracts";
import { getDataStore } from "../../storage/index.js";

export class AdvisorConversationRepository {
  async listByHousehold(householdId: string): Promise<AdvisorConversation[]> {
    const store = await getDataStore();
    return store.advisorConversations.listByHousehold(householdId);
  }

  async get(
    householdId: string,
    conversationId: string
  ): Promise<AdvisorConversation | null> {
    const store = await getDataStore();
    return store.advisorConversations.get(householdId, conversationId);
  }

  async upsert(conversation: AdvisorConversation): Promise<AdvisorConversation> {
    const store = await getDataStore();
    return store.advisorConversations.upsert(conversation);
  }

  async delete(householdId: string, conversationId: string): Promise<boolean> {
    const store = await getDataStore();
    return store.advisorConversations.delete(householdId, conversationId);
  }
}

export const advisorConversationRepository = new AdvisorConversationRepository();
