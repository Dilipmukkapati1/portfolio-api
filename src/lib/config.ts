export function getConfig() {
  return {
    cosmosEndpoint: process.env.COSMOS_ENDPOINT ?? "",
    cosmosKey: process.env.COSMOS_KEY,
    cosmosDatabase: process.env.COSMOS_DATABASE ?? "portfolio",
    keyVaultName: process.env.KEY_VAULT_NAME,
    queueName: process.env.PORTFOLIO_QUEUE_NAME ?? "portfolio-sync",
    defaultHouseholdId:
      process.env.DEFAULT_HOUSEHOLD_ID ?? "local-household",
    simplefinAccessUrl: process.env.SIMPLEFIN_ACCESS_URL,
    snaptradeClientId: process.env.SNAPTRADE_CLIENT_ID,
    snaptradeConsumerKey: process.env.SNAPTRADE_CONSUMER_KEY,
    snaptradeWebhookSecret: process.env.SNAPTRADE_WEBHOOK_SECRET,
  };
}
