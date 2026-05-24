import { getCosmosClient } from "./client.js";
import { getConfig } from "../lib/config.js";

const CONTAINERS = [
  "households",
  "members",
  "accounts",
  "holdings",
  "taxProfiles",
  "scenarios",
  "projectionRuns",
  "integrationTokens",
  "syncState",
  "webhookEvents",
] as const;

let ready = false;

export function isCosmosConfigured(): boolean {
  const { cosmosEndpoint, cosmosKey } = getConfig();
  return Boolean(cosmosEndpoint && cosmosKey);
}

export async function ensureCosmosReady(): Promise<void> {
  if (ready) return;
  const { cosmosDatabase } = getConfig();
  const client = getCosmosClient();
  await client.databases.createIfNotExists({ id: cosmosDatabase });
  const db = client.database(cosmosDatabase);
  for (const name of CONTAINERS) {
    await db.containers.createIfNotExists({
      id: name,
      partitionKey: { paths: ["/householdId"] },
    });
  }
  ready = true;
}
