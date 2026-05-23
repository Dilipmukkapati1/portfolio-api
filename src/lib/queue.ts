import { QueueServiceClient } from "@azure/storage-queue";
import {
  type QueueMessage,
  serializeQueueMessage,
} from "@portfolio/contracts";

export async function enqueueMessage(message: QueueMessage): Promise<void> {
  const connectionString = process.env.AzureWebJobsStorage;
  const queueName = process.env.PORTFOLIO_QUEUE_NAME ?? "portfolio-sync";
  if (!connectionString) {
    console.warn("AzureWebJobsStorage not set; skipping enqueue", message);
    return;
  }
  const client = QueueServiceClient.fromConnectionString(connectionString);
  const queue = client.getQueueClient(queueName);
  await queue.createIfNotExists();
  const body = Buffer.from(serializeQueueMessage(message)).toString("base64");
  await queue.sendMessage(body);
}
