import type { IntegrationToken, SyncState } from "@portfolio/contracts";
import { getContainer } from "../client.js";

export class IntegrationRepository {
  async getToken(
    householdId: string,
    provider: string
  ): Promise<IntegrationToken | null> {
    const container = getContainer("integrationTokens");
    try {
      const { resource } = await container
        .item(provider, householdId)
        .read<IntegrationToken>();
      return resource ?? null;
    } catch {
      return null;
    }
  }

  async upsertToken(token: IntegrationToken): Promise<void> {
    const container = getContainer("integrationTokens");
    await container.items.upsert(token);
  }

  async getSyncState(
    householdId: string,
    provider: string
  ): Promise<SyncState | null> {
    const container = getContainer("syncState");
    try {
      const { resource } = await container
        .item(provider, householdId)
        .read<SyncState>();
      return resource ?? null;
    } catch {
      return null;
    }
  }

  async upsertSyncState(state: SyncState): Promise<void> {
    const container = getContainer("syncState");
    await container.items.upsert(state);
  }

  async recordWebhookEvent(
    householdId: string,
    eventId: string,
    payload: Record<string, unknown>
  ): Promise<boolean> {
    const container = getContainer("webhookEvents");
    try {
      await container.items.create({
        id: eventId,
        householdId,
        eventId,
        payload,
        receivedAt: new Date().toISOString(),
      });
      return true;
    } catch (err: unknown) {
      if ((err as { code?: number }).code === 409) return false;
      throw err;
    }
  }
}

export const integrationRepository = new IntegrationRepository();
