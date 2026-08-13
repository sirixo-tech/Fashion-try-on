import type {
  SelfxGarmentCategory,
  SelfxGarmentPhotoType,
  SelfxGenerationProfile,
  SelfxTryOnRunStatus,
  TryOnLabErrorCode,
} from "@selfx/shared";

export interface TryOnProviderSubmitInput {
  personImageDataUri: string;
  garmentImageDataUri: string;
  category: SelfxGarmentCategory;
  garmentPhotoType: SelfxGarmentPhotoType;
  generationProfile: SelfxGenerationProfile;
}

export interface TryOnProviderSubmitResult {
  providerPredictionId: string;
}

export interface TryOnProviderStatusResult {
  status: SelfxTryOnRunStatus;
  resultImage?: string;
  errorCode?: TryOnLabErrorCode;
  errorMessage?: string;
}

export interface TryOnProviderMetadata {
  provider: string;
  providerDisplayName: string;
  model: string;
}

export interface TryOnProvider {
  assertConfigured(): void;
  metadata(): TryOnProviderMetadata;
  submit(input: TryOnProviderSubmitInput): Promise<TryOnProviderSubmitResult>;
  poll(providerPredictionId: string): Promise<TryOnProviderStatusResult>;
}
