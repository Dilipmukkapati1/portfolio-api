import { app, type InvocationContext } from "@azure/functions";
import { processQueueMessage } from "../services/queueWorkerService.js";

async function queueWorkerHandler(
  message: unknown,
  context: InvocationContext
): Promise<void> {
  let raw: string;
  if (typeof message === "string") {
    raw = message;
  } else if (Buffer.isBuffer(message)) {
    raw = message.toString("utf-8");
  } else if (message && typeof message === "object" && "body" in message) {
    const body = (message as { body: string }).body;
    raw = Buffer.from(body, "base64").toString("utf-8");
  } else {
    raw = JSON.stringify(message);
  }

  context.log("Processing queue message");
  await processQueueMessage(raw);
}

app.storageQueue("queueWorker", {
  queueName: "%PORTFOLIO_QUEUE_NAME%",
  connection: "AzureWebJobsStorage",
  handler: queueWorkerHandler,
});
