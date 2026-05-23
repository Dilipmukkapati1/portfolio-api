import { CosmosClient, type Database, type Container } from "@azure/cosmos";
import { DefaultAzureCredential } from "@azure/identity";
import { getConfig } from "../lib/config.js";

let client: CosmosClient | null = null;
let database: Database | null = null;

export function getCosmosClient(): CosmosClient {
  if (client) return client;
  const { cosmosEndpoint, cosmosKey, cosmosDatabase } = getConfig();
  if (!cosmosEndpoint) {
    throw new Error("COSMOS_ENDPOINT is required");
  }
  if (cosmosKey) {
    client = new CosmosClient({ endpoint: cosmosEndpoint, key: cosmosKey });
  } else {
    const credential = new DefaultAzureCredential();
    client = new CosmosClient({ endpoint: cosmosEndpoint, aadCredentials: credential });
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
