import { createHmac, timingSafeEqual } from "node:crypto";

import { HttpStatus, Injectable } from "@nestjs/common";
import {
  IntegrationCredentialStatus,
  IntegrationEventStatus,
  IntegrationStatus,
  Prisma,
} from "@prisma/client";
import {
  mapShopifyProduct,
  type SelfxCatalogProduct,
} from "@selfx/shopify-integration";

import { createSelfxId } from "@selfx/database";

import { ApiErrorException } from "../common/api-error.exception.js";
import { PrismaService } from "../database/prisma.service.js";
import { IntegrationCatalogSyncService } from "./integration-catalog-sync.service.js";
import { type IntegrationCredentialContext } from "./integration-token-auth.service.js";
import { loadShopifyOauthConfig } from "./shopify-oauth.config.js";
import {
  normalizeShopDomain,
  ShopifyOauthService,
  type ShopifyWebhookConnection,
} from "./shopify-oauth.service.js";

const productTopics = new Set(["products/create", "products/update"]);
const supportedTopics = new Set([
  ...productTopics,
  "products/delete",
  "app/uninstalled",
]);
const receivedEventLeaseMs = 2 * 60 * 1000;

type HeaderValue = string | string[] | undefined;

export type ShopifyWebhookRequest = {
  rawBody?: Buffer;
  headers: Record<string, HeaderValue>;
};

export type ShopifyWebhookResponse = {
  accepted: true;
  duplicate?: true;
  ignored?: true;
};

export const SHOPIFY_WEBHOOK_ERROR_CODES = {
  configuration: "SHOPIFY_WEBHOOK_CONFIGURATION_ERROR",
  rawBodyUnavailable: "SHOPIFY_WEBHOOK_RAW_BODY_UNAVAILABLE",
  invalidHmac: "SHOPIFY_WEBHOOK_HMAC_INVALID",
  invalidRequest: "SHOPIFY_WEBHOOK_REQUEST_INVALID",
} as const;

@Injectable()
export class ShopifyWebhookService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly oauth: ShopifyOauthService,
    private readonly catalogSync: IntegrationCatalogSyncService,
  ) {}

  async handle(
    request: ShopifyWebhookRequest,
  ): Promise<ShopifyWebhookResponse> {
    const rawBody = request.rawBody;
    if (!Buffer.isBuffer(rawBody)) {
      throw apiError(
        HttpStatus.INTERNAL_SERVER_ERROR,
        SHOPIFY_WEBHOOK_ERROR_CODES.rawBodyUnavailable,
        "Exact Shopify webhook body is unavailable for verification.",
      );
    }
    const secret = webhookSecret();
    const receivedHmac = singleHeader(request.headers["x-shopify-hmac-sha256"]);
    if (!verifyShopifyWebhookHmac(rawBody, receivedHmac, secret)) {
      throw apiError(
        HttpStatus.UNAUTHORIZED,
        SHOPIFY_WEBHOOK_ERROR_CODES.invalidHmac,
        "Shopify webhook signature is invalid.",
      );
    }

    const topic = requiredHeader(request, "x-shopify-topic", 120);
    const shop = normalizeShopDomain(
      requiredHeader(request, "x-shopify-shop-domain", 180),
    );
    const webhookId = requiredHeader(request, "x-shopify-webhook-id", 220);
    const triggeredAt = validTimestamp(
      requiredHeader(request, "x-shopify-triggered-at", 80),
    );
    if (!supportedTopics.has(topic)) {
      throw invalidRequest("Shopify webhook topic is not supported.");
    }
    const payload = parsePayload(rawBody);
    const needsAdminClient = productTopics.has(topic);
    const connection = await this.oauth.webhookConnection(
      shop,
      needsAdminClient,
    );
    if (!connection) {
      return { accepted: true, ignored: true };
    }

    const claimed = await this.claimEvent(connection, webhookId, topic, {
      shopDomain: shop,
      apiVersion:
        singleHeader(request.headers["x-shopify-api-version"]) ?? null,
      triggeredAt: triggeredAt.toISOString(),
    });
    if (!claimed.shouldProcess) {
      return { accepted: true, duplicate: true };
    }

    try {
      if (
        connection.status === IntegrationStatus.DISCONNECTED &&
        topic !== "app/uninstalled"
      ) {
        await this.finishEvent(claimed.eventId, IntegrationEventStatus.IGNORED);
        return { accepted: true, ignored: true };
      }
      if (productTopics.has(topic)) {
        await this.syncProduct(connection, payload, triggeredAt);
      } else if (topic === "products/delete") {
        await this.archiveProduct(connection, payload, triggeredAt);
      } else {
        await this.disconnectUninstalledApp(connection, webhookId, triggeredAt);
      }
      await this.finishEvent(claimed.eventId, IntegrationEventStatus.PROCESSED);
      return { accepted: true };
    } catch (error) {
      await this.prisma.integrationEvent
        .update({
          where: { id: claimed.eventId },
          data: { status: IntegrationEventStatus.FAILED, processedAt: null },
        })
        .catch(() => undefined);
      throw error;
    }
  }

  private async syncProduct(
    connection: ShopifyWebhookConnection,
    payload: Record<string, unknown>,
    triggeredAt: Date,
  ): Promise<void> {
    if (!connection.client) {
      throw invalidRequest("Shopify Admin API connection is unavailable.");
    }
    const productId = productGid(payload);
    const result = await connection.client.getProduct(productId);
    const product = result.product
      ? mapShopifyProduct(result.product, result.currencyCode)
      : archivedProduct(productId, triggeredAt);
    await this.catalogSync.sync(integrationContext(connection), {
      mode: "INCREMENTAL",
      products: [product],
    });
  }

  private async archiveProduct(
    connection: ShopifyWebhookConnection,
    payload: Record<string, unknown>,
    triggeredAt: Date,
  ): Promise<void> {
    await this.catalogSync.sync(integrationContext(connection), {
      mode: "INCREMENTAL",
      products: [archivedProduct(productGid(payload), triggeredAt)],
    });
  }

  private async disconnectUninstalledApp(
    connection: ShopifyWebhookConnection,
    webhookId: string,
    triggeredAt: Date,
  ): Promise<void> {
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.integrationProviderCredential.deleteMany({
        where: { integrationId: connection.integrationId },
      });
      await tx.integrationOauthState.deleteMany({
        where: {
          organizationId: connection.storeId,
          provider: "SHOPIFY",
          consumedAt: null,
        },
      });
      await tx.integrationCredential.updateMany({
        where: {
          integrationId: connection.integrationId,
          status: IntegrationCredentialStatus.ACTIVE,
        },
        data: {
          status: IntegrationCredentialStatus.REVOKED,
          revokedAt: now,
        },
      });
      await tx.integration.update({
        where: { id: connection.integrationId },
        data: {
          status: IntegrationStatus.DISCONNECTED,
          disconnectedAt: now,
        },
      });
      await tx.auditLog.create({
        data: {
          id: createSelfxId(),
          action: "SHOPIFY_APP_UNINSTALLED",
          organizationId: connection.storeId,
          resourceType: "integration",
          resourceId: connection.integrationId,
          metadata: {
            webhook_id: webhookId,
            triggered_at: triggeredAt.toISOString(),
          },
        },
      });
    });
    await this.catalogSync.archiveIntegrationCatalog(
      connection.integrationId,
      now,
    );
  }

  private async claimEvent(
    connection: ShopifyWebhookConnection,
    externalEventId: string,
    eventType: string,
    payload: Prisma.InputJsonObject,
  ): Promise<{ eventId: string; shouldProcess: boolean }> {
    const id = createSelfxId();
    try {
      await this.prisma.integrationEvent.create({
        data: {
          id,
          integrationId: connection.integrationId,
          organizationId: connection.storeId,
          externalEventId,
          eventType,
          status: IntegrationEventStatus.RECEIVED,
          payload,
        },
      });
      return { eventId: id, shouldProcess: true };
    } catch (error) {
      if (!isUniqueConstraintError(error)) throw error;
    }

    const existing = await this.prisma.integrationEvent.findUniqueOrThrow({
      where: {
        integrationId_externalEventId: {
          integrationId: connection.integrationId,
          externalEventId,
        },
      },
      select: { id: true, status: true, updatedAt: true },
    });
    const currentlyProcessing =
      existing.status === IntegrationEventStatus.RECEIVED &&
      existing.updatedAt.getTime() > Date.now() - receivedEventLeaseMs;
    if (
      currentlyProcessing ||
      existing.status === IntegrationEventStatus.PROCESSED ||
      existing.status === IntegrationEventStatus.IGNORED
    ) {
      return { eventId: existing.id, shouldProcess: false };
    }
    await this.prisma.integrationEvent.update({
      where: { id: existing.id },
      data: {
        status: IntegrationEventStatus.RECEIVED,
        processedAt: null,
        eventType,
        payload,
      },
    });
    return { eventId: existing.id, shouldProcess: true };
  }

  private async finishEvent(
    eventId: string,
    status: IntegrationEventStatus,
  ): Promise<void> {
    await this.prisma.integrationEvent.update({
      where: { id: eventId },
      data: { status, processedAt: new Date() },
    });
  }
}

export function verifyShopifyWebhookHmac(
  rawBody: Buffer,
  receivedHmac: string | undefined,
  secret: string,
): boolean {
  if (!receivedHmac) return false;
  const received = Buffer.from(receivedHmac, "base64");
  if (received.length !== 32) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest();
  return timingSafeEqual(expected, received);
}

function integrationContext(
  connection: ShopifyWebhookConnection,
): IntegrationCredentialContext {
  return {
    credentialId: `shopify-webhook:${connection.integrationId}`,
    integrationId: connection.integrationId,
    integrationType: "SHOPIFY" as const,
    tokenPrefix: "shopify-webhook",
    storeId: connection.storeId,
    storeName: connection.storeName,
    externalAccountId: connection.externalAccountId,
    externalAccountName: connection.externalAccountName,
    scopes: ["catalog:sync"],
  };
}

function archivedProduct(
  productId: string,
  timestamp: Date,
): SelfxCatalogProduct {
  return {
    externalProductId: productId,
    title: "Deleted Shopify product",
    handle: null,
    description: null,
    status: "ARCHIVED",
    productUrl: null,
    featuredImageUrl: null,
    priceAmountCents: null,
    priceCurrency: null,
    sourceUpdatedAt: timestamp.toISOString(),
    variants: [],
  };
}

function productGid(payload: Record<string, unknown>): string {
  const graphqlId = payload.admin_graphql_api_id;
  if (
    typeof graphqlId === "string" &&
    /^gid:\/\/shopify\/Product\/\d+$/.test(graphqlId)
  ) {
    return graphqlId;
  }
  const id = payload.id;
  const numericId =
    typeof id === "string"
      ? id
      : typeof id === "number" && Number.isSafeInteger(id)
        ? String(id)
        : "";
  if (!/^\d+$/.test(numericId)) {
    throw invalidRequest("Shopify product identifier is invalid.");
  }
  return `gid://shopify/Product/${numericId}`;
}

function parsePayload(rawBody: Buffer): Record<string, unknown> {
  try {
    const value = JSON.parse(rawBody.toString("utf8")) as unknown;
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error("not an object");
    }
    return value as Record<string, unknown>;
  } catch {
    throw invalidRequest("Shopify webhook body must be a JSON object.");
  }
}

function requiredHeader(
  request: ShopifyWebhookRequest,
  name: string,
  maxLength: number,
): string {
  const value = singleHeader(request.headers[name])?.trim();
  if (!value || value.length > maxLength) {
    throw invalidRequest(`Shopify webhook header ${name} is invalid.`);
  }
  return value;
}

function singleHeader(value: HeaderValue): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function validTimestamp(value: string): Date {
  const timestamp = new Date(value);
  if (!Number.isFinite(timestamp.getTime())) {
    throw invalidRequest("Shopify webhook timestamp is invalid.");
  }
  return timestamp;
}

function webhookSecret(): string {
  try {
    return loadShopifyOauthConfig().clientSecret;
  } catch {
    throw apiError(
      HttpStatus.SERVICE_UNAVAILABLE,
      SHOPIFY_WEBHOOK_ERROR_CODES.configuration,
      "Shopify webhooks are not configured on this SelfX server.",
    );
  }
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2002"
  );
}

function invalidRequest(message: string): ApiErrorException {
  return apiError(
    HttpStatus.BAD_REQUEST,
    SHOPIFY_WEBHOOK_ERROR_CODES.invalidRequest,
    message,
  );
}

function apiError(status: HttpStatus, code: string, message: string) {
  return new ApiErrorException(status, code, message);
}
