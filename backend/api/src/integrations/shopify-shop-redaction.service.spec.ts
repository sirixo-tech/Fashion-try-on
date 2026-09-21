import { IntegrationEventStatus, IntegrationStatus } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import { ShopifyShopRedactionService } from "./shopify-shop-redaction.service.js";

describe("Shopify shop redaction", () => {
  it("purges Shopify-owned data while retaining the SelfX Store", async () => {
    const tx = transactionMock();
    const prisma = {
      externalProductMapping: {
        findMany: vi.fn().mockResolvedValue([
          {
            productId: "product-1",
            product: { imageStorageKey: "catalog/product-1.jpg" },
          },
        ]),
      },
      shopifyStorefrontTryOnSession: {
        findMany: vi.fn().mockResolvedValue([
          {
            tryOnSessionId: "session-1",
            tryOnSession: {
              assets: [
                { storageKey: "try-on/person.jpg" },
                { storageKey: "try-on/result.jpg" },
              ],
            },
          },
        ]),
      },
      $transaction: vi.fn((callback: (client: typeof tx) => Promise<unknown>) =>
        callback(tx),
      ),
    };
    const deleteObject = vi.fn().mockResolvedValue(undefined);
    const service = new ShopifyShopRedactionService(
      prisma as never,
      { deleteObject } as never,
    );

    await service.redact({
      connection: {
        integrationId: "integration-1",
        storeId: "store-1",
        storeName: "Demo Store",
        externalAccountId: "gid://shopify/Shop/456",
        externalAccountName: "Demo Shop",
        status: IntegrationStatus.DISCONNECTED,
        client: null,
      },
      eventId: "event-1",
      webhookId: "webhook-1",
      triggeredAt: new Date("2026-09-07T10:00:00.000Z"),
      apiVersion: "2026-07",
      shopDomain: "demo.myshopify.com",
    });

    expect(deleteObject).toHaveBeenCalledTimes(3);
    expect(tx.externalProductMapping.deleteMany).toHaveBeenCalledWith({
      where: { integrationId: "integration-1" },
    });
    expect(tx.kioskTryOnRun.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          productId: null,
          externalProductId: null,
          externalProductName: null,
          externalProductPrice: null,
          resultImage: null,
        }),
      }),
    );
    expect(tx.creditLedgerEntry.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          integrationId: null,
          productId: null,
          metadata: { redacted: true },
        }),
      }),
    );
    expect(tx.product.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ["product-1"] } },
    });
    expect(tx.shopifyStorefrontTryOnSession.deleteMany).toHaveBeenCalled();
    expect(tx.tryOnSession.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ["session-1"] } },
    });
    expect(tx.integrationProviderCredential.deleteMany).toHaveBeenCalled();
    expect(tx.integrationCredential.deleteMany).toHaveBeenCalled();
    expect(tx.shopifyLinkSession.deleteMany).toHaveBeenCalled();
    expect(tx.integration.update).toHaveBeenCalledWith({
      where: { id: "integration-1" },
      data: {
        status: IntegrationStatus.DISCONNECTED,
        externalAccountId: null,
        externalAccountName: null,
        metadata: { privacyStatus: "REDACTED" },
        disconnectedAt: expect.any(Date),
      },
    });
    expect(tx.integrationEvent.update).toHaveBeenCalledWith({
      where: { id: "event-1" },
      data: {
        status: IntegrationEventStatus.PROCESSED,
        processedAt: expect.any(Date),
        payload: {
          apiVersion: "2026-07",
          triggeredAt: "2026-09-07T10:00:00.000Z",
          outcome: "SHOP_DATA_REDACTED",
        },
      },
    });
    expect(tx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "SHOPIFY_SHOP_DATA_REDACTED",
          organizationId: "store-1",
        }),
      }),
    );

    expect("organization" in tx).toBe(false);
    expect("storeSubscription" in tx).toBe(false);
    expect("organizationMembership" in tx).toBe(false);
    expect("kioskDevice" in tx).toBe(false);
  });

  it("does not change database state when object deletion fails", async () => {
    const prisma = {
      externalProductMapping: {
        findMany: vi.fn().mockResolvedValue([
          {
            productId: "product-1",
            product: { imageStorageKey: "catalog/product-1.jpg" },
          },
        ]),
      },
      shopifyStorefrontTryOnSession: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      $transaction: vi.fn(),
    };
    const service = new ShopifyShopRedactionService(
      prisma as never,
      {
        deleteObject: vi
          .fn()
          .mockRejectedValue(new Error("storage unavailable")),
      } as never,
    );

    await expect(
      service.redact({
        connection: {
          integrationId: "integration-1",
          storeId: "store-1",
          storeName: "Demo Store",
          externalAccountId: "gid://shopify/Shop/456",
          externalAccountName: "Demo Shop",
          status: IntegrationStatus.DISCONNECTED,
          client: null,
        },
        eventId: "event-1",
        webhookId: "webhook-1",
        triggeredAt: new Date(),
        apiVersion: null,
        shopDomain: "demo.myshopify.com",
      }),
    ).rejects.toThrow("storage unavailable");
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

function transactionMock() {
  const mutation = () => ({
    deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    update: vi.fn().mockResolvedValue({}),
    create: vi.fn().mockResolvedValue({}),
  });
  return {
    kioskTryOnRun: mutation(),
    usageEvent: mutation(),
    creditLedgerEntry: mutation(),
    shopifyStorefrontTryOnSession: mutation(),
    tryOnLook: mutation(),
    tryOnSession: mutation(),
    tryOnAsset: mutation(),
    externalProductMapping: mutation(),
    product: mutation(),
    productCategory: mutation(),
    integrationProviderCredential: mutation(),
    integrationCredential: mutation(),
    integrationOauthState: mutation(),
    shopifyLinkSession: mutation(),
    integrationEvent: mutation(),
    auditLog: mutation(),
    integration: mutation(),
  };
}
