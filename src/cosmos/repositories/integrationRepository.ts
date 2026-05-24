import type { IntegrationToken, SyncState } from "@portfolio/contracts";
import { getDataStore } from "../../storage/index.js";

export class IntegrationRepository {
  async getToken(
    householdId: string,
    provider: string
  ): Promise<IntegrationToken | null> {
    const store = await getDataStore();
    return store.integrations.getToken(householdId, provider);
  }

  async upsertToken(token: IntegrationToken): Promise<void> {
    const store = await getDataStore();
    return store.integrations.upsertToken(token);
  }

  async getSyncState(
    householdId: string,
    provider: string
  ): Promise<SyncState | null> {
    const store = await getDataStore();
    return store.integrations.getSyncState(householdId, provider);
  }

  async upsertSyncState(state: SyncState): Promise<void> {
    const store = await getDataStore();
    return store.integrations.upsertSyncState(state);
  }

  async recordWebhookEvent(
    householdId: string,
    eventId: string,
    payload: Record<string, unknown>
  ): Promise<boolean> {
    const store = await getDataStore();
    return store.integrations.recordWebhookEvent(householdId, eventId, payload);
  }
}

export const integrationRepository = new IntegrationRepository();
