import { describe, expect, it } from "vitest";
import sharp from "sharp";

import { GarmentPreprocessingService } from "./garment-preprocessing.service.js";

const invalidGarmentImageDataUri = "data:image/png;base64,Z2FybWVudA==";

describe("GarmentPreprocessingService", () => {
  it("returns the original garment image when preprocessing is disabled", async () => {
    const service = new DisabledGarmentPreprocessingService();

    await expect(
      service.prepare({ garmentImageDataUri: invalidGarmentImageDataUri }),
    ).resolves.toMatchObject({
      originalGarmentImageDataUri: invalidGarmentImageDataUri,
      providerGarmentImageDataUri: invalidGarmentImageDataUri,
      preprocessingEnabled: false,
      status: "DISABLED",
      providerInputImage: "ORIGINAL",
    });
  });

  it("normalizes a valid garment image when preprocessing is enabled", async () => {
    const service = new EnabledGarmentPreprocessingService();
    const garmentImageDataUri = await createPngDataUri();

    const result = await service.prepare({ garmentImageDataUri });

    expect(result).toMatchObject({
      preprocessingEnabled: true,
      status: "NORMALIZED",
      providerInputImage: "PREPROCESSED",
    });
    expect(result.originalGarmentImageDataUri).toBe(garmentImageDataUri);
    expect(result.providerGarmentImageDataUri).toMatch(
      /^data:image\/jpeg;base64,/u,
    );
    expect(result.maskImageDataUri).toBeUndefined();
  });

  it("generates a placeholder mask when mask generation is enabled", async () => {
    const service = new MaskEnabledGarmentPreprocessingService();
    const garmentImageDataUri = await createPngDataUri();

    const result = await service.prepare({ garmentImageDataUri });

    expect(result.maskImageDataUri).toMatch(/^data:image\/png;base64,/u);

    const providerImage = await metadataFromDataUri(
      result.providerGarmentImageDataUri,
    );
    const maskImage = await metadataFromDataUri(result.maskImageDataUri ?? "");
    expect(maskImage).toMatchObject({
      width: providerImage.width,
      height: providerImage.height,
    });
  });

  it("falls back to the original garment image when normalization fails", async () => {
    const service = new EnabledGarmentPreprocessingService();

    await expect(
      service.prepare({ garmentImageDataUri: invalidGarmentImageDataUri }),
    ).resolves.toMatchObject({
      originalGarmentImageDataUri: invalidGarmentImageDataUri,
      providerGarmentImageDataUri: invalidGarmentImageDataUri,
      preprocessingEnabled: true,
      status: "FALLBACK",
      providerInputImage: "ORIGINAL",
      fallbackReason:
        "Garment preprocessing failed; original garment image was used.",
    });
  });
});

class DisabledGarmentPreprocessingService extends GarmentPreprocessingService {
  protected override preprocessingEnabled(): boolean {
    return false;
  }
}

class EnabledGarmentPreprocessingService extends GarmentPreprocessingService {
  protected override preprocessingEnabled(): boolean {
    return true;
  }
}

class MaskEnabledGarmentPreprocessingService extends GarmentPreprocessingService {
  protected override preprocessingEnabled(): boolean {
    return true;
  }

  protected override maskGenerationEnabled(): boolean {
    return true;
  }
}

async function createPngDataUri(): Promise<string> {
  const buffer = await sharp({
    create: {
      width: 32,
      height: 24,
      channels: 3,
      background: { r: 220, g: 40, b: 80 },
    },
  })
    .png()
    .toBuffer();

  return `data:image/png;base64,${buffer.toString("base64")}`;
}

async function metadataFromDataUri(dataUri: string): Promise<sharp.Metadata> {
  const match = /^data:image\/(?:jpeg|png);base64,(.+)$/u.exec(dataUri);
  if (!match) {
    throw new Error("Invalid test image data URI.");
  }

  return sharp(Buffer.from(match[1] ?? "", "base64")).metadata();
}
