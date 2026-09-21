import { Injectable } from "@nestjs/common";
import { IntegrationEventStatus, IntegrationStatus } from "@prisma/client";

import { createSelfxId } from "@selfx/database";

import { PrismaService } from "../database/prisma.service.js";
import { ObjectStorageService } from "../storage/object-storage.js";
import { type ShopifyWebhookConnection } from "./shopify-oauth.service.js";

type ShopifyShopRedactionInput = {
  connection: ShopifyWebhookConnection;
  eventId: string;
  webhookId: string;
  triggeredAt: Date;
  apiVersion: string | null;
  shopDomain: string;
};

@Injectable()
export class ShopifyShopRedactionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: ObjectStorageService,
  ) {}

  async redact(input: ShopifyShopRedactionInput): Promise<void> {
    const { connection } = input;
    const [mappings, storefrontSessions] = await Promise.all([
      this.prisma.externalProductMapping.findMany({
        where: {
          integrationId: connection.integrationId,
          externalVariantId: null,
        },
        select: {
          productId: true,
          product: { select: { imageStorageKey: true } },
        },
      }),
      this.prisma.shopifyStorefrontTryOnSession.findMany({
        where: { integrationId: connection.integrationId },
        select: {
          tryOnSessionId: true,
          tryOnSession: {
            select: {
              assets: { select: { storageKey: true } },
            },
          },
        },
      }),
    ]);
    const productIds = unique(mappings.map((mapping) => mapping.productId));
    const sessionIds = unique(
      storefrontSessions.map((session) => session.tryOnSessionId),
    );
    const storageKeys = unique([
      ...mappings.flatMap((mapping) =>
        mapping.product.imageStorageKey
          ? [mapping.product.imageStorageKey]
          : [],
      ),
      ...storefrontSessions.flatMap((session) =>
        session.tryOnSession.assets.map((asset) => asset.storageKey),
      ),
    ]);

    // Remove private objects before their ownership rows disappear. Deletes are
    // idempotent, so a database failure can safely be retried by Shopify.
    await Promise.all(
      storageKeys.map((storageKey) => this.storage.deleteObject(storageKey)),
    );

    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.kioskTryOnRun.updateMany({
        where: {
          organizationId: connection.storeId,
          OR: [
            { catalogSource: "SHOPIFY" },
            ...(productIds.length ? [{ productId: { in: productIds } }] : []),
            ...(sessionIds.length
              ? [{ tryOnSessionId: { in: sessionIds } }]
              : []),
          ],
        },
        data: {
          tryOnSessionId: null,
          personAssetId: null,
          garmentAssetId: null,
          productId: null,
          externalProductId: null,
          externalVariantId: null,
          externalSku: null,
          externalProductName: null,
          externalProductPrice: null,
          externalCurrency: null,
          resultAssetId: null,
          providerPredictionId: null,
          resultImage: null,
        },
      });
      await tx.usageEvent.updateMany({
        where: {
          organizationId: connection.storeId,
          channel: "SHOPIFY",
        },
        data: {
          tryOnSessionId: null,
          tryOnLookId: null,
          productId: null,
          metadata: { redacted: true },
        },
      });
      await tx.creditLedgerEntry.updateMany({
        where: {
          organizationId: connection.storeId,
          OR: [
            { integrationId: connection.integrationId },
            { channel: "SHOPIFY" },
          ],
        },
        data: {
          tryOnSessionId: null,
          productId: null,
          integrationId: null,
          metadata: { redacted: true },
        },
      });

      await tx.shopifyStorefrontTryOnSession.deleteMany({
        where: { integrationId: connection.integrationId },
      });
      if (sessionIds.length) {
        await tx.tryOnLook.deleteMany({
          where: { sessionId: { in: sessionIds } },
        });
        await tx.tryOnSession.updateMany({
          where: { id: { in: sessionIds } },
          data: { currentPersonAssetId: null },
        });
        await tx.tryOnAsset.deleteMany({
          where: { sessionId: { in: sessionIds } },
        });
        await tx.tryOnSession.deleteMany({
          where: { id: { in: sessionIds } },
        });
      }

      await tx.externalProductMapping.deleteMany({
        where: { integrationId: connection.integrationId },
      });
      if (productIds.length) {
        await tx.product.deleteMany({ where: { id: { in: productIds } } });
      }
      await tx.productCategory.deleteMany({
        where: {
          catalogKey: `integration:${connection.integrationId}:category:imports`,
          products: { none: {} },
        },
      });

      await tx.integrationProviderCredential.deleteMany({
        where: { integrationId: connection.integrationId },
      });
      await tx.integrationCredential.deleteMany({
        where: { integrationId: connection.integrationId },
      });
      await tx.integrationOauthState.deleteMany({
        where: {
          organizationId: connection.storeId,
          provider: "SHOPIFY",
        },
      });
      await tx.shopifyLinkSession.deleteMany({
        where: {
          OR: [
            { integrationId: connection.integrationId },
            { shopDomain: input.shopDomain },
          ],
        },
      });

      await tx.integrationEvent.updateMany({
        where: { integrationId: connection.integrationId },
        data: { payload: { redacted: true } },
      });
      await tx.integrationEvent.update({
        where: { id: input.eventId },
        data: {
          status: IntegrationEventStatus.PROCESSED,
          processedAt: now,
          payload: {
            apiVersion: input.apiVersion,
            triggeredAt: input.triggeredAt.toISOString(),
            outcome: "SHOP_DATA_REDACTED",
          },
        },
      });
      await tx.auditLog.updateMany({
        where: {
          organizationId: connection.storeId,
          OR: [
            {
              resourceType: "integration",
              resourceId: connection.integrationId,
            },
            { action: { startsWith: "SHOPIFY_" } },
          ],
        },
        data: { metadata: { redacted: true } },
      });
      await tx.integration.update({
        where: { id: connection.integrationId },
        data: {
          status: IntegrationStatus.DISCONNECTED,
          externalAccountId: null,
          externalAccountName: null,
          metadata: { privacyStatus: "REDACTED" },
          disconnectedAt: now,
        },
      });
      await tx.auditLog.create({
        data: {
          id: createSelfxId(),
          action: "SHOPIFY_SHOP_DATA_REDACTED",
          organizationId: connection.storeId,
          resourceType: "integration",
          resourceId: connection.integrationId,
          metadata: {
            webhook_id: input.webhookId,
            triggered_at: input.triggeredAt.toISOString(),
          },
        },
      });
    });
  }
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}
