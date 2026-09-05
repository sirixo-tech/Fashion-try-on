import { describe, expect, it, vi } from "vitest";

import { GarmentPreviewSettingsService } from "./garment-preview-settings.service.js";

describe("GarmentPreviewSettingsService Store capabilities", () => {
  it("defaults existing Stores to garment Try-On capability", async () => {
    const prisma = createPrismaMock();
    const service = new GarmentPreviewSettingsService(prisma as never);
    prisma.$queryRaw.mockResolvedValue([]);
    prisma.storePermissionGrant.findFirst.mockResolvedValue(null);
    prisma.organization.findUnique.mockResolvedValue({ settings: {} });

    const settings = await service.storeSettings("store-1");

    expect(settings.enabledTryOnCapabilities).toEqual(["GARMENT_TRY_ON"]);
    expect(settings.garmentTryOnEnabled).toBe(true);
    expect(settings.jewelleryTryOnEnabled).toBe(false);
  });

  it("stores jewellery-only capability and turns off captured garment preview", () => {
    const service = new GarmentPreviewSettingsService(
      createPrismaMock() as never,
    );

    const settings = service.storeSettingsFromValue(
      {
        virtualTryOn: {
          capturedGarmentPreviewEnabled: true,
          enabledTryOnCapabilities: ["GARMENT_TRY_ON"],
        },
      },
      { enabledTryOnCapabilities: ["JEWELLERY_TRY_ON"] },
    ) as Record<string, unknown>;

    expect(settings).toEqual({
      virtualTryOn: {
        capturedGarmentPreviewEnabled: false,
        enabledTryOnCapabilities: ["JEWELLERY_TRY_ON"],
      },
    });
  });

  it("keeps captured garment preview when garment capability remains enabled", () => {
    const service = new GarmentPreviewSettingsService(
      createPrismaMock() as never,
    );

    const settings = service.storeSettingsFromValue(
      {
        virtualTryOn: {
          capturedGarmentPreviewEnabled: true,
          enabledTryOnCapabilities: ["GARMENT_TRY_ON"],
        },
      },
      { enabledTryOnCapabilities: ["GARMENT_TRY_ON", "JEWELLERY_TRY_ON"] },
    ) as Record<string, unknown>;

    expect(settings).toEqual({
      virtualTryOn: {
        capturedGarmentPreviewEnabled: true,
        enabledTryOnCapabilities: ["GARMENT_TRY_ON", "JEWELLERY_TRY_ON"],
      },
    });
  });

  it("does not resolve captured garment preview without garment Try-On", () => {
    const service = new GarmentPreviewSettingsService(
      createPrismaMock() as never,
    );

    const settings = service.resolve({
      platformGarmentPreviewEnabled: true,
      storeHasGarmentPreviewPermission: true,
      storeGarmentPreviewEnabled: true,
      enabledTryOnCapabilities: ["JEWELLERY_TRY_ON"],
    });

    expect(settings.effectiveGarmentPreviewEnabled).toBe(false);
  });
});

function createPrismaMock() {
  return {
    $queryRaw: vi.fn(),
    organization: {
      findUnique: vi.fn(),
    },
    storePermissionGrant: {
      findFirst: vi.fn(),
    },
  };
}
