import { type SelfxGarmentIntent } from "@selfx/shared";

export interface SelfxImage {
  filename?: string;
  mimeType: string;
  buffer: Buffer;
  sizeBytes: number;
}

export interface GarmentPreviewInput {
  image: SelfxImage;
  garmentIntent: SelfxGarmentIntent;
}

export interface GarmentPreviewResult {
  imageDataUri: string;
  mimeType: "image/png";
}

export interface GarmentPreviewProviderMetadata {
  provider: GarmentPreviewProviderName;
  providerDisplayName: string;
  model: string;
}

export type GarmentPreviewProviderName = "fashn" | "openai";

export abstract class GarmentPreviewProvider {
  abstract assertConfigured(): void;
  abstract metadata(): GarmentPreviewProviderMetadata;
  abstract generatePreview(
    input: GarmentPreviewInput,
  ): Promise<GarmentPreviewResult>;
}
