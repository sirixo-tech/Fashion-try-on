import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

import { HttpStatus, Injectable } from "@nestjs/common";
import { IntegrationStatus, OrganizationStatus, Prisma } from "@prisma/client";
import {
  ShopifyAdminClient,
  ShopifyCatalogConnector,
  type SelfxCatalogSyncRequest,
  type ShopifyCatalogSyncReport,
} from "@selfx/shopify-integration";

import { createSelfxId } from "@selfx/database";

import { ApiErrorException } from "../common/api-error.exception.js";
import { PrismaService } from "../database/prisma.service.js";
import { type ShopifyOauthCallbackDto } from "./dto/shopify-oauth.dto.js";
import { IntegrationCatalogSyncService } from "./integration-catalog-sync.service.js";
import {
  decryptProviderSecret,
  encryptProviderSecret,
} from "./provider-secret-cipher.js";
import {
  loadShopifyOauthConfig,
  type ShopifyOauthConfig,
} from "./shopify-oauth.config.js";

const oauthStateLifetimeMs = 10 * 60 * 1000;
const refreshBeforeExpiryMs = 5 * 60 * 1000;
const requiredScope = "read_products";

type StoredShopifySecrets = {
  accessToken: string;
  refreshToken: string;
};

type ShopifyTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  scope?: string;
  expires_in?: number;
  refresh_token_expires_in?: number;
};

type ShopifyProviderCredentialRecord = {
  encryptedPayload: string;
  initializationVector: string;
  authenticationTag: string;
  scopes: Prisma.JsonValue;
  accessTokenExpiresAt: Date | null;
};

export type ShopifyWebhookConnection = {
  integrationId: string;
  storeId: string;
  storeName: string;
  externalAccountId: string | null;
  externalAccountName: string | null;
  status: IntegrationStatus;
  client: ShopifyAdminClient | null;
};

export const SHOPIFY_OAUTH_ERROR_CODES = {
  configuration: "SHOPIFY_OAUTH_CONFIGURATION_ERROR",
  storeNotFound: "SHOPIFY_OAUTH_STORE_NOT_FOUND",
  invalidState: "SHOPIFY_OAUTH_STATE_INVALID",
  invalidHmac: "SHOPIFY_OAUTH_HMAC_INVALID",
  invalidTimestamp: "SHOPIFY_OAUTH_TIMESTAMP_INVALID",
  tokenExchange: "SHOPIFY_OAUTH_TOKEN_EXCHANGE_FAILED",
  scope: "SHOPIFY_OAUTH_SCOPE_INVALID",
  notConnected: "SHOPIFY_NOT_CONNECTED",
  ambiguousShop: "SHOPIFY_SHOP_CONNECTION_AMBIGUOUS",
} as const;

@Injectable()
export class ShopifyOauthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly catalogSync: IntegrationCatalogSyncService,
  ) {}

  async start(actorUserId: string, storeId: string, rawShop: string) {
    const config = requireConfig();
    const shop = normalizeShopDomain(rawShop);
    const store = await this.prisma.organization.findFirst({
      where: { id: storeId, status: OrganizationStatus.ACTIVE },
      select: { id: true },
    });
    if (!store) {
      throw apiError(
        HttpStatus.NOT_FOUND,
        SHOPIFY_OAUTH_ERROR_CODES.storeNotFound,
        "Active SelfX Store was not found.",
      );
    }
    const state = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + oauthStateLifetimeMs);
    await this.prisma.$transaction(async (tx) => {
      await tx.integrationOauthState.deleteMany({
        where: { expiresAt: { lt: new Date() } },
      });
      await tx.integrationOauthState.create({
        data: {
          id: createSelfxId(),
          organizationId: storeId,
          provider: "SHOPIFY",
          shopDomain: shop,
          stateHash: hashState(state),
          createdByUserId: actorUserId,
          expiresAt,
        },
      });
    });
    const authorizationUrl = new URL(`https://${shop}/admin/oauth/authorize`);
    authorizationUrl.search = new URLSearchParams({
      client_id: config.clientId,
      scope: requiredScope,
      redirect_uri: config.callbackUrl,
      state,
    }).toString();
    return {
      authorizationUrl: authorizationUrl.toString(),
      expiresAt: expiresAt.toISOString(),
    };
  }

  async complete(query: ShopifyOauthCallbackDto) {
    const config = requireConfig();
    const shop = normalizeShopDomain(query.shop);
    assertFreshTimestamp(query.timestamp);
    if (!verifyShopifyCallbackHmac({ ...query }, config.clientSecret)) {
      throw apiError(
        HttpStatus.UNAUTHORIZED,
        SHOPIFY_OAUTH_ERROR_CODES.invalidHmac,
        "Shopify callback signature is invalid.",
      );
    }
    const now = new Date();
    const state = await this.prisma.integrationOauthState.findUnique({
      where: { stateHash: hashState(query.state) },
      include: {
        organization: { select: { id: true, name: true, status: true } },
      },
    });
    if (
      !state ||
      state.provider !== "SHOPIFY" ||
      state.shopDomain !== shop ||
      state.consumedAt ||
      state.expiresAt <= now ||
      state.organization.status !== OrganizationStatus.ACTIVE
    ) {
      throw invalidState();
    }
    const consumed = await this.prisma.integrationOauthState.updateMany({
      where: { id: state.id, consumedAt: null, expiresAt: { gt: now } },
      data: { consumedAt: now },
    });
    if (consumed.count !== 1) {
      throw invalidState();
    }

    const token = await exchangeAuthorizationCode(shop, query.code, config);
    const scopes = validateScopes(token.scope);
    const expiresAt = expiryFromSeconds(token.expires_in);
    const refreshExpiresAt = expiryFromSeconds(token.refresh_token_expires_in);
    const secrets = requiredTokenSecrets(token);
    const client = shopifyClient(shop, secrets.accessToken, config);
    const identity = await client.getShopIdentity();
    if (normalizeShopDomain(identity.myshopifyDomain) !== shop) {
      throw apiError(
        HttpStatus.BAD_GATEWAY,
        SHOPIFY_OAUTH_ERROR_CODES.tokenExchange,
        "Shopify returned an unexpected shop identity.",
      );
    }
    const encrypted = encryptProviderSecret(secrets, config.encryptionKey);
    const integration = await this.prisma.$transaction(async (tx) => {
      const saved = await tx.integration.upsert({
        where: {
          organizationId_type: {
            organizationId: state.organizationId,
            type: "SHOPIFY",
          },
        },
        create: {
          id: createSelfxId(),
          organizationId: state.organizationId,
          type: "SHOPIFY",
          status: IntegrationStatus.ACTIVE,
          externalAccountId: identity.id,
          externalAccountName: identity.name,
          metadata: { shopDomain: shop, providerScopes: scopes },
          connectedAt: now,
          createdByUserId: state.createdByUserId,
        },
        update: {
          status: IntegrationStatus.ACTIVE,
          externalAccountId: identity.id,
          externalAccountName: identity.name,
          metadata: { shopDomain: shop, providerScopes: scopes },
          connectedAt: now,
          disconnectedAt: null,
        },
      });
      await tx.integrationProviderCredential.upsert({
        where: { integrationId: saved.id },
        create: {
          id: createSelfxId(),
          integrationId: saved.id,
          organizationId: state.organizationId,
          provider: "SHOPIFY",
          ...encrypted,
          keyVersion: config.encryptionKeyVersion,
          scopes,
          accessTokenExpiresAt: expiresAt,
          refreshTokenExpiresAt: refreshExpiresAt,
        },
        update: {
          ...encrypted,
          keyVersion: config.encryptionKeyVersion,
          scopes,
          accessTokenExpiresAt: expiresAt,
          refreshTokenExpiresAt: refreshExpiresAt,
        },
      });
      await createOauthAudit(
        tx,
        state.createdByUserId,
        state.organizationId,
        saved.id,
        shop,
        scopes,
      );
      return saved;
    });

    try {
      const report = await this.runSync(
        integration.id,
        secrets.accessToken,
        shop,
        state.organization.name,
      );
      await this.recordSyncResult(integration.id, true, report);
      return {
        storeId: state.organizationId,
        integrationId: integration.id,
        syncStatus: "COMPLETED" as const,
      };
    } catch {
      await this.recordSyncResult(integration.id, false, null);
      return {
        storeId: state.organizationId,
        integrationId: integration.id,
        syncStatus: "FAILED" as const,
      };
    }
  }

  async sync(
    actorUserId: string,
    integrationId: string,
  ): Promise<ShopifyCatalogSyncReport> {
    const config = requireConfig();
    const record = await this.prisma.integration.findFirst({
      where: {
        id: integrationId,
        type: "SHOPIFY",
        status: {
          in: [IntegrationStatus.ACTIVE, IntegrationStatus.ERROR],
        },
      },
      include: {
        organization: { select: { name: true } },
        providerCredential: true,
      },
    });
    if (!record?.providerCredential) {
      throw apiError(
        HttpStatus.CONFLICT,
        SHOPIFY_OAUTH_ERROR_CODES.notConnected,
        "Shopify must be connected before catalog sync.",
      );
    }
    const accessToken = await this.currentAccessToken(
      record.id,
      record.metadata,
      record.providerCredential,
      config,
    );
    const shop = shopDomainFromMetadata(record.metadata);
    try {
      const report = await this.runSync(
        integrationId,
        accessToken,
        shop,
        record.organization.name,
      );
      await this.recordSyncResult(integrationId, true, report, actorUserId);
      return report;
    } catch (error) {
      await this.recordSyncResult(integrationId, false, null, actorUserId);
      throw error;
    }
  }

  async webhookConnection(
    rawShop: string,
    needsAdminClient: boolean,
  ): Promise<ShopifyWebhookConnection | null> {
    const config = requireConfig();
    const shop = normalizeShopDomain(rawShop);
    const records = await this.prisma.integration.findMany({
      where: {
        type: "SHOPIFY",
        metadata: { path: ["shopDomain"], equals: shop },
      },
      include: {
        organization: { select: { name: true } },
        providerCredential: true,
      },
      take: 2,
    });
    if (records.length === 0) return null;
    if (records.length > 1) {
      throw apiError(
        HttpStatus.CONFLICT,
        SHOPIFY_OAUTH_ERROR_CODES.ambiguousShop,
        "Shopify shop is connected to more than one SelfX Store.",
      );
    }
    const record = records[0]!;
    let client: ShopifyAdminClient | null = null;
    if (needsAdminClient && record.status !== IntegrationStatus.DISCONNECTED) {
      if (!record.providerCredential) {
        throw apiError(
          HttpStatus.CONFLICT,
          SHOPIFY_OAUTH_ERROR_CODES.notConnected,
          "Shopify provider credentials are unavailable.",
        );
      }
      const accessToken = await this.currentAccessToken(
        record.id,
        record.metadata,
        record.providerCredential,
        config,
      );
      client = shopifyClient(shop, accessToken, config, true);
    }
    return {
      integrationId: record.id,
      storeId: record.organizationId,
      storeName: record.organization.name,
      externalAccountId: record.externalAccountId,
      externalAccountName: record.externalAccountName,
      status: record.status,
      client,
    };
  }

  successRedirect(storeId: string, status: "COMPLETED" | "FAILED"): string {
    const url = new URL(
      "/app/integrations/shopify",
      requireConfig().webBaseUrl,
    );
    url.searchParams.set("storeId", storeId);
    url.searchParams.set(
      "oauth",
      status === "COMPLETED" ? "success" : "sync_failed",
    );
    return url.toString();
  }

  private async runSync(
    integrationId: string,
    accessToken: string,
    shop: string,
    storeName: string,
  ) {
    const config = requireConfig();
    const { organizationId } = await this.prisma.integration.findUniqueOrThrow({
      where: { id: integrationId },
      select: { organizationId: true },
    });
    const connector = new ShopifyCatalogConnector(
      shopifyClient(shop, accessToken, config),
      {
        sync: (input: SelfxCatalogSyncRequest) =>
          this.catalogSync.sync(
            {
              credentialId: `shopify-oauth:${integrationId}`,
              integrationId,
              integrationType: "SHOPIFY",
              tokenPrefix: "shopify-oauth",
              storeId: organizationId,
              storeName,
              externalAccountId: null,
              externalAccountName: shop,
              scopes: ["catalog:sync"],
            },
            input,
          ),
      },
      25,
    );
    return connector.runFullSync();
  }

  private async currentAccessToken(
    integrationId: string,
    metadata: Prisma.JsonValue | null,
    credential: ShopifyProviderCredentialRecord,
    config: ShopifyOauthConfig,
  ): Promise<string> {
    let secrets = decryptProviderSecret<StoredShopifySecrets>(
      credential,
      config.encryptionKey,
    );
    if (
      !credential.accessTokenExpiresAt ||
      credential.accessTokenExpiresAt.getTime() <=
        Date.now() + refreshBeforeExpiryMs
    ) {
      const refreshed = await refreshToken(
        metadata,
        secrets.refreshToken,
        config,
      );
      const scopes = validateScopes(
        refreshed.scope,
        storedScopes(credential.scopes),
      );
      secrets = requiredTokenSecrets(refreshed);
      const encrypted = encryptProviderSecret(secrets, config.encryptionKey);
      await this.prisma.integrationProviderCredential.update({
        where: { integrationId },
        data: {
          ...encrypted,
          keyVersion: config.encryptionKeyVersion,
          scopes,
          accessTokenExpiresAt: expiryFromSeconds(refreshed.expires_in),
          refreshTokenExpiresAt: expiryFromSeconds(
            refreshed.refresh_token_expires_in,
          ),
        },
      });
    }
    return secrets.accessToken;
  }

  private async recordSyncResult(
    integrationId: string,
    success: boolean,
    report: ShopifyCatalogSyncReport | null,
    actorUserId?: string,
  ) {
    const current = await this.prisma.integration.findUniqueOrThrow({
      where: { id: integrationId },
      select: { metadata: true, organizationId: true },
    });
    const metadata = jsonObject(current.metadata);
    await this.prisma.integration.update({
      where: { id: integrationId },
      data: {
        status: success ? IntegrationStatus.ACTIVE : IntegrationStatus.ERROR,
        metadata: {
          ...metadata,
          lastCatalogSyncAt: new Date().toISOString(),
          lastCatalogSyncStatus: success ? "COMPLETED" : "FAILED",
          ...(report ? { lastCatalogSyncProducts: report.productsRead } : {}),
        },
      },
    });
    if (actorUserId) {
      await this.prisma.auditLog.create({
        data: {
          id: createSelfxId(),
          action: success
            ? "SHOPIFY_CATALOG_SYNC_COMPLETED"
            : "SHOPIFY_CATALOG_SYNC_FAILED",
          actorUserId,
          organizationId: current.organizationId,
          resourceType: "integration",
          resourceId: integrationId,
          metadata: report
            ? {
                products_read: report.productsRead,
                variants_read: report.variantsRead,
                created: report.created,
                updated: report.updated,
                archived: report.archived,
              }
            : undefined,
        },
      });
    }
  }
}

export function verifyShopifyCallbackHmac(
  query: Record<string, unknown>,
  secret: string,
): boolean {
  const received = typeof query.hmac === "string" ? query.hmac : "";
  if (!/^[a-f0-9]{64}$/i.test(received)) return false;
  const message = Object.entries(query)
    .filter(
      ([key, value]) =>
        key !== "hmac" && key !== "signature" && typeof value === "string",
    )
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value as string}`)
    .join("&");
  const expected = createHmac("sha256", secret).update(message).digest();
  return timingSafeEqual(expected, Buffer.from(received, "hex"));
}

export function normalizeShopDomain(value: string): string {
  const clean = value.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(clean)) {
    throw apiError(
      HttpStatus.BAD_REQUEST,
      SHOPIFY_OAUTH_ERROR_CODES.invalidState,
      "Shopify shop domain is invalid.",
    );
  }
  return clean;
}

function requireConfig(): ShopifyOauthConfig {
  try {
    return loadShopifyOauthConfig();
  } catch {
    throw apiError(
      HttpStatus.SERVICE_UNAVAILABLE,
      SHOPIFY_OAUTH_ERROR_CODES.configuration,
      "Shopify connection is not configured on this SelfX server.",
    );
  }
}

function hashState(value: string) {
  return createHash("sha256").update(value).digest("hex");
}
function invalidState() {
  return apiError(
    HttpStatus.UNAUTHORIZED,
    SHOPIFY_OAUTH_ERROR_CODES.invalidState,
    "Shopify connection request is invalid or expired.",
  );
}
function assertFreshTimestamp(value: string) {
  const milliseconds = Number(value) * (value.length === 10 ? 1000 : 1);
  if (
    !Number.isFinite(milliseconds) ||
    Math.abs(Date.now() - milliseconds) > oauthStateLifetimeMs
  )
    throw apiError(
      HttpStatus.UNAUTHORIZED,
      SHOPIFY_OAUTH_ERROR_CODES.invalidTimestamp,
      "Shopify callback timestamp is invalid.",
    );
}
function validateScopes(value?: string, fallback: string[] = []): string[] {
  const scopes = value
    ? value
        .split(",")
        .map((scope) => scope.trim())
        .filter(Boolean)
    : fallback;
  if (
    !scopes.includes(requiredScope) ||
    scopes.some((scope) => scope.startsWith("write_"))
  )
    throw apiError(
      HttpStatus.BAD_GATEWAY,
      SHOPIFY_OAUTH_ERROR_CODES.scope,
      "Shopify did not grant the required read-only product scope.",
    );
  return scopes;
}

function storedScopes(value: Prisma.JsonValue): string[] {
  return Array.isArray(value)
    ? value.filter((scope): scope is string => typeof scope === "string")
    : [];
}
function requiredTokenSecrets(
  token: ShopifyTokenResponse,
): StoredShopifySecrets {
  if (!token.access_token || !token.refresh_token)
    throw apiError(
      HttpStatus.BAD_GATEWAY,
      SHOPIFY_OAUTH_ERROR_CODES.tokenExchange,
      "Shopify did not return complete offline credentials.",
    );
  return { accessToken: token.access_token, refreshToken: token.refresh_token };
}
function expiryFromSeconds(value?: number): Date {
  if (!Number.isFinite(value) || (value ?? 0) <= 0)
    throw apiError(
      HttpStatus.BAD_GATEWAY,
      SHOPIFY_OAUTH_ERROR_CODES.tokenExchange,
      "Shopify returned invalid token expiry metadata.",
    );
  return new Date(Date.now() + value! * 1000);
}
async function exchangeAuthorizationCode(
  shop: string,
  code: string,
  config: ShopifyOauthConfig,
) {
  return tokenRequest(
    shop,
    new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code,
      expiring: "1",
    }),
  );
}
async function refreshToken(
  metadata: Prisma.JsonValue | null,
  refreshTokenValue: string,
  config: ShopifyOauthConfig,
) {
  return tokenRequest(
    shopDomainFromMetadata(metadata),
    new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      grant_type: "refresh_token",
      refresh_token: refreshTokenValue,
    }),
  );
}
async function tokenRequest(
  shop: string,
  body: URLSearchParams,
): Promise<ShopifyTokenResponse> {
  const response = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body,
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok)
    throw apiError(
      HttpStatus.BAD_GATEWAY,
      SHOPIFY_OAUTH_ERROR_CODES.tokenExchange,
      "Shopify rejected the access-token request.",
    );
  return (await response.json()) as ShopifyTokenResponse;
}
function shopifyClient(
  shop: string,
  accessToken: string,
  config: ShopifyOauthConfig,
  webhookRequest = false,
) {
  return new ShopifyAdminClient({
    shopDomain: shop,
    accessToken,
    apiVersion: config.apiVersion,
    productPageSize: 50,
    ...(webhookRequest
      ? {
          maxAttempts: 1,
          requestTimeoutMs: 3_000,
          operationTimeoutMs: 3_000,
        }
      : { requestTimeoutMs: 30_000 }),
  });
}
function shopDomainFromMetadata(metadata: Prisma.JsonValue | null): string {
  const shop = jsonObject(metadata).shopDomain;
  if (typeof shop !== "string")
    throw apiError(
      HttpStatus.CONFLICT,
      SHOPIFY_OAUTH_ERROR_CODES.notConnected,
      "Connected Shopify domain is missing.",
    );
  return normalizeShopDomain(shop);
}
function jsonObject(value: Prisma.JsonValue | null): Prisma.JsonObject {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Prisma.JsonObject)
    : {};
}
function apiError(status: HttpStatus, code: string, message: string) {
  return new ApiErrorException(status, code, message);
}
async function createOauthAudit(
  tx: Prisma.TransactionClient,
  actorUserId: string,
  storeId: string,
  integrationId: string,
  shop: string,
  scopes: string[],
) {
  await tx.auditLog.create({
    data: {
      id: createSelfxId(),
      action: "SHOPIFY_OAUTH_CONNECTED",
      actorUserId,
      organizationId: storeId,
      resourceType: "integration",
      resourceId: integrationId,
      metadata: { shop_domain: shop, scopes },
    },
  });
}
