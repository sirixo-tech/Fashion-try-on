import { HttpStatus, Injectable, Logger } from "@nestjs/common";

import {
  SELFX_AI_PROVIDER_ERROR_CODES,
  SelfxAiProviderError,
} from "../provider-errors.js";
import {
  type GarmentPreviewInput,
  type GarmentPreviewResult,
} from "./garment-preview.provider.js";
import { GarmentPreviewProviderRegistry } from "./garment-preview.registry.js";

@Injectable()
export class GarmentPreviewService {
  private readonly logger = new Logger(GarmentPreviewService.name);

  constructor(private readonly providers: GarmentPreviewProviderRegistry) {}

  async generatePreview(
    input: GarmentPreviewInput,
  ): Promise<GarmentPreviewResult> {
    const provider = this.providers.resolve();
    const metadata = provider.metadata();
    const startedAt = Date.now();

    try {
      provider.assertConfigured();
      const result = await provider.generatePreview(input);
      this.logger.log({
        capability: "garment-preview",
        provider: metadata.provider,
        model: metadata.model,
        durationMs: Date.now() - startedAt,
        status: "success",
      });
      return result;
    } catch (error) {
      const normalized = normalizePreviewError(error);
      this.logger.warn({
        capability: "garment-preview",
        provider: metadata.provider,
        model: metadata.model,
        durationMs: Date.now() - startedAt,
        status: "failure",
        errorCode: normalized.code,
      });
      throw normalized;
    }
  }
}

function normalizePreviewError(error: unknown): SelfxAiProviderError {
  if (error instanceof SelfxAiProviderError) {
    return error;
  }

  return new SelfxAiProviderError(
    SELFX_AI_PROVIDER_ERROR_CODES.generationFailed,
    "SelfX could not prepare the garment image.",
    HttpStatus.BAD_GATEWAY,
  );
}
