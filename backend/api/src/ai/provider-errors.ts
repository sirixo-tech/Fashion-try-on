import { HttpStatus } from "@nestjs/common";

export const SELFX_AI_PROVIDER_ERROR_CODES = {
  configurationError: "CONFIGURATION_ERROR",
  invalidImage: "INVALID_IMAGE",
  garmentNotDetected: "GARMENT_NOT_DETECTED",
  unsupportedInput: "UNSUPPORTED_INPUT",
  rateLimited: "RATE_LIMITED",
  providerUnavailable: "PROVIDER_UNAVAILABLE",
  providerAuthFailed: "PROVIDER_AUTH_FAILED",
  generationTimeout: "GENERATION_TIMEOUT",
  generationFailed: "GENERATION_FAILED",
} as const;

export type SelfxAiProviderErrorCode =
  (typeof SELFX_AI_PROVIDER_ERROR_CODES)[keyof typeof SELFX_AI_PROVIDER_ERROR_CODES];

export class SelfxAiProviderError extends Error {
  constructor(
    public readonly code: SelfxAiProviderErrorCode,
    message: string,
    public readonly status: HttpStatus = HttpStatus.BAD_GATEWAY,
  ) {
    super(message);
  }
}
