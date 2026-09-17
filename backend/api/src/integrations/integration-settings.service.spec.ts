import { IntegrationType } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import { IntegrationSettingsService } from "./integration-settings.service.js";

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

describe("IntegrationSettingsService", () => {
  it("stores the Shopify Try-On mode without discarding integration metadata", async () => {
    const prisma = {
      integration: {
        findFirst: vi.fn().mockResolvedValue({
          id: "integration-1",
          metadata: { shopDomain: "demo.myshopify.com" },
        }),
        update: vi.fn().mockResolvedValue({ id: "integration-1" }),
      },
    };
    const result = await new IntegrationSettingsService(
      prisma as never,
    ).updateShopifySettings(credential, { tryOnMode: "BOTH" });

    expect(result).toEqual({ tryOnMode: "BOTH" });
    expect(prisma.integration.update).toHaveBeenCalledWith({
      where: { id: "integration-1" },
      data: {
        metadata: {
          shopDomain: "demo.myshopify.com",
          tryOnMode: "BOTH",
        },
      },
    });
  });

  it("rejects non-Shopify credentials", async () => {
    const prisma = { integration: { findFirst: vi.fn(), update: vi.fn() } };
    await expect(
      new IntegrationSettingsService(prisma as never).updateShopifySettings(
        { ...credential, integrationType: IntegrationType.WOOCOMMERCE },
        { tryOnMode: "GARMENT" },
      ),
    ).rejects.toMatchObject({ status: 400 });
    expect(prisma.integration.update).not.toHaveBeenCalled();
  });
});
