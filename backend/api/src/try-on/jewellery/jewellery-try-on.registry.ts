import { Injectable } from "@nestjs/common";

import { readJewelleryTryOnProviderName } from "./jewellery-try-on.config.js";
import type {
  JewelleryTryOnProvider,
  JewelleryTryOnProviderName,
} from "./jewellery-try-on.provider.js";
import { PerfectCorpJewelleryTryOnProvider } from "./perfect-corp-jewellery-try-on.provider.js";

@Injectable()
export class JewelleryTryOnProviderRegistry {
  constructor(private readonly perfectCorp: PerfectCorpJewelleryTryOnProvider) {}

  resolve(
    providerName: JewelleryTryOnProviderName = readJewelleryTryOnProviderName(),
  ): JewelleryTryOnProvider {
    switch (providerName) {
      case "perfect-corp":
        return this.perfectCorp;
      default:
        return assertNever(providerName);
    }
  }
}

function assertNever(value: never): never {
  throw new Error(`Unsupported Jewellery Try-On provider: ${String(value)}`);
}
