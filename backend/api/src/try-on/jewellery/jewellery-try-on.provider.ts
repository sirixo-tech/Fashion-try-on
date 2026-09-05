import type { SelfxTryOnRunStatus, TryOnLabErrorCode } from "@selfx/shared";

import type { JewelleryType } from "../../catalog/product-kind.js";

export interface JewelleryTryOnProviderSubmitInput {
  personImageDataUri: string;
  jewelleryImageDataUri: string;
  jewelleryType: JewelleryType;
  productReference?: {
    productId?: string;
    productName?: string;
    sku?: string;
  };
}

export interface JewelleryTryOnProviderSubmitResult {
  providerPredictionId: string;
}

export interface JewelleryTryOnProviderStatusResult {
  status: SelfxTryOnRunStatus;
  resultImage?: string;
  errorCode?: TryOnLabErrorCode;
  errorMessage?: string;
}

export interface JewelleryTryOnProviderMetadata {
  provider: JewelleryTryOnProviderName;
  providerDisplayName: string;
  model: string;
}

export type JewelleryTryOnProviderName = "perfect-corp";

export interface JewelleryTryOnProvider {
  assertConfigured(): void;
  metadata(): JewelleryTryOnProviderMetadata;
  submit(
    input: JewelleryTryOnProviderSubmitInput,
  ): Promise<JewelleryTryOnProviderSubmitResult>;
  poll(
    providerPredictionId: string,
  ): Promise<JewelleryTryOnProviderStatusResult>;
}
