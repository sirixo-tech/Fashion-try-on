import { describe, expect, it } from "vitest";

import { FashnVirtualTryOnProvider } from "./fashn-virtual-try-on.provider.js";
import { GoogleVirtualTryOnProvider } from "./google-virtual-try-on.provider.js";
import { readVirtualTryOnProviderName } from "./virtual-try-on.config.js";
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
