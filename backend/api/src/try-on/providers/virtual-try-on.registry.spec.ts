import { describe, expect, it } from "vitest";

import { FashnVirtualTryOnProvider } from "./fashn-virtual-try-on.provider.js";
import { GoogleVirtualTryOnProvider } from "./google-virtual-try-on.provider.js";
import {
  readGarmentMaskGenerationEnabled,
  readGarmentPreprocessingEnabled,
  readVirtualTryOnProviderName,
} from "./virtual-try-on.config.js";
import { VirtualTryOnProviderRegistry } from "./virtual-try-on.registry.js";

describe("VirtualTryOnProviderRegistry", () => {
  it("resolves the FASHN Virtual Try-On provider from configuration", () => {
    const restore = setEnv({ SELFX_TRYON_PROVIDER: "fashn" });
    const fashn = new FashnVirtualTryOnProvider();
    const google = new GoogleVirtualTryOnProvider();
    const registry = new VirtualTryOnProviderRegistry(fashn, google);

    expect(registry.resolve()).toBe(fashn);
    restore();
  });

  it("resolves the Google Virtual Try-On provider from configuration", () => {
    const restore = setEnv({ SELFX_TRYON_PROVIDER: "google" });
    const fashn = new FashnVirtualTryOnProvider();
    const google = new GoogleVirtualTryOnProvider();
    const registry = new VirtualTryOnProviderRegistry(fashn, google);

    expect(registry.resolve()).toBe(google);
    restore();
  });

  it("rejects unsupported Try-On provider configuration", () => {
    const restore = setEnv({ SELFX_TRYON_PROVIDER: "openai" });

    expect(() => readVirtualTryOnProviderName()).toThrow(
      /Unsupported SELFX_TRYON_PROVIDER/,
    );
    restore();
  });

  it("keeps garment preprocessing disabled unless explicitly enabled", () => {
    const restore = setEnv({ GARMENT_PREPROCESSING_ENABLED: undefined });

    expect(readGarmentPreprocessingEnabled()).toBe(false);

    restore();
  });

  it("enables garment preprocessing only for the exact true flag value", () => {
    const restore = setEnv({ GARMENT_PREPROCESSING_ENABLED: "true" });

    expect(readGarmentPreprocessingEnabled()).toBe(true);

    restore();
  });

  it("keeps garment mask generation disabled unless explicitly enabled", () => {
    const restore = setEnv({ GARMENT_MASK_GENERATION_ENABLED: undefined });

    expect(readGarmentMaskGenerationEnabled()).toBe(false);

    restore();
  });

  it("enables garment mask generation only for the exact true flag value", () => {
    const restore = setEnv({ GARMENT_MASK_GENERATION_ENABLED: "true" });

    expect(readGarmentMaskGenerationEnabled()).toBe(true);

    restore();
  });
});

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
