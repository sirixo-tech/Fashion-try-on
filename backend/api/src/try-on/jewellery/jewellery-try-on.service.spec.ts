import { describe, expect, it, vi } from "vitest";

import { JewelleryTryOnService } from "./jewellery-try-on.service.js";

describe("JewelleryTryOnService", () => {
  it("prepares provider-neutral jewellery run foundation for enabled Stores", async () => {
    const settings = {
      resolveStoreTryOnCapabilities: vi.fn(async () => [
        "GARMENT_TRY_ON",
        "JEWELLERY_TRY_ON",
      ]),
    };
    const execution = {
      assertConfigured: vi.fn(),
      metadata: vi.fn(() => ({
        provider: "perfect-corp",
        providerDisplayName: "Perfect Corp",
        model: "jewellery-virtual-try-on",
      })),
    };
    const service = new JewelleryTryOnService(settings as never, execution as never);

    const foundation = await service.prepareRunFoundation({
      storeId: "store-1",
      personImageDataUri: "data:image/jpeg;base64,cGVyc29u",
      jewelleryImageDataUri: "data:image/png;base64,amV3ZWxsZXJ5",
      jewelleryType: "RING",
      productReference: {
        productId: "product-1",
        productName: "Ruby Ring",
        sku: "RING-1",
      },
    });

    expect(settings.resolveStoreTryOnCapabilities).toHaveBeenCalledWith(
      "store-1",
    );
    expect(execution.assertConfigured).toHaveBeenCalled();
    expect(foundation).toEqual({
      vertical: "JEWELLERY",
      jewelleryType: "RING",
      provider: {
        provider: "perfect-corp",
        providerDisplayName: "Perfect Corp",
        model: "jewellery-virtual-try-on",
      },
      productReference: {
        productId: "product-1",
        productName: "Ruby Ring",
        sku: "RING-1",
      },
    });
  });

  it("blocks jewellery run foundation when the Store lacks jewellery capability", async () => {
    const settings = {
      resolveStoreTryOnCapabilities: vi.fn(async () => ["GARMENT_TRY_ON"]),
    };
    const execution = {
      assertConfigured: vi.fn(),
      metadata: vi.fn(),
    };
    const service = new JewelleryTryOnService(settings as never, execution as never);

    await expect(
      service.prepareRunFoundation({
        storeId: "store-1",
        personImageDataUri: "data:image/jpeg;base64,cGVyc29u",
        jewelleryImageDataUri: "data:image/png;base64,amV3ZWxsZXJ5",
        jewelleryType: "NECKLACE",
      }),
    ).rejects.toMatchObject({
      response: {
        error: {
          code: "TRYON_CONFIGURATION_ERROR",
          message: "Jewellery Try-On is not enabled for this Store.",
        },
      },
    });
    expect(execution.assertConfigured).not.toHaveBeenCalled();
  });
});
