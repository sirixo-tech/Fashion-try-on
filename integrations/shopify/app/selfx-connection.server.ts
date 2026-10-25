import { SelfxCatalogClient } from "../src/selfx-catalog.server.js";
import { ShopifyAdminClient } from "../src/shopify-admin.server.js";
import { ShopifyCatalogConnector } from "../src/shopify-catalog.connector.js";
import db from "./db.server";
import { randomBytes } from "node:crypto";
import { Prisma } from "@selfx/shopify-prisma-client";
import {
  parseShopifyProductVisibilityRules,
  parseShopifyTryOnMode,
  type ShopifyProductVisibilityRule,
  type ShopifyProductVisibilityRules,
  type ShopifyTryOnVertical,
  type ShopifyTryOnMode,
} from "./selfx-tryon-settings";
import {
  SelfxLinkApiError,
  SelfxLinkClient,
  loadSelfxLinkConfig,
} from "./selfx-link.server";
import {
  SelfxSecretCipher,
  loadSelfxSecretCipherConfig,
} from "./selfx-secret.server";
import {
  normalizeLanguageLocale,
  normalizeStorefrontLocale,
  type LanguageLocale,
  type StorefrontLocale,
} from "./selfx-localization";

const pendingApprovalCode = "SHOPIFY_LINK_SESSION_PENDING_APPROVAL";

export type SelfxConnectionView = {
  shop: string;
  shopName: string | null;
  status: "NOT_CONNECTED" | "PENDING_APPROVAL" | "CONNECTED" | "ERROR";
  approvalUrl: string | null;
  pendingLinkExpiresAt: string | null;
  storeId: string | null;
  storeName: string | null;
  integrationId: string | null;
  storefrontLocale: StorefrontLocale;
  adminLocale: LanguageLocale;
  tryOnMode: ShopifyTryOnMode;
  productVisibilityRules: ShopifyProductVisibilityRules;
  visitorTryOnLimit: number;
  visitorTryOnLimitPeriod: TryOnLimitPeriod;
  monthlyStoreTryOnLimit: number;
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

export type TryOnLimitPeriod = "DAY" | "WEEK" | "MONTH";

export type SelfxStorefrontSettingsInput = {
  shop: string;
  storefrontLocale: string;
  adminLocale: string;
  tryOnMode?: unknown;
  visitorTryOnLimit: unknown;
  visitorTryOnLimitPeriod: unknown;
  monthlyStoreTryOnLimit: unknown;
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
    storeId: connection.selfxStoreId ?? null,
    storeName: connection.selfxStoreName,
    integrationId: connection.selfxIntegrationId ?? null,
    storefrontLocale: normalizeStorefrontLocale(connection.storefrontLocale),
    adminLocale: normalizeLanguageLocale(connection.adminLocale),
    tryOnMode: parseShopifyTryOnMode(connection.tryOnMode),
    productVisibilityRules: parseShopifyProductVisibilityRules(
      connection.productVisibilityRules,
    ),
    visitorTryOnLimit: normalizeLimit(connection.visitorTryOnLimit),
    visitorTryOnLimitPeriod: normalizeTryOnLimitPeriod(
      connection.visitorTryOnLimitPeriod,
    ),
    monthlyStoreTryOnLimit: normalizeLimit(connection.monthlyStoreTryOnLimit),
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

export async function clearStaleSelfxConnection(
  shop: string,
): Promise<SelfxConnectionView> {
  await db.selfxConnection.updateMany({
    where: { shop, status: "CONNECTED" },
    data: {
      status: "NOT_CONNECTED",
      pendingLinkTokenCiphertext: null,
      pendingLinkExpiresAt: null,
      integrationTokenCiphertext: null,
      // Retain the approved binding; reconnect cannot select another Store.
      selfxIntegrationId: null,
      selfxCredentialId: null,
      linkedAt: null,
      syncStatus: "NOT_STARTED",
      lastErrorCode: null,
      lastErrorMessage: null,
      syncCheckpoint: Prisma.DbNull,
      syncLeaseToken: null,
      syncLeaseUntil: null,
      syncAttempts: 0,
    },
  });
  return getSelfxConnectionView(shop);
}

export async function updateSelfxProductVisibilityRule(input: {
  shop: string;
  vertical: ShopifyTryOnVertical;
  rule: ShopifyProductVisibilityRule;
}): Promise<void> {
  const connection = await db.selfxConnection.findUnique({
    where: { shop: input.shop },
    select: { productVisibilityRules: true },
  });
  if (!connection) {
    throw new Error("Connect this Shopify shop to SelfX before continuing.");
  }
  const current = parseShopifyProductVisibilityRules(
    connection.productVisibilityRules,
  );
  await db.selfxConnection.update({
    where: { shop: input.shop },
    data: {
      productVisibilityRules: {
        ...current,
        [input.vertical]: input.rule,
      },
    },
  });
}

export async function updateSelfxStorefrontLocale(input: {
  shop: string;
  locale: string;
}): Promise<SelfxConnectionView> {
  const current = await getSelfxConnectionView(input.shop);
  return updateSelfxStorefrontSettings({
    shop: input.shop,
    storefrontLocale: input.locale,
    adminLocale: current.adminLocale,
    visitorTryOnLimit: current.visitorTryOnLimit,
    visitorTryOnLimitPeriod: current.visitorTryOnLimitPeriod,
    monthlyStoreTryOnLimit: current.monthlyStoreTryOnLimit,
  });
}

export async function updateSelfxStorefrontSettings(
  input: SelfxStorefrontSettingsInput,
): Promise<SelfxConnectionView> {
  const tryOnMode =
    input.tryOnMode === undefined
      ? undefined
      : parseShopifyTryOnMode(input.tryOnMode);
  const connection = await db.selfxConnection.findUnique({
    where: { shop: input.shop },
    select: { shop: true },
  });
  if (!connection) {
    throw new Error(
      "Connect this Shopify shop to SelfX before changing settings.",
    );
  }

  await db.selfxConnection.update({
    where: { shop: input.shop },
    data: {
      storefrontLocale: normalizeStorefrontLocale(input.storefrontLocale),
      adminLocale: normalizeLanguageLocale(input.adminLocale),
      ...(tryOnMode === undefined ? {} : { tryOnMode }),
      visitorTryOnLimit: normalizeLimit(input.visitorTryOnLimit),
      visitorTryOnLimitPeriod: normalizeTryOnLimitPeriod(
        input.visitorTryOnLimitPeriod,
      ),
      monthlyStoreTryOnLimit: normalizeLimit(input.monthlyStoreTryOnLimit),
    },
  });
  return getSelfxConnectionView(input.shop);
}

export async function getSelfxIntegrationToken(shop: string): Promise<string> {
  const connection = await db.selfxConnection.findUnique({
    where: { shop },
  });
  if (
    !connection ||
    connection.status !== "CONNECTED" ||
    !connection.integrationTokenCiphertext
  ) {
    throw new Error("Connect this Shopify shop to SelfX before continuing.");
  }
  const cipher = new SelfxSecretCipher(loadSelfxSecretCipherConfig());
  return cipher.decrypt(
    connection.integrationTokenCiphertext,
    integrationTokenContext(connection.shopifyAccountId),
  );
}

export async function startSelfxConnection(input: {
  shop: string;
  shopifyAccessToken: string;
  storeId?: string | null;
  force?: boolean;
}): Promise<SelfxConnectionView> {
  const existing = await db.selfxConnection.findUnique({
    where: { shop: input.shop },
  });
  if (
    existing?.selfxStoreId &&
    input.storeId &&
    input.storeId !== existing.selfxStoreId
  )
    throw new Error(
      "This website is bound to its approved SelfX Store. Contact support to change ownership.",
    );
  if (!input.force && existing?.status === "CONNECTED") {
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
  if (!input.force && accountConnection?.status === "CONNECTED") {
    return getSelfxConnectionView(canonicalShop);
  }

  const current = await db.selfxConnection.findUnique({
    where: { shop: canonicalShop },
  });
  if (
    !input.force &&
    current?.status === "PENDING_APPROVAL" &&
    current.pendingLinkTokenCiphertext &&
    current.pendingLinkExpiresAt &&
    current.pendingLinkExpiresAt > new Date()
  ) {
    return getSelfxConnectionView(canonicalShop);
  }
  if (
    !input.force &&
    current?.status === "PENDING_APPROVAL" &&
    current.pendingLinkExpiresAt &&
    current.pendingLinkExpiresAt <= new Date()
  ) {
    await db.selfxConnection.update({
      where: { shop: canonicalShop },
      data: {
        status: "NOT_CONNECTED",
        pendingLinkTokenCiphertext: null,
        pendingLinkExpiresAt: null,
        lastErrorCode: null,
        lastErrorMessage: null,
      },
    });
  }

  const linkConfig = loadSelfxLinkConfig();
  const link = await new SelfxLinkClient(linkConfig).create({
    shopDomain: canonicalShop,
    externalAccountId: identity.id,
    externalAccountName: identity.name,
    storeId: existing?.selfxStoreId ?? input.storeId ?? null,
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
      selfxStoreId: existing?.selfxStoreId ?? input.storeId ?? null,
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
      selfxStoreId: existing?.selfxStoreId ?? input.storeId ?? null,
      selfxStoreName: input.storeId ? (current?.selfxStoreName ?? null) : null,
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
    const terminal = isTerminalLinkError(error);
    await db.selfxConnection.update({
      where: { shop: input.shop },
      data: {
        ...(terminal
          ? {
              status: "ERROR",
              pendingLinkTokenCiphertext: null,
              pendingLinkExpiresAt: null,
            }
          : {}),
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

export async function restartSelfxConnection(input: {
  shop: string;
  shopifyAccessToken: string;
}): Promise<SelfxConnectionView> {
  const current = await db.selfxConnection.findUnique({
    where: { shop: input.shop },
  });
  return startSelfxConnection({
    shop: input.shop,
    shopifyAccessToken: input.shopifyAccessToken,
    storeId: current?.selfxStoreId ?? null,
    force: true,
  });
}

export async function disconnectSelfxConnection(
  shop: string,
): Promise<SelfxConnectionView> {
  const current = await db.selfxConnection.findUnique({ where: { shop } });
  if (!current?.selfxStoreId)
    throw new Error("There is no connected SelfX Store.");
  await new SelfxLinkClient(loadSelfxLinkConfig()).disconnect({
    shopDomain: shop,
    externalAccountId: current.shopifyAccountId,
    storeId: current.selfxStoreId,
  });
  await db.selfxConnection.update({
    where: { shop },
    data: {
      status: "DISCONNECTED",
      syncCheckpoint: Prisma.DbNull,
      syncLeaseToken: null,
      syncLeaseUntil: null,
      syncAttempts: 0,
      integrationTokenCiphertext: null,
      pendingLinkTokenCiphertext: null,
      pendingLinkExpiresAt: null,
      syncStatus: "NOT_STARTED",
      lastErrorCode: null,
      lastErrorMessage: null,
    },
  });
  return getSelfxConnectionView(shop);
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
  const lease = randomBytes(32).toString("base64url");
  const claimed = await db.selfxConnection.updateMany({
    where: {
      shop: input.shop,
      status: "CONNECTED",
      OR: [{ syncLeaseUntil: null }, { syncLeaseUntil: { lt: new Date() } }],
    },
    data: {
      syncLeaseToken: lease,
      syncLeaseUntil: new Date(Date.now() + 300_000),
      syncStatus: "SYNCING",
      lastErrorCode: null,
      lastErrorMessage: null,
    },
  });
  if (claimed.count !== 1) return getSelfxConnectionView(input.shop);
  const owned = {
    shop: input.shop,
    status: "CONNECTED",
    syncLeaseToken: lease,
  };
  const renew = async () => {
    if (
      (
        await db.selfxConnection.updateMany({
          where: { ...owned, syncLeaseUntil: { gt: new Date() } },
          data: { syncLeaseUntil: new Date(Date.now() + 300_000) },
        })
      ).count !== 1
    )
      throw new Error("CATALOG_SYNC_LEASE_LOST");
  };

  try {
    const writer = new SelfxCatalogClient({
      apiBaseUrl: loadSelfxLinkConfig().apiBaseUrl,
      integrationToken,
    });
    const connector = new ShopifyCatalogConnector(
      shopifyClient(input),
      {
        sync: async (batch) => {
          await renew();
          return writer.sync(batch);
        },
      },
      boundedInteger(process.env.SELFX_CATALOG_BATCH_SIZE, 25),
    );
    const ownedConnection = await db.selfxConnection.findUnique({
      where: { shop: input.shop },
    });
    if (!ownedConnection) throw new Error("The Store connection was removed.");
    const report = await connector.runFullSync(
      ownedConnection.syncCheckpoint as unknown as
        | import("../src/shopify-catalog.connector").ShopifyCatalogSyncCheckpoint
        | undefined,
      async (state) => {
        await renew();
        await db.selfxConnection.updateMany({
          where: owned,
          data: { syncCheckpoint: JSON.parse(JSON.stringify(state)) },
        });
      },
    );
    await db.selfxConnection.updateMany({
      where: owned,
      data: {
        syncCheckpoint: Prisma.DbNull,
        syncLeaseToken: null,
        syncLeaseUntil: null,
        syncAttempts: 0,
        nextSyncAt: new Date(Date.now() + 6 * 3600_000),
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
    await db.selfxConnection.updateMany({
      where: owned,
      data: {
        syncLeaseToken: null,
        syncLeaseUntil: null,
        syncAttempts: { increment: 1 },
        nextSyncAt: new Date(
          Date.now() +
            Math.min(
              6 * 3600_000,
              60_000 * 2 ** Math.min(connection.syncAttempts, 8),
            ),
        ),
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
    storeId: null,
    storeName: null,
    integrationId: null,
    storefrontLocale: "auto",
    adminLocale: "en",
    tryOnMode: "BOTH",
    productVisibilityRules: {},
    visitorTryOnLimit: 0,
    visitorTryOnLimitPeriod: "DAY",
    monthlyStoreTryOnLimit: 0,
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

function normalizeLimit(value: unknown): number {
  const parsed =
    typeof value === "number"
      ? value
      : Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return Math.min(Math.floor(parsed), 1_000_000);
}

function normalizeTryOnLimitPeriod(value: unknown): TryOnLimitPeriod {
  const clean = String(value ?? "")
    .trim()
    .toUpperCase();
  return clean === "WEEK" || clean === "MONTH" ? clean : "DAY";
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
  return value === "NOT_CONNECTED" ||
    value === "PENDING_APPROVAL" ||
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

function isTerminalLinkError(error: unknown): boolean {
  if (!(error instanceof SelfxLinkApiError)) return false;
  return !(
    error.code === "SELFX_LINK_UNAVAILABLE" ||
    error.status === 408 ||
    error.status === 429 ||
    error.status >= 500
  );
}
