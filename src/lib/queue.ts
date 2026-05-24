import { QueueServiceClient } from "@azure/storage-queue";
import {
  type QueueMessage,
  serializeQueueMessage,
} from "@portfolio/contracts";

function isAzuriteVersionError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return (
    message.includes("not supported by Azurite") ||
    message.includes("skipApiVersionCheck")
  );
}

export async function enqueueMessage(message: QueueMessage): Promise<void> {
  const connectionString = process.env.AzureWebJobsStorage;
  const queueName = process.env.PORTFOLIO_QUEUE_NAME ?? "portfolio-sync";
  if (!connectionString) {
    console.warn("AzureWebJobsStorage not set; skipping enqueue", message);
    return;
  }

  try {
    const client = QueueServiceClient.fromConnectionString(connectionString);
    const queue = client.getQueueClient(queueName);
    await queue.createIfNotExists();
    const body = Buffer.from(serializeQueueMessage(message)).toString("base64");
    await queue.sendMessage(body);
  } catch (err) {
    if (isAzuriteVersionError(err)) {
      throw new Error(
        "Storage queue unavailable (Azurite API version mismatch). Restart Azurite with: npm run storage:start (includes --skipApiVersionCheck), or use Sync now."
      );
    }
    throw err;
  }
}

/** Enqueue without throwing — returns false if queue is unavailable. */
export async function tryEnqueueMessage(
  message: QueueMessage
): Promise<boolean> {
  try {
    await enqueueMessage(message);
    return true;
  } catch (err) {
    console.warn("Queue enqueue skipped:", err);
    return false;
  }
}
