import { Injectable } from "@nestjs/common";

import type { JewelleryType } from "../../catalog/product-kind.js";
import { GarmentPreviewSettingsService } from "../garment-preview-settings.service.js";
import { JewelleryTryOnExecutionService } from "./jewellery-try-on-execution.service.js";
import { throwJewelleryTryOnNotEnabled } from "./jewellery-try-on-execution.service.js";
import type { JewelleryTryOnProviderMetadata } from "./jewellery-try-on.provider.js";

export interface JewelleryTryOnRunFoundationInput {
  storeId: string;
  personImageDataUri: string;
  jewelleryImageDataUri: string;
  jewelleryType: JewelleryType;
  productReference?: {
    productId?: string;
    productName?: string;
    sku?: string;
  };
}

export interface JewelleryTryOnRunFoundation {
  vertical: "JEWELLERY";
  jewelleryType: JewelleryType;
  provider: JewelleryTryOnProviderMetadata;
  productReference?: JewelleryTryOnRunFoundationInput["productReference"];
}

@Injectable()
export class JewelleryTryOnService {
  constructor(
    private readonly settings: GarmentPreviewSettingsService,
    private readonly execution: JewelleryTryOnExecutionService,
  ) {}

  async assertStoreCanRunJewelleryTryOn(storeId: string): Promise<void> {
    const capabilities =
      await this.settings.resolveStoreTryOnCapabilities(storeId);
    if (!capabilities.includes("JEWELLERY_TRY_ON")) {
      throwJewelleryTryOnNotEnabled();
    }
  }

  async prepareRunFoundation(
    input: JewelleryTryOnRunFoundationInput,
  ): Promise<JewelleryTryOnRunFoundation> {
    await this.assertStoreCanRunJewelleryTryOn(input.storeId);
    this.execution.assertConfigured();

    return {
      vertical: "JEWELLERY",
      jewelleryType: input.jewelleryType,
      provider: this.execution.metadata(),
      productReference: input.productReference,
    };
  }
}
