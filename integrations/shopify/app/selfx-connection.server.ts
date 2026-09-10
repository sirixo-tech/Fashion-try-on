import { SelfxCatalogClient } from "../src/selfx-catalog.client.js";
import { ShopifyAdminClient } from "../src/shopify-admin.client.js";
import { ShopifyCatalogConnector } from "../src/shopify-catalog.connector.js";
import db from "./db.server";
import {
  SelfxLinkApiError,
  SelfxLinkClient,
  loadSelfxLinkConfig,
} from "./selfx-link.server";
import {
  SelfxSecretCipher,
  loadSelfxSecretCipherConfig,
} from "./selfx-secret.server";

const pendingApprovalCode = "SHOPIFY_LINK_SESSION_PENDING_APPROVAL";

export type SelfxConnectionView = {
  shop: string;
  shopName: string | null;
  status: "NOT_CONNECTED" | "PENDING_APPROVAL" | "CONNECTED" | "ERROR";
  approvalUrl: string | null;
  pendingLinkExpiresAt: string | null;
  storeName: string | null;
  linkedAt: string | null;
  syncStatus: "NOT_STARTED" | "SYNCING" | "SUCCESS" | "ERROR";
  lastSyncAt: string | null;
  productsImported: number;
  variantsImported: number;
  created: number;
  updated: number;
  archived: number;
  errorCode: string | null;
  errorMessage: string | null;
};

export async function getSelfxConnectionView(
  shop: string,
): Promise<SelfxConnectionView> {
  const connection = await db.selfxConnection.findUnique({ where: { shop } });
  if (!connection) return emptyView(shop);
  let approvalUrl: string | null = null;
  if (
    connection.status === "PENDING_APPROVAL" &&
    connection.pendingLinkTokenCiphertext &&
    connection.pendingLinkExpiresAt &&
    connection.pendingLinkExpiresAt > new Date()
  ) {
    const cipher = new SelfxSecretCipher(loadSelfxSecretCipherConfig());
    const token = cipher.decrypt(
      connection.pendingLinkTokenCiphertext,
      pendingTokenContext(connection.shopifyAccountId),
    );
    approvalUrl = new SelfxLinkClient(loadSelfxLinkConfig()).approvalUrl(token);
  }
  return {
    shop: connection.shop,
    shopName: connection.shopName,
    status: connectionStatus(connection.status),
    approvalUrl,
    pendingLinkExpiresAt:
      connection.pendingLinkExpiresAt?.toISOString() ?? null,
    storeName: connection.selfxStoreName,
    linkedAt: connection.linkedAt?.toISOString() ?? null,
    syncStatus: syncStatus(connection.syncStatus),
    lastSyncAt: connection.lastSyncAt?.toISOString() ?? null,
    productsImported: connection.lastSyncProducts,
    variantsImported: connection.lastSyncVariants,
    created: connection.lastSyncCreated,
    updated: connection.lastSyncUpdated,
    archived: connection.lastSyncArchived,
    errorCode: connection.lastErrorCode,
    errorMessage: connection.lastErrorMessage,
  };
}

export async function startSelfxConnection(input: {
  shop: string;
  shopifyAccessToken: string;
}): Promise<SelfxConnectionView> {
  const existing = await db.selfxConnection.findUnique({
    where: { shop: input.shop },
  });
  if (existing?.status === "CONNECTED") {
    return getSelfxConnectionView(input.shop);
  }

  const identity = await shopifyClient(input).getShopIdentity();
  const canonicalShop = normalizeShopDomain(identity.myshopifyDomain);
  if (canonicalShop !== normalizeShopDomain(input.shop)) {
    throw new Error("Shopify returned an unexpected shop identity.");
  }

  const accountConnection = await db.selfxConnection.findUnique({
    where: { shopifyAccountId: identity.id },
  });
  if (
    accountConnection &&
    (accountConnection.shop !== canonicalShop ||
      accountConnection.shopName !== identity.name)
  ) {
    await db.selfxConnection.update({
      where: { shop: accountConnection.shop },
      data: { shop: canonicalShop, shopName: identity.name },
    });
  }
  if (accountConnection?.status === "CONNECTED") {
    return getSelfxConnectionView(canonicalShop);
  }

  const linkConfig = loadSelfxLinkConfig();
  const link = await new SelfxLinkClient(linkConfig).create({
    shopDomain: canonicalShop,
    externalAccountId: identity.id,
    externalAccountName: identity.name,
  });
  const cipherConfig = loadSelfxSecretCipherConfig();
  const cipher = new SelfxSecretCipher(cipherConfig);
  await db.selfxConnection.upsert({
    where: { shop: canonicalShop },
    create: {
      shop: canonicalShop,
      shopifyAccountId: identity.id,
      shopName: identity.name,
      status: "PENDING_APPROVAL",
      pendingLinkTokenCiphertext: cipher.encrypt(
        link.linkToken,
        pendingTokenContext(identity.id),
      ),
      pendingLinkExpiresAt: new Date(link.expiresAt),
      encryptionKeyVersion: cipherConfig.keyVersion,
    },
    update: {
      shopifyAccountId: identity.id,
      shopName: identity.name,
      status: "PENDING_APPROVAL",
      pendingLinkTokenCiphertext: cipher.encrypt(
        link.linkToken,
        pendingTokenContext(identity.id),
      ),
      pendingLinkExpiresAt: new Date(link.expiresAt),
      integrationTokenCiphertext: null,
      encryptionKeyVersion: cipherConfig.keyVersion,
      selfxStoreId: null,
      selfxStoreName: null,
      selfxIntegrationId: null,
      selfxCredentialId: null,
      linkedAt: null,
      syncStatus: "NOT_STARTED",
      lastErrorCode: null,
      lastErrorMessage: null,
    },
  });
  return getSelfxConnectionView(canonicalShop);
}

export async function completeSelfxConnection(input: {
  shop: string;
  shopifyAccessToken: string;
}): Promise<SelfxConnectionView> {
  const connection = await db.selfxConnection.findUnique({
    where: { shop: input.shop },
  });
  if (!connection || connection.status !== "PENDING_APPROVAL") {
    return getSelfxConnectionView(input.shop);
  }
  if (
    !connection.pendingLinkTokenCiphertext ||
    !connection.pendingLinkExpiresAt ||
    connection.pendingLinkExpiresAt <= new Date()
  ) {
    await db.selfxConnection.update({
      where: { shop: input.shop },
      data: {
        status: "ERROR",
        pendingLinkTokenCiphertext: null,
        lastErrorCode: "SHOPIFY_LINK_SESSION_EXPIRED",
        lastErrorMessage:
          "The approval link expired. Start the connection again.",
      },
    });
    return getSelfxConnectionView(input.shop);
  }

  const cipherConfig = loadSelfxSecretCipherConfig();
  const cipher = new SelfxSecretCipher(cipherConfig);
  const linkToken = cipher.decrypt(
    connection.pendingLinkTokenCiphertext,
    pendingTokenContext(connection.shopifyAccountId),
  );
  let redeemed;
  try {
    redeemed = await new SelfxLinkClient(loadSelfxLinkConfig()).redeem(
      linkToken,
    );
  } catch (error) {
    if (
      error instanceof SelfxLinkApiError &&
      error.code === pendingApprovalCode
    ) {
      return getSelfxConnectionView(input.shop);
    }
    const safe = safeConnectionError(error);
    await db.selfxConnection.update({
      where: { shop: input.shop },
      data: {
        lastErrorCode: safe.code,
        lastErrorMessage: safe.message,
      },
    });
    return getSelfxConnectionView(input.shop);
  }

  await db.selfxConnection.update({
    where: { shop: input.shop },
    data: {
      status: "CONNECTED",
      pendingLinkTokenCiphertext: null,
      pendingLinkExpiresAt: null,
      integrationTokenCiphertext: cipher.encrypt(
        redeemed.integrationToken,
        integrationTokenContext(connection.shopifyAccountId),
      ),
      encryptionKeyVersion: cipherConfig.keyVersion,
      selfxStoreId: redeemed.storeId,
      selfxStoreName: redeemed.storeName,
      selfxIntegrationId: redeemed.integrationId,
      selfxCredentialId: redeemed.credentialId,
      linkedAt: new Date(),
      syncStatus: "NOT_STARTED",
      lastErrorCode: null,
      lastErrorMessage: null,
    },
  });
  return runSelfxCatalogSync(input);
}

export async function runSelfxCatalogSync(input: {
  shop: string;
  shopifyAccessToken: string;
}): Promise<SelfxConnectionView> {
  const connection = await db.selfxConnection.findUnique({
    where: { shop: input.shop },
  });
  if (
    !connection ||
    connection.status !== "CONNECTED" ||
    !connection.integrationTokenCiphertext
  ) {
    throw new Error("Connect this Shopify shop to SelfX before syncing.");
  }
  const cipher = new SelfxSecretCipher(loadSelfxSecretCipherConfig());
  const integrationToken = cipher.decrypt(
    connection.integrationTokenCiphertext,
    integrationTokenContext(connection.shopifyAccountId),
  );
  await db.selfxConnection.update({
    where: { shop: input.shop },
    data: {
      syncStatus: "SYNCING",
      lastErrorCode: null,
      lastErrorMessage: null,
    },
  });

  try {
    const connector = new ShopifyCatalogConnector(
      shopifyClient(input),
      new SelfxCatalogClient({
        apiBaseUrl: loadSelfxLinkConfig().apiBaseUrl,
        integrationToken,
      }),
      boundedInteger(process.env.SELFX_CATALOG_BATCH_SIZE, 25),
    );
    const report = await connector.runFullSync();
    await db.selfxConnection.update({
      where: { shop: input.shop },
      data: {
        syncStatus: "SUCCESS",
        lastSyncAt: new Date(report.completedAt),
        lastSyncProducts: report.productsRead,
        lastSyncVariants: report.variantsRead,
        lastSyncCreated: report.created,
        lastSyncUpdated: report.updated,
        lastSyncArchived: report.archived,
        lastErrorCode: null,
        lastErrorMessage: null,
      },
    });
  } catch {
    await db.selfxConnection.update({
      where: { shop: input.shop },
      data: {
        syncStatus: "ERROR",
        lastErrorCode: "CATALOG_SYNC_FAILED",
        lastErrorMessage:
          "The catalog could not be synchronized. Your Shopify data was not changed.",
      },
    });
  }
  return getSelfxConnectionView(input.shop);
}

function shopifyClient(input: {
  shop: string;
  shopifyAccessToken: string;
}): ShopifyAdminClient {
  return new ShopifyAdminClient({
    shopDomain: normalizeShopDomain(input.shop),
    accessToken: requiredToken(input.shopifyAccessToken),
    apiVersion: shopifyApiVersion(),
    productPageSize: boundedInteger(process.env.SHOPIFY_PRODUCT_PAGE_SIZE, 50),
  });
}

function emptyView(shop: string): SelfxConnectionView {
  return {
    shop,
    shopName: null,
    status: "NOT_CONNECTED",
    approvalUrl: null,
    pendingLinkExpiresAt: null,
    storeName: null,
    linkedAt: null,
    syncStatus: "NOT_STARTED",
    lastSyncAt: null,
    productsImported: 0,
    variantsImported: 0,
    created: 0,
    updated: 0,
    archived: 0,
    errorCode: null,
    errorMessage: null,
  };
}

function normalizeShopDomain(value: string): string {
  const clean = value.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(clean)) {
    throw new Error("Shopify returned an invalid shop domain.");
  }
  return clean;
}

function requiredToken(value: string | undefined): string {
  const clean = value?.trim();
  if (!clean) throw new Error("The Shopify Admin session has no access token.");
  return clean;
}

function shopifyApiVersion(): string {
  const value = process.env.SHOPIFY_API_VERSION?.trim() || "2026-07";
  if (!/^\d{4}-(01|04|07|10)$/.test(value)) {
    throw new Error("SHOPIFY_API_VERSION must use Shopify's YYYY-MM format.");
  }
  return value;
}

function boundedInteger(value: string | undefined, fallback: number): number {
  if (!value?.trim()) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 100) {
    throw new Error("Catalog batch and page sizes must be from 1 to 100.");
  }
  return parsed;
}

function pendingTokenContext(shopifyAccountId: string): string {
  return `shopify:${shopifyAccountId}:pending-link`;
}

function integrationTokenContext(shopifyAccountId: string): string {
  return `shopify:${shopifyAccountId}:integration-token`;
}

function connectionStatus(value: string): SelfxConnectionView["status"] {
  return value === "PENDING_APPROVAL" ||
    value === "CONNECTED" ||
    value === "ERROR"
    ? value
    : "ERROR";
}

function syncStatus(value: string): SelfxConnectionView["syncStatus"] {
  return value === "SYNCING" || value === "SUCCESS" || value === "ERROR"
    ? value
    : "NOT_STARTED";
}

function safeConnectionError(error: unknown): {
  code: string;
  message: string;
} {
  if (error instanceof SelfxLinkApiError) {
    return { code: error.code, message: error.message };
  }
  return {
    code: "SELFX_LINK_FAILED",
    message: "SelfX could not complete the connection. Try again.",
  };
}
