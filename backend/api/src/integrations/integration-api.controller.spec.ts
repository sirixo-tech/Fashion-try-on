import { IntegrationType } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import { IntegrationApiController } from "./integration-api.controller.js";

describe("IntegrationApiController", () => {
  it("returns safe integration credential context for plugin callers", () => {
    const controller = new IntegrationApiController({ sync: vi.fn() } as never);

    const response = controller.me({
      credentialId: "credential-1",
      integrationId: "integration-1",
      integrationType: IntegrationType.SHOPIFY,
      tokenPrefix: "selfx_shopify_abcdefghijklmnop",
      storeId: "store-1",
      storeName: "Store One",
      externalAccountId: "demo.myshopify.com",
      externalAccountName: "Demo Shop",
      scopes: ["catalog:sync", "products:read"],
    });

    expect(response).toMatchObject({
      authenticated: true,
      tokenPrefix: "selfx_shopify_abcdefghijklmnop",
      integrationId: "integration-1",
      integrationType: IntegrationType.SHOPIFY,
      externalAccountId: "demo.myshopify.com",
      externalAccountName: "Demo Shop",
      scopes: ["catalog:sync", "products:read"],
      store: {
        id: "store-1",
        name: "Store One",
      },
    });
    expect(response).not.toHaveProperty("credentialId");
    expect(response.serverTime).toEqual(expect.any(String));
  });

  it("passes catalog data to the one-way sync service using token context", async () => {
    const sync = vi.fn().mockResolvedValue({
      direction: "COMMERCE_TO_SELFX",
      sourceOfTruth: "COMMERCE_PLATFORM",
      created: 1,
      updated: 0,
      archived: 0,
      ignoredAsStale: 0,
      processedAt: "2026-09-07T00:00:00.000Z",
    });
    const controller = new IntegrationApiController({ sync } as never);
    const credential = {
      credentialId: "credential-1",
      integrationId: "integration-1",
      integrationType: IntegrationType.SHOPIFY,
      tokenPrefix: "selfx_shopify_abcdefghijklmnop",
      storeId: "store-1",
      storeName: "Store One",
      externalAccountId: "demo.myshopify.com",
      externalAccountName: "Demo Shop",
      scopes: ["catalog:sync" as const],
    };
    const input = {
      mode: "INCREMENTAL" as const,
      products: [
        {
          externalProductId: "product-1",
          title: "Black Tee",
          status: "ACTIVE" as const,
          sourceUpdatedAt: "2026-09-07T00:00:00.000Z",
        },
      ],
    };

    await controller.syncCatalog(credential, input);

    expect(sync).toHaveBeenCalledWith(credential, input);
  });
});
