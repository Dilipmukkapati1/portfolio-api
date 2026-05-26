import { isCosmosConfigured } from "./cosmos/bootstrap.js";
import { formatStorageSummary } from "./storage/layout.js";
import { getDataStore } from "./storage/index.js";
import "./functions/docs.js";
import "./functions/health.js";
import "./functions/privacy.js";
import "./functions/household.js";
import "./functions/households.js";
import "./functions/members.js";
import "./functions/taxProfiles.js";
import "./functions/accounts.js";
import "./functions/transactions.js";
import "./functions/holdings.js";
import "./functions/networth.js";
import "./functions/analytics.js";
import "./functions/tax.js";
import "./functions/connectSimplefin.js";
import "./functions/integrationsStatus.js";
import "./functions/simplefinSync.js";
import "./functions/connectSnaptrade.js";
import "./functions/snaptradeSync.js";
import "./functions/snaptradeWebhook.js";
import "./functions/queueWorker.js";
import "./functions/timerDailySync.js";
import "./functions/timerNightly.js";
import "./functions/submitBatch.js";

if (isCosmosConfigured()) {
  void getDataStore().then((store) =>
    console.log(
      `[portfolio-api] Storage warmup: ${formatStorageSummary(store.sources)}`
    )
  );
}
