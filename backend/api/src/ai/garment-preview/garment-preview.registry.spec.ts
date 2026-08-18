import { describe, expect, it } from "vitest";

import { readGarmentPreviewProviderName } from "./garment-preview.config.js";
import type {
  GarmentPreviewInput,
  GarmentPreviewResult,
} from "./garment-preview.provider.js";
import { GarmentPreviewProvider } from "./garment-preview.provider.js";
import { GarmentPreviewProviderRegistry } from "./garment-preview.registry.js";

describe("GarmentPreviewProviderRegistry", () => {
  it("resolves the FASHN preview provider from configuration", () => {
    const restore = setEnv({
      SELFX_GARMENT_PREVIEW_PROVIDER: "fashn",
      FASHN_API_KEY: "fashn-key",
      OPENAI_API_KEY: undefined,
    });
    const fashn = new FakePreviewProvider("fashn");
    const openai = new FakePreviewProvider("openai");
    const registry = new GarmentPreviewProviderRegistry(
      fashn as never,
      openai as never,
    );

    expect(registry.resolve()).toBe(fashn);
    expect(() => registry.resolve().assertConfigured()).not.toThrow();
    restore();
  });

  it("resolves the OpenAI preview provider from configuration", () => {
    const restore = setEnv({ SELFX_GARMENT_PREVIEW_PROVIDER: "openai" });
    const fashn = new FakePreviewProvider("fashn");
    const openai = new FakePreviewProvider("openai");
    const registry = new GarmentPreviewProviderRegistry(
      fashn as never,
      openai as never,
    );

    expect(registry.resolve()).toBe(openai);
    restore();
  });

  it("rejects unsupported preview provider configuration", () => {
    const restore = setEnv({ SELFX_GARMENT_PREVIEW_PROVIDER: "not-real" });

    expect(() => readGarmentPreviewProviderName()).toThrow(
      /Unsupported SELFX_GARMENT_PREVIEW_PROVIDER/,
    );
    restore();
  });
});

class FakePreviewProvider extends GarmentPreviewProvider {
  constructor(private readonly providerName: "fashn" | "openai") {
    super();
  }

  override assertConfigured(): void {
    return undefined;
  }

  override metadata() {
    return {
      provider: this.providerName,
      providerDisplayName: this.providerName,
      model: "fake-model",
    };
  }

  override async generatePreview(
    input: GarmentPreviewInput,
  ): Promise<GarmentPreviewResult> {
    void input;
    return {
      imageDataUri: "data:image/png;base64,cHJldmlldw==",
      mimeType: "image/png",
    };
  }
}

function setEnv(values: Record<string, string | undefined>): () => void {
  const previous = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(values)) {
    previous.set(key, process.env[key]);
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  return () => {
    for (const [key, value] of previous) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  };
}
