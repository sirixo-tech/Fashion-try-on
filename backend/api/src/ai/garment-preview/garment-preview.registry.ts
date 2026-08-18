import { Injectable } from "@nestjs/common";

import { readGarmentPreviewProviderName } from "./garment-preview.config.js";
import {
  GarmentPreviewProvider,
  type GarmentPreviewProviderName,
} from "./garment-preview.provider.js";
import { FashnGarmentPreviewProvider } from "./providers/fashn-garment-preview.provider.js";
import { OpenAiGarmentPreviewProvider } from "./providers/openai-garment-preview.provider.js";

@Injectable()
export class GarmentPreviewProviderRegistry {
  constructor(
    private readonly fashn: FashnGarmentPreviewProvider,
    private readonly openai: OpenAiGarmentPreviewProvider,
  ) {}

  resolve(
    providerName: GarmentPreviewProviderName = readGarmentPreviewProviderName(),
  ): GarmentPreviewProvider {
    switch (providerName) {
      case "fashn":
        return this.fashn;
      case "openai":
        return this.openai;
      default:
        return assertNever(providerName);
    }
  }
}

function assertNever(value: never): never {
  throw new Error(`Unsupported garment preview provider: ${String(value)}`);
}
