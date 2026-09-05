import { describe, expect, it } from "vitest";

import { readJewelleryTryOnProviderName } from "./jewellery-try-on.config.js";
import type {
  JewelleryTryOnProvider,
  JewelleryTryOnProviderMetadata,
  JewelleryTryOnProviderStatusResult,
  JewelleryTryOnProviderSubmitInput,
  JewelleryTryOnProviderSubmitResult,
} from "./jewellery-try-on.provider.js";
import { JewelleryTryOnProviderRegistry } from "./jewellery-try-on.registry.js";

describe("JewelleryTryOnProviderRegistry", () => {
  it("resolves the Perfect Corp jewellery provider by default", () => {
    const restore = setEnv({
      SELFX_JEWELLERY_TRY_ON_PROVIDER: undefined,
    });
    const perfectCorp = new FakeJewelleryProvider("perfect-corp");
    const registry = new JewelleryTryOnProviderRegistry(perfectCorp as never);

    expect(registry.resolve()).toBe(perfectCorp);
    expect(readJewelleryTryOnProviderName()).toBe("perfect-corp");
    restore();
  });

  it("rejects unsupported jewellery provider configuration", () => {
    const restore = setEnv({
      SELFX_JEWELLERY_TRY_ON_PROVIDER: "not-real",
    });

    expect(() => readJewelleryTryOnProviderName()).toThrow(
      /Unsupported SELFX_JEWELLERY_TRY_ON_PROVIDER/,
    );
    restore();
  });
});

class FakeJewelleryProvider implements JewelleryTryOnProvider {
  constructor(private readonly providerName: "perfect-corp") {}

  assertConfigured(): void {
    return undefined;
  }

  metadata(): JewelleryTryOnProviderMetadata {
    return {
      provider: this.providerName,
      providerDisplayName: "Fake Jewellery Provider",
      model: "fake-model",
    };
  }

  async submit(
    _input: JewelleryTryOnProviderSubmitInput,
  ): Promise<JewelleryTryOnProviderSubmitResult> {
    return { providerPredictionId: "prediction-1" };
  }

  async poll(
    _providerPredictionId: string,
  ): Promise<JewelleryTryOnProviderStatusResult> {
    return { status: "COMPLETED", resultImage: "data:image/jpeg;base64,ok" };
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
