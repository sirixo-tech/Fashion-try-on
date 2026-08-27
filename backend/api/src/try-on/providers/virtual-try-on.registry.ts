import { Injectable } from "@nestjs/common";

import { FashnVirtualTryOnProvider } from "./fashn-virtual-try-on.provider.js";
import { GoogleVirtualTryOnProvider } from "./google-virtual-try-on.provider.js";
import { readVirtualTryOnProviderName } from "./virtual-try-on.config.js";
import {
  type VirtualTryOnProvider,
  type VirtualTryOnProviderName,
} from "./virtual-try-on.provider.js";

@Injectable()
export class VirtualTryOnProviderRegistry {
  constructor(
    private readonly fashn: FashnVirtualTryOnProvider,
    private readonly google: GoogleVirtualTryOnProvider,
  ) {}

  resolve(
    providerName: VirtualTryOnProviderName = readVirtualTryOnProviderName(),
  ): VirtualTryOnProvider {
    switch (providerName) {
      case "fashn":
        return this.fashn;
      case "google":
        return this.google;
      default:
        return assertNever(providerName);
    }
  }
}

function assertNever(value: never): never {
  throw new Error(`Unsupported Virtual Try-On provider: ${String(value)}`);
}
