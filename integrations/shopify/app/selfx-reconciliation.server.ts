import db from "./db.server";
import { unauthenticated } from "./shopify.server";
import { runSelfxCatalogSync } from "./selfx-connection.server";
import { SelfxStorefrontTryOnClient } from "./selfx-storefront-tryon.server";
import { loadSelfxLinkConfig } from "./selfx-link.server";
import { billingEnabled, syncShopifyBilling } from "./selfx-billing.server";

let running = false;
let timer: ReturnType<typeof setInterval> | undefined;
export async function reconcileConnectedShops() {
  if (running) return;
  running = true;
  try {
    if (billingEnabled()) {
      const billingJobs = await db.selfxConnection.findMany({
        where: {
          selfxStoreId: { not: null },
          nextBillingCheckAt: { lte: new Date() },
        },
        orderBy: [{ nextBillingCheckAt: "asc" }, { shop: "asc" }],
        take: 5,
      });
      for (const job of billingJobs) {
        try {
          const { admin } = await unauthenticated.admin(job.shop);
          await syncShopifyBilling(job.shop, admin);
        } catch {
          console.warn("SelfX Shopify billing verification will retry.");
        }
        await db.selfxConnection.updateMany({
          where: { shop: job.shop },
          data: { nextBillingCheckAt: new Date(Date.now() + 60_000) },
        });
      }
    }
    const jobs = await db.selfxConnection.findMany({
      where: {
        status: "CONNECTED",
        nextSyncAt: { lte: new Date() },
        OR: [{ syncLeaseUntil: null }, { syncLeaseUntil: { lt: new Date() } }],
      },
      orderBy: [{ nextSyncAt: "asc" }, { shop: "asc" }],
      take: 5,
    });
    for (const job of jobs) {
      try {
        const health = await new SelfxStorefrontTryOnClient(
          loadSelfxLinkConfig(),
        ).getConnectionHealth(job.shop);
        if (health.reconciliationOwner === "SELFX_API") {
          await db.selfxConnection.updateMany({
            where: { shop: job.shop },
            data: { nextSyncAt: new Date(Date.now() + 6 * 3600_000) },
          });
          continue;
        }
        const { session } = await unauthenticated.admin(job.shop);
        if (!session.accessToken)
          throw new Error("Shopify authorization unavailable");
        await runSelfxCatalogSync({
          shop: job.shop,
          shopifyAccessToken: session.accessToken,
        });
      } catch {
        await db.selfxConnection.updateMany({
          where: { shop: job.shop, status: "CONNECTED", syncLeaseToken: null },
          data: {
            lastErrorCode: "SHOPIFY_RECONNECT_REQUIRED",
            lastErrorMessage:
              "Automatic sync could not authenticate. Reconnect the same Store if Shopify authorization has expired.",
            syncAttempts: { increment: 1 },
            nextSyncAt: new Date(
              Date.now() +
                Math.min(
                  6 * 3600_000,
                  60_000 * 2 ** Math.min(job.syncAttempts, 8),
                ),
            ),
          },
        });
      }
    }
  } catch {
    console.warn("SelfX catalog recovery will retry shortly.");
  } finally {
    running = false;
  }
}
export function startShopifyReconciliation() {
  if (
    timer ||
    process.env.NODE_ENV === "test" ||
    process.env.SHOPIFY_RECONCILIATION_ENABLED === "false" ||
    !process.env.SELFX_API_BASE_URL
  )
    return;
  timer = setInterval(() => void reconcileConnectedShops(), 60_000);
  timer.unref();
}
