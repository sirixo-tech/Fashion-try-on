import type {
  SelfxGarmentCategory,
  SelfxGarmentPhotoType,
  SelfxGenerationProfile,
  SelfxTryOnRunStatus,
  TryOnLabErrorCode,
} from "@selfx/shared";

export interface VirtualTryOnProviderSubmitInput {
  personImageDataUri: string;
  garmentImageDataUri: string;
  category: SelfxGarmentCategory;
  garmentPhotoType: SelfxGarmentPhotoType;
  generationProfile: SelfxGenerationProfile;
}

export interface VirtualTryOnProviderSubmitResult {
  providerPredictionId: string;
}

export interface VirtualTryOnProviderStatusResult {
  status: SelfxTryOnRunStatus;
  resultImage?: string;
  errorCode?: TryOnLabErrorCode;
  errorMessage?: string;
}

export interface VirtualTryOnProviderMetadata {
  provider: string;
  providerDisplayName: string;
  model: string;
}

export type VirtualTryOnProviderName = "fashn" | "google";

export interface VirtualTryOnProvider {
  assertConfigured(): void;
  metadata(): VirtualTryOnProviderMetadata;
  submit(
    input: VirtualTryOnProviderSubmitInput,
  ): Promise<VirtualTryOnProviderSubmitResult>;
  poll(providerPredictionId: string): Promise<VirtualTryOnProviderStatusResult>;
}
