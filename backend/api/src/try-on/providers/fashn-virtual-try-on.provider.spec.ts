import { describe, expect, it, vi } from "vitest";

import { FashnVirtualTryOnProvider } from "./fashn-virtual-try-on.provider.js";

describe("FashnVirtualTryOnProvider", () => {
  it("preserves the existing FASHN try-on request mapping", async () => {
    process.env.FASHN_API_KEY = "fashn-key";
    const run = vi.fn(async () => ({ id: "prediction-1", error: null }));
    const provider = new TestFashnVirtualTryOnProvider({ run });

    await expect(
      provider.submit({
        personImageDataUri: "data:image/jpeg;base64,cGVyc29u",
        garmentImageDataUri: "data:image/jpeg;base64,Z2FybWVudA==",
        category: "TOP",
        garmentPhotoType: "FLAT_LAY",
        generationProfile: "BALANCED",
      }),
    ).resolves.toEqual({ providerPredictionId: "prediction-1" });

    expect(run).toHaveBeenCalledWith({
      model_name: "tryon-v1.6",
      inputs: {
        model_image: "data:image/jpeg;base64,cGVyc29u",
        garment_image: "data:image/jpeg;base64,Z2FybWVudA==",
        category: "tops",
        garment_photo_type: "flat-lay",
        mode: "balanced",
        num_samples: 1,
        output_format: "jpeg",
        segmentation_free: true,
        moderation_level: "permissive",
        return_base64: true,
      },
    });

    delete process.env.FASHN_API_KEY;
  });
});

class TestFashnVirtualTryOnProvider extends FashnVirtualTryOnProvider {
  constructor(private readonly predictions: { run: ReturnType<typeof vi.fn> }) {
    super();
  }

  protected override createClient(apiKey: string) {
    void apiKey;
    return { predictions: this.predictions } as never;
  }
}
