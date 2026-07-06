import { CosmosClient, type Database, type Container } from "@azure/cosmos";
import { DefaultAzureCredential } from "@azure/identity";
import https from "node:https";
import { getConfig } from "../lib/config.js";

let client: CosmosClient | null = null;
let database: Database | null = null;
let tlsConfigured = false;

export function isEmulatorEndpoint(endpoint: string): boolean {
  try {
    const host = new URL(endpoint).hostname;
    return host === "localhost" || host === "127.0.0.1";
  } catch {
    return endpoint.includes("localhost") || endpoint.includes("127.0.0.1");
  }
}

/** Cosmos emulator uses a self-signed cert; required for local https://localhost:8081 */
export function configureCosmosTlsForEmulator(): void {
  if (tlsConfigured) return;
  const { cosmosEndpoint } = getConfig();
  if (cosmosEndpoint && isEmulatorEndpoint(cosmosEndpoint)) {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
    tlsConfigured = true;
  }
}

export function getCosmosClient(): CosmosClient {
  if (client) return client;
  configureCosmosTlsForEmulator();
  const { cosmosEndpoint, cosmosKey, cosmosDatabase } = getConfig();
  if (!cosmosEndpoint) {
    throw new Error("COSMOS_ENDPOINT is required");
  }
  // The classic emulator serves HTTPS with a self-signed cert (needs a permissive
  // agent + NODE_TLS_REJECT_UNAUTHORIZED=0). The vnext emulator serves plain HTTP:
  // the SDK connects to http://localhost fine on its own, but passing a custom
  // (https) agent alongside an http endpoint trips its insecure-connection check.
  // So only attach the agent for an https emulator endpoint.
  const agent =
    isEmulatorEndpoint(cosmosEndpoint) && cosmosEndpoint.startsWith("https://")
      ? new https.Agent({ rejectUnauthorized: false })
      : undefined;

  if (cosmosKey) {
    client = new CosmosClient({
      endpoint: cosmosEndpoint,
      key: cosmosKey,
      agent,
    });
  } else {
    const credential = new DefaultAzureCredential();
    client = new CosmosClient({
      endpoint: cosmosEndpoint,
      aadCredentials: credential,
      agent,
    });
  }
  database = client.database(cosmosDatabase);
  return client;
}

export function getContainer(name: string): Container {
  getCosmosClient();
  if (!database) {
    const { cosmosDatabase } = getConfig();
    database = getCosmosClient().database(cosmosDatabase);
  }
  return database.container(name);
}

export function resetCosmosClient(): void {
  client = null;
  database = null;
}
