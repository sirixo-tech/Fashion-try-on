import { describe, expect, it, vi } from "vitest";

import type { CreateTryOnLabRunPayload } from "../try-on-lab/try-on-lab-multipart.js";
import {
  GarmentPreprocessingService,
  type GarmentPreprocessingInput,
  type GarmentPreprocessingResult,
} from "./garment-preprocessing.service.js";
import type {
  VirtualTryOnProvider,
  VirtualTryOnProviderMetadata,
  VirtualTryOnProviderStatusResult,
  VirtualTryOnProviderSubmitInput,
  VirtualTryOnProviderSubmitResult,
} from "./providers/virtual-try-on.provider.js";
import {
  TryOnExecutionService,
  type TryOnExecutionObserver,
} from "./try-on-execution.service.js";

const originalGarmentImageDataUri = "data:image/png;base64,b3JpZ2luYWw=";
const preparedGarmentImageDataUri = "data:image/png;base64,cHJlcGFyZWQ=";
const garmentMaskImageDataUri = "data:image/png;base64,bWFzaw==";

describe("TryOnExecutionService", () => {
  it("submits the preprocessed garment image selected for provider use", async () => {
    const provider = new CapturingTryOnProvider();
    const execution = new TryOnExecutionService(
      provider,
      new PreparedGarmentPreprocessingService(),
    );
    const runObserver = observer();

    await execution.process(payload(), runObserver);

    expect(provider.submittedInput?.garmentImageDataUri).toBe(
      preparedGarmentImageDataUri,
    );
    expect(runObserver.onGarmentPreprocessed).toHaveBeenCalledWith({
      enabled: true,
      status: "NORMALIZED",
      providerInputImage: "PREPROCESSED",
      maskGenerated: false,
    });
  });

  it("passes provider-neutral garment masks when preprocessing provides one", async () => {
    const provider = new CapturingTryOnProvider();
    const execution = new TryOnExecutionService(
      provider,
      new PreparedGarmentPreprocessingService({ includeMask: true }),
    );
    const runObserver = observer();

    await execution.process(payload(), runObserver);

    expect(provider.submittedInput?.garmentMaskImageDataUri).toBe(
      garmentMaskImageDataUri,
    );
    expect(runObserver.onGarmentPreprocessed).toHaveBeenCalledWith({
      enabled: true,
      status: "NORMALIZED",
      providerInputImage: "PREPROCESSED",
      maskGenerated: true,
    });
  });
});

class PreparedGarmentPreprocessingService extends GarmentPreprocessingService {
  constructor(private readonly options: { includeMask?: boolean } = {}) {
    super();
  }

  override async prepare(
    _input: GarmentPreprocessingInput,
  ): Promise<GarmentPreprocessingResult> {
    return {
      originalGarmentImageDataUri,
      providerGarmentImageDataUri: preparedGarmentImageDataUri,
      ...(this.options.includeMask
        ? { maskImageDataUri: garmentMaskImageDataUri }
        : {}),
      preprocessingEnabled: true,
      status: "NORMALIZED" as const,
      providerInputImage: "PREPROCESSED" as const,
    };
  }
}

class CapturingTryOnProvider implements VirtualTryOnProvider {
  submittedInput?: VirtualTryOnProviderSubmitInput;

  assertConfigured(): void {
    return undefined;
  }

  metadata(): VirtualTryOnProviderMetadata {
    return {
      provider: "test",
      providerDisplayName: "Test",
      model: "test",
    };
  }

  async submit(
    input: VirtualTryOnProviderSubmitInput,
  ): Promise<VirtualTryOnProviderSubmitResult> {
    this.submittedInput = input;
    return { providerPredictionId: "provider-run-1" };
  }

  async poll(): Promise<VirtualTryOnProviderStatusResult> {
    return { status: "COMPLETED", resultImage: "data:image/jpeg;base64,b2s=" };
  }
}

function observer(): TryOnExecutionObserver {
  return {
    onStarted: vi.fn(),
    onGarmentPreprocessed: vi.fn(),
    onSubmitted: vi.fn(),
    onStatus: vi.fn(),
    onTimedOut: vi.fn(),
    onError: vi.fn(),
  };
}

function payload(): CreateTryOnLabRunPayload {
  return {
    personImage: {
      fieldName: "personImage",
      filename: "person.png",
      mimeType: "image/png",
      sizeBytes: 1,
      buffer: Buffer.from("person"),
      dataUri: "data:image/png;base64,cGVyc29u",
    },
    garmentImage: {
      fieldName: "garmentImage",
      filename: "garment.png",
      mimeType: "image/png",
      sizeBytes: 1,
      buffer: Buffer.from("garment"),
      dataUri: originalGarmentImageDataUri,
    },
    garmentSource: "DIRECT_UPLOAD",
    garmentIntent: "AUTO",
    category: "AUTO",
    garmentPhotoType: "AUTO",
    generationProfile: "BALANCED",
    categoryResolutionSource: "AUTO_FALLBACK",
    photoTypeResolutionSource: "AUTO_FALLBACK",
    profileResolutionSource: "AUTO_FALLBACK",
    disambiguationRequired: false,
    disambiguationResolved: false,
    garmentAnalysisReasonCodes: [],
    qualityWarningCodes: [],
    qualityOverrideAccepted: false,
  };
}
