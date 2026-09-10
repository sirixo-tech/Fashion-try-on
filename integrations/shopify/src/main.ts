import { loadShopifyConnectorConfig } from "./config.js";
import { SelfxCatalogClient } from "./selfx-catalog.server.js";
import { ShopifyAdminClient } from "./shopify-admin.server.js";
import { ShopifyCatalogConnector } from "./shopify-catalog.connector.js";

async function main(): Promise<void> {
  const config = loadShopifyConnectorConfig();
  const shopify = new ShopifyAdminClient({
    shopDomain: config.shopDomain,
    accessToken: config.adminAccessToken,
    apiVersion: config.apiVersion,
    productPageSize: config.productPageSize,
  });
  const selfx = new SelfxCatalogClient({
    apiBaseUrl: config.selfxApiBaseUrl,
    integrationToken: config.selfxIntegrationToken,
  });
  const connector = new ShopifyCatalogConnector(
    shopify,
    selfx,
    config.selfxBatchSize,
  );
  const report = await connector.runFullSync();
  process.stdout.write(JSON.stringify(report, null, 2) + "\n");
}

main().catch((error: unknown) => {
  const message =
    error instanceof Error ? error.message : "Unknown Shopify sync error.";
  process.stderr.write("Shopify catalog sync failed: " + message + "\n");
  process.exitCode = 1;
});
