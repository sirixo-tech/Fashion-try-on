import { describe, expect, it, vi } from "vitest";

import { JewelleryCaptureRequirementsService } from "../try-on/jewellery/jewellery-capture-requirements.service.js";
import { CatalogService } from "./catalog.service.js";

describe("CatalogService jewellery capture requirements", () => {
  it("uses the selected Store catalog product's stored jewellery type", async () => {
    const queryRaw = vi
      .fn()
      .mockResolvedValueOnce([{ has_products: true }])
      .mockResolvedValueOnce([
        {
          id: "11111111-1111-4111-8111-111111111111",
          jewellery_type: "EARRING",
        },
      ]);
    const service = new CatalogService(
      { $queryRaw: queryRaw } as never,
      {} as never,
      new JewelleryCaptureRequirementsService(),
    );

    const result = await service.getKioskJewelleryCaptureRequirements(
      "22222222-2222-4222-8222-222222222222",
      "11111111-1111-4111-8111-111111111111",
    );

    expect(result).toMatchObject({
      productId: "11111111-1111-4111-8111-111111111111",
      jewelleryType: "EARRING",
      channel: "KIOSK",
      personInputMethods: ["CAPTURE"],
      targetRegion: "FACE_AND_EARS",
      guide: "FACE_AND_EARS",
    });
    expect(queryRaw).toHaveBeenCalledTimes(2);
  });
});
