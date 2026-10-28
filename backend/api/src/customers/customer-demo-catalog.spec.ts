import { describe, expect, it, vi } from "vitest";
import { validateTechnicalImageBuffer } from "../common/image-validation.js";
import { validateTryOnLabUploadedImage } from "../try-on-lab/try-on-lab-multipart.js";
import { ApiErrorException } from "../common/api-error.exception.js";
import {
  DEMO_MODELS,
  DEMO_PRODUCTS,
  demoCatalog,
  demoImage,
} from "./customer-demo-catalog.js";
import { CustomerExperienceService } from "./customer-experience.service.js";

describe("shared customer demo catalog", () => {
  it("contains only valid packaged garments and full-body model images", async () => {
    for (const category of ["WOMEN", "MEN"]) {
      expect(
        DEMO_PRODUCTS.filter((item) => item.category === category),
      ).toHaveLength(10);
      expect(
        DEMO_MODELS.filter((item) => item.category === category),
      ).toHaveLength(10);
    }
    const ids = new Set<string>();
    for (const [kind, entries] of [
      ["GARMENT", DEMO_PRODUCTS],
      ["PERSON", DEMO_MODELS],
    ] as const) {
      for (const entry of entries) {
        expect(ids.has(entry.id)).toBe(false);
        ids.add(entry.id);
        const bytes = await demoImage(kind, entry.id);
        const image = validateTechnicalImageBuffer({
          buffer: bytes,
          declaredContentType: "image/webp",
          maxBytes: 16 * 1024 * 1024,
        });
        expect(image.width).toBeGreaterThan(500);
        expect(image.height).toBeGreaterThan(500);
        expect(
          validateTryOnLabUploadedImage(
            kind === "PERSON" ? "personImage" : "garmentImage",
            kind === "PERSON" ? "person" : "outfit",
            "image/webp",
            bytes,
          ).mimeType,
        ).toBe("image/webp");
      }
    }
    expect(demoCatalog().products).toHaveLength(DEMO_PRODUCTS.length);
    await expect(demoImage("GARMENT", "../private")).rejects.toBeInstanceOf(
      ApiErrorException,
    );
    await expect(
      demoImage("PERSON", "terracotta-blazer"),
    ).rejects.toBeInstanceOf(ApiErrorException);
  });
  it("copies only into a personal customer session through the normal upload path", async () => {
    const service = Object.create(
      CustomerExperienceService.prototype,
    ) as CustomerExperienceService;
    const ownSession = vi
      .fn()
      .mockResolvedValue({ customerStoreVisitId: null });
    Object.defineProperty(service, "ownSession", { value: ownSession });
    const upload = vi.fn().mockResolvedValue({ id: "temporary-asset" });
    service.upload = upload;
    const customer = { id: "customer", securityVersion: 1 };
    expect(
      await service.useDemo(
        customer,
        "session",
        "GARMENT",
        "terracotta-blazer",
      ),
    ).toEqual({ id: "temporary-asset" });
    expect(upload).toHaveBeenCalledWith(
      customer,
      "session",
      "GARMENT",
      expect.any(Buffer),
      "image/webp",
    );
    expect(ownSession).toHaveBeenCalledWith(customer.id, "session");
    await expect(
      service.useDemo(customer, "session", "PERSON", "terracotta-blazer"),
    ).rejects.toBeInstanceOf(ApiErrorException);
    ownSession.mockResolvedValue({ customerStoreVisitId: "store" });
    upload.mockClear();
    await expect(
      service.useDemo(customer, "session", "GARMENT", "terracotta-blazer"),
    ).rejects.toBeInstanceOf(ApiErrorException);
    expect(upload).not.toHaveBeenCalled();
  });
});
