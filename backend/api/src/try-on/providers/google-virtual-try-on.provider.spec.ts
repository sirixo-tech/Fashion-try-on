import { randomBytes } from "node:crypto";

import { TRY_ON_LAB_ERROR_CODES } from "@selfx/shared";
import { HttpStatus } from "@nestjs/common";
import type { AuthClient, GoogleAuth } from "google-auth-library";
import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";

import { ApiErrorException } from "../../common/api-error.exception.js";
import {
  buildGooglePredictRequest,
  GoogleVirtualTryOnProvider,
  type GoogleVirtualTryOnConfig,
  normalizeGoogleInputImage,
  normalizeGooglePredictResponse,
  readGoogleTryOnConfig,
} from "./google-virtual-try-on.provider.js";

describe("GoogleVirtualTryOnProvider", () => {
  it("maps SelfX inputs to the Google Virtual Try-On predict request", async () => {
    const personImage = await smallJpeg();
    const garmentImage = await smallPng();
    const request = await buildGooglePredictRequest(
      {
        personImageDataUri: dataUri("image/jpeg", personImage),
        garmentImageDataUri: dataUri("image/png", garmentImage),
        category: "TOP",
        garmentPhotoType: "FLAT_LAY",
        generationProfile: "QUALITY",
      },
      { storageUri: "gs://selfx-vto-results/lab" },
    );

    expect(request).toEqual({
      instances: [
        {
          personImage: {
            image: {
              mimeType: "image/jpeg",
              bytesBase64Encoded: personImage.toString("base64"),
            },
          },
          productImages: [
            {
              image: {
                mimeType: "image/png",
                bytesBase64Encoded: garmentImage.toString("base64"),
              },
            },
          ],
        },
      ],
      parameters: {
        sampleCount: 1,
        storageUri: "gs://selfx-vto-results/lab",
      },
    });
  });

  it("submits through Google and polls a normalized completed SelfX result", async () => {
    const restore = setEnv(googleProviderEnv());
    const predict = vi.fn(async () => ({
      predictions: [
        {
          mimeType: "image/jpeg",
          bytesBase64Encoded: "cmVzdWx0",
        },
      ],
    }));
    const provider = new TestGoogleVirtualTryOnProvider(predict);
    const personImage = await smallJpeg();
    const garmentImage = await smallPng();

    const submittedId = (
      await provider.submit({
        personImageDataUri: dataUri("image/jpeg", personImage),
        garmentImageDataUri: dataUri("image/png", garmentImage),
        category: "BOTTOM",
        garmentPhotoType: "ON_MODEL",
        generationProfile: "BALANCED",
      })
    ).providerPredictionId;

    expect(submittedId).toMatch(/^google-vto-/);
    await expect(provider.poll(submittedId)).resolves.toEqual({
      status: "COMPLETED",
      resultImage: "data:image/jpeg;base64,cmVzdWx0",
    });

    expect(predict).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: "selfx-vto",
        location: "us-central1",
        model: "virtual-try-on-001",
      }),
      "google-token",
      expect.objectContaining({
        instances: expect.any(Array),
        parameters: expect.objectContaining({ sampleCount: 1 }),
      }),
    );
    restore();
  });

  it("passes safe decoded JPEG inputs through to Google unchanged", async () => {
    const jpeg = await smallJpeg();

    const normalized = await normalizeGoogleInputImage(
      dataUri("image/jpeg", jpeg),
    );

    expect(normalized).toEqual({
      mimeType: "image/jpeg",
      bytesBase64Encoded: jpeg.toString("base64"),
      sizeBytes: jpeg.length,
    });
  });

  it("passes safe decoded PNG inputs through to Google unchanged", async () => {
    const png = await smallPng();

    const normalized = await normalizeGoogleInputImage(
      dataUri("image/png", png),
    );

    expect(normalized).toEqual({
      mimeType: "image/png",
      bytesBase64Encoded: png.toString("base64"),
      sizeBytes: png.length,
    });
  });

  it("converts decoded WebP inputs to Google-supported JPEG", async () => {
    const webp = await sharp({
      create: {
        width: 48,
        height: 64,
        channels: 4,
        background: { r: 80, g: 30, b: 160, alpha: 0.8 },
      },
    })
      .webp()
      .toBuffer();

    const normalized = await normalizeGoogleInputImage(
      dataUri("image/webp", webp),
    );
    const normalizedBytes = Buffer.from(
      normalized.bytesBase64Encoded,
      "base64",
    );

    expect(normalized.mimeType).toBe("image/jpeg");
    await expect(sharp(normalizedBytes).metadata()).resolves.toMatchObject({
      format: "jpeg",
      width: 48,
      height: 64,
    });
  });

  it("resizes and compresses oversized decoded inputs below the Google target", async () => {
    const width = 2300;
    const height = 2100;
    const oversizedPng = await sharp(randomBytes(width * height * 3), {
      raw: {
        width,
        height,
        channels: 3,
      },
    })
      .png({ compressionLevel: 0 })
      .toBuffer();

    expect(oversizedPng.length).toBeGreaterThan(6 * 1024 * 1024);

    const normalized = await normalizeGoogleInputImage(
      dataUri("image/png", oversizedPng),
    );
    const normalizedBytes = Buffer.from(
      normalized.bytesBase64Encoded,
      "base64",
    );
    const metadata = await sharp(normalizedBytes).metadata();

    expect(normalizedBytes.length).toBeLessThanOrEqual(6 * 1024 * 1024);
    expect(["image/jpeg", "image/png"]).toContain(normalized.mimeType);
    expect(metadata.width).toBeLessThanOrEqual(2048);
    expect(metadata.height).toBeLessThanOrEqual(2048);
    expect((metadata.width ?? 0) / (metadata.height ?? 1)).toBeCloseTo(
      width / height,
      1,
    );
  });

  it("rejects corrupt decoded image bytes through the SelfX image-invalid contract", async () => {
    await expect(
      normalizeGoogleInputImage(
        dataUri("image/jpeg", Buffer.from("not a real jpeg")),
      ),
    ).rejects.toMatchObject({
      status: HttpStatus.BAD_REQUEST,
      response: {
        error: {
          code: TRY_ON_LAB_ERROR_CODES.imageInvalid,
          message: "The provider could not use one of the uploaded images.",
        },
      },
    });
  });

  it("normalizes Google Responsible AI filtering to SelfX moderation failure", () => {
    expect(
      normalizeGooglePredictResponse({
        predictions: [
          {
            images: [
              {
                raiFilteredReason: "Safety filter",
              },
            ],
          },
        ],
      }),
    ).toEqual({
      status: "FAILED",
      errorCode: TRY_ON_LAB_ERROR_CODES.moderationRejected,
      errorMessage: "The provider rejected the image content.",
    });
  });

  it("accepts local ADC when required provider config is present", () => {
    const restore = setEnv({
      GOOGLE_CLOUD_PROJECT: "selfx-vto",
      GOOGLE_CLOUD_LOCATION: "us-central1",
      GOOGLE_VTO_MODEL: "virtual-try-on-001",
      GOOGLE_APPLICATION_CREDENTIALS: undefined,
      GOOGLE_APPLICATION_CREDENTIALS_JSON: undefined,
      GOOGLE_APPLICATION_CREDENTIALS_JSON_BASE64: undefined,
    });

    expect(() =>
      new GoogleVirtualTryOnProvider().assertConfigured(),
    ).not.toThrow();
    expect(readGoogleTryOnConfig()).toMatchObject({
      projectId: "selfx-vto",
      location: "us-central1",
      model: "virtual-try-on-001",
    });
    restore();
  });

  it("requires Google project configuration when ADC project discovery is not used by config", () => {
    const restore = setEnv({
      GOOGLE_CLOUD_PROJECT: undefined,
      GOOGLE_PROJECT_ID: undefined,
      GOOGLE_APPLICATION_CREDENTIALS: undefined,
      GOOGLE_APPLICATION_CREDENTIALS_JSON: undefined,
      GOOGLE_APPLICATION_CREDENTIALS_JSON_BASE64: undefined,
    });

    expect(() => readGoogleTryOnConfig()).toThrow(ApiErrorException);
    try {
      readGoogleTryOnConfig();
    } catch (error) {
      expect(error).toBeInstanceOf(ApiErrorException);
      expect((error as ApiErrorException).getResponse()).toEqual({
        error: {
          code: TRY_ON_LAB_ERROR_CODES.configurationError,
          message: "Google Try-On provider project is not configured.",
        },
      });
    }
    restore();
  });

  it("normalizes GoogleAuth client resolution failures to SelfX configuration errors", async () => {
    const restore = setEnv({
      GOOGLE_CLOUD_PROJECT: "selfx-vto",
      GOOGLE_APPLICATION_CREDENTIALS: undefined,
      GOOGLE_APPLICATION_CREDENTIALS_JSON: undefined,
      GOOGLE_APPLICATION_CREDENTIALS_JSON_BASE64: undefined,
    });
    const provider = new FailingGoogleAuthProvider();
    const personImage = await smallJpeg();
    const garmentImage = await smallPng();

    await expect(
      provider.submit({
        personImageDataUri: dataUri("image/jpeg", personImage),
        garmentImageDataUri: dataUri("image/png", garmentImage),
        category: "AUTO",
        garmentPhotoType: "AUTO",
        generationProfile: "BALANCED",
      }),
    ).rejects.toMatchObject({
      status: HttpStatus.SERVICE_UNAVAILABLE,
      response: {
        error: {
          code: TRY_ON_LAB_ERROR_CODES.configurationError,
          message: expect.stringContaining(
            "Google Try-On provider authentication failed.",
          ),
        },
      },
    });
    restore();
  });
});

class TestGoogleVirtualTryOnProvider extends GoogleVirtualTryOnProvider {
  constructor(private readonly predictMock: PredictMock) {
    super();
  }

  protected override async requestAccessToken(
    _config: GoogleVirtualTryOnConfig,
  ): Promise<{
    accessToken: string;
    expiresInSeconds: number;
  }> {
    return { accessToken: "google-token", expiresInSeconds: 3600 };
  }

  protected override async predict(
    config: GoogleVirtualTryOnConfig,
    accessToken: string,
    request: unknown,
  ): Promise<Record<string, unknown>> {
    return this.predictMock(config, accessToken, request) as Promise<
      Record<string, unknown>
    >;
  }
}

class FailingGoogleAuthProvider extends GoogleVirtualTryOnProvider {
  protected override createGoogleAuth(): GoogleAuth<AuthClient> {
    return {
      getClient: async () => {
        throw new Error("Could not load the default credentials.");
      },
    } as unknown as GoogleAuth<AuthClient>;
  }
}

type PredictMock = (
  config: GoogleVirtualTryOnConfig,
  accessToken: string,
  request: unknown,
) => Promise<Record<string, unknown>>;

function googleProviderEnv(): Record<string, string | undefined> {
  return {
    GOOGLE_CLOUD_PROJECT: "selfx-vto",
    GOOGLE_CLOUD_LOCATION: "us-central1",
    GOOGLE_VTO_MODEL: "virtual-try-on-001",
    GOOGLE_APPLICATION_CREDENTIALS: undefined,
    GOOGLE_APPLICATION_CREDENTIALS_JSON_BASE64: undefined,
    GOOGLE_APPLICATION_CREDENTIALS_JSON: undefined,
  };
}

async function smallJpeg(): Promise<Buffer> {
  return sharp({
    create: {
      width: 32,
      height: 48,
      channels: 3,
      background: { r: 120, g: 80, b: 40 },
    },
  })
    .jpeg({ quality: 90 })
    .toBuffer();
}

async function smallPng(): Promise<Buffer> {
  return sharp({
    create: {
      width: 40,
      height: 36,
      channels: 4,
      background: { r: 20, g: 140, b: 180, alpha: 1 },
    },
  })
    .png()
    .toBuffer();
}

function dataUri(
  mimeType: "image/jpeg" | "image/png" | "image/webp",
  buffer: Buffer,
): string {
  return `data:${mimeType};base64,${buffer.toString("base64")}`;
}

function setEnv(values: Record<string, string | undefined>): () => void {
  const previous = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(values)) {
    previous.set(key, process.env[key]);
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  return () => {
    for (const [key, value] of previous) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  };
}
