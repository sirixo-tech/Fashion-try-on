import type { FastifyRequest } from "fastify";
import { describe, expect, it, vi } from "vitest";

import { TRY_ON_LAB_ERROR_CODES } from "@selfx/shared";

import { ApiErrorException } from "../common/api-error.exception.js";
import { TryOnExecutionService } from "../try-on/try-on-execution.service.js";
import {
  detectImageMimeType,
  parseTryOnLabMultipartRequest,
} from "./try-on-lab-multipart.js";
import {
  TRY_ON_LAB_MAX_IMAGE_BYTES,
  TRY_ON_LAB_MULTIPART_LIMITS,
} from "./try-on-lab.constants.js";
import { TryOnLabRunRegistryService } from "./try-on-lab-run-registry.service.js";
import { TryOnLabService } from "./try-on-lab.service.js";
import type {
  TryOnProvider,
  TryOnProviderStatusResult,
} from "./providers/try-on-provider.js";

const tinyPng = Buffer.from(
  "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c636000000200015d0b2a0b0000000049454e44ae426082",
  "hex",
);
const tinyJpeg = Buffer.from(
  "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAb/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAH/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAEFAqf/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAEDAQE/Af/EABQRAQAAAAAAAAAAAAAAAAAAABD/2gAIAQIBAT8BP//EABQQAQAAAAAAAAAAAAAAAAAAABD/2gAIAQEABj8Cf//Z",
  "base64",
);
const corruptPng = Buffer.from("89504e470d0a1a0a00000000", "hex");

describe("TryOnLabService", () => {
  it("denies run creation when the lab is disabled", () => {
    const restore = setLabEnabled(false);
    const service = createService(new FakeTryOnProvider());

    expect(() => service.createRun("user-1", payload())).toThrow(
      ApiErrorException,
    );
    try {
      service.createRun("user-1", payload());
    } catch (error) {
      expectErrorCode(error, TRY_ON_LAB_ERROR_CODES.configurationError);
    } finally {
      restore();
    }
  });

  it("returns a stable SelfX run ID without leaking provider IDs", async () => {
    const restore = setLabEnabled(true);
    const provider = new FakeTryOnProvider([
      { status: "COMPLETED", resultImage: "data:image/jpeg;base64,result" },
    ]);
    const service = createService(provider);

    const created = service.createRun("user-1", payload());
    expect(created.id).toEqual(expect.any(String));
    expect(JSON.stringify(created)).not.toContain("provider-");

    const completed = await waitForRunStatus(service, "user-1", created.id);
    expect(provider.submissions).toBe(1);
    expect(completed.status).toBe("COMPLETED");
    expect(completed.resultImage).toBe("data:image/jpeg;base64,result");
    expect(JSON.stringify(completed)).not.toContain("provider-");
    expect(completed.telemetry).toMatchObject({
      selfxRunId: created.id,
      channel: "WEB_LAB",
      provider: "fake-provider",
      providerDisplayName: "Fake Provider",
      model: "fake-model-v1",
      profile: "BALANCED",
      garmentSource: "DIRECT_UPLOAD",
      garmentIntent: "TOP",
      garmentCategory: "TOP",
      garmentPhotoType: "FLAT_LAY",
      categoryResolutionSource: "BODY_COVERAGE_ANALYSIS",
      photoTypeResolutionSource: "AUTO_FALLBACK",
      profileResolutionSource: "PLATFORM_DEFAULT",
      analysisConfidence: 0.82,
      disambiguationRequired: false,
      disambiguationResolved: false,
      garmentAnalysisBodyCoverage: "UPPER_BODY_MODEL",
      garmentAnalysisReasonCodes: ["POSE_UPPER_BODY_COVERAGE"],
      status: "COMPLETED",
      qualityWarningCodes: ["IMAGE_TOO_BLURRY"],
      qualityOverrideAccepted: true,
    });
    expect(completed.telemetry.elapsedMs).toEqual(expect.any(Number));
    restore();
  });

  it("polls failed provider state through a stable SelfX error", async () => {
    const restore = setLabEnabled(true);
    const service = createService(
      new FakeTryOnProvider([
        {
          status: "FAILED",
          errorCode: TRY_ON_LAB_ERROR_CODES.moderationRejected,
          errorMessage: "The provider rejected the image content.",
        },
      ]),
    );

    const created = service.createRun("user-1", payload());
    const failed = await waitForRunStatus(service, "user-1", created.id);
    expect(failed.status).toBe("FAILED");
    expect(failed.errorCode).toBe(TRY_ON_LAB_ERROR_CODES.moderationRejected);
    restore();
  });

  it("does not expose one user's run to another user", () => {
    const restore = setLabEnabled(true);
    const service = createService(new FakeTryOnProvider());
    const created = service.createRun("user-1", payload());

    expect(() => service.getRun("user-2", created.id)).toThrow(
      ApiErrorException,
    );
    restore();
  });

  it("validates image signatures independently of file extensions", () => {
    expect(detectImageMimeType(tinyPng)).toBe("image/png");
    expect(detectImageMimeType(tinyJpeg)).toBe("image/jpeg");
    expect(detectImageMimeType(Buffer.from("not-an-image"))).toBeNull();
  });

  it("rejects missing images and technically invalid uploads", async () => {
    await expectErrorCodeAsync(
      parseTryOnLabMultipartRequest(
        fakeMultipartRequest([file("personImage", "image/png", tinyPng)]),
      ),
      TRY_ON_LAB_ERROR_CODES.multipartInvalid,
    );

    await expectErrorCodeAsync(
      parseTryOnLabMultipartRequest(
        fakeMultipartRequest([
          file("personImage", "text/plain", Buffer.from("not-an-image")),
          file("garmentImage", "image/png", tinyPng),
        ]),
      ),
      TRY_ON_LAB_ERROR_CODES.imageInvalid,
    );

    await expectErrorCodeAsync(
      parseTryOnLabMultipartRequest(
        fakeMultipartRequest([
          file(
            "personImage",
            "image/png",
            Buffer.alloc(TRY_ON_LAB_MAX_IMAGE_BYTES + 1),
          ),
          file("garmentImage", "image/png", tinyPng),
        ]),
      ),
      TRY_ON_LAB_ERROR_CODES.imageInvalid,
    );

    await expectErrorCodeAsync(
      parseTryOnLabMultipartRequest(
        fakeMultipartRequest([
          file("personImage", "image/jpeg", tinyPng),
          file("garmentImage", "image/png", tinyPng),
        ]),
      ),
      TRY_ON_LAB_ERROR_CODES.imageInvalid,
    );

    await expectErrorCodeAsync(
      parseTryOnLabMultipartRequest(
        fakeMultipartRequest([
          file("personImage", "image/png", corruptPng),
          file("garmentImage", "image/png", tinyPng),
        ]),
      ),
      TRY_ON_LAB_ERROR_CODES.imageInvalid,
    );
  });

  it("accepts internal lab multipart input without consent acknowledgement", async () => {
    const parsed = await parseTryOnLabMultipartRequest(
      fakeMultipartRequest([
        file("personImage", "image/png", tinyPng),
        file("garmentImage", "image/png", tinyPng),
        field("garmentSource", "DIRECT_UPLOAD"),
        field("garmentIntent", "FULL_OUTFIT"),
        field("category", "AUTO"),
        field("garmentPhotoType", "ON_MODEL"),
        field("categoryResolutionSource", "USER_DISAMBIGUATION"),
        field("photoTypeResolutionSource", "BODY_COVERAGE_ANALYSIS"),
        field("profileResolutionSource", "PLATFORM_DEFAULT"),
        field("analysisConfidence", "0.82"),
        field("disambiguationRequired", "true"),
        field("disambiguationResolved", "true"),
        field("garmentAnalysisBodyCoverage", "FULL_BODY_MODEL"),
        field(
          "garmentAnalysisReasonCodes",
          JSON.stringify(["POSE_FULL_BODY_COVERAGE"]),
        ),
        field("qualityWarningCodes", JSON.stringify(["IMAGE_TOO_BLURRY"])),
        field("qualityOverrideAccepted", "true"),
      ]),
    );

    expect(parsed.garmentSource).toBe("DIRECT_UPLOAD");
    expect(parsed.garmentIntent).toBe("FULL_OUTFIT");
    expect(parsed.category).toBe("AUTO");
    expect(parsed.garmentPhotoType).toBe("ON_MODEL");
    expect(parsed.categoryResolutionSource).toBe("USER_DISAMBIGUATION");
    expect(parsed.analysisConfidence).toBe(0.82);
    expect(parsed.disambiguationRequired).toBe(true);
    expect(parsed.disambiguationResolved).toBe(true);
    expect(parsed.garmentAnalysisBodyCoverage).toBe("FULL_BODY_MODEL");
    expect(parsed.garmentAnalysisReasonCodes).toEqual([
      "POSE_FULL_BODY_COVERAGE",
    ]);
    expect(parsed.qualityWarningCodes).toEqual(["IMAGE_TOO_BLURRY"]);
    expect(parsed.qualityOverrideAccepted).toBe(true);
  });

  it("accepts valid JPEG uploads with automatic resolution metadata", async () => {
    const parsed = await parseTryOnLabMultipartRequest(
      fakeMultipartRequest([
        file("personImage", "image/jpeg", tinyJpeg, "person.jpg"),
        file("garmentImage", "image/jpeg", tinyJpeg, "garment.jpg"),
        ...automaticResolutionFields(),
      ]),
    );

    expect(TRY_ON_LAB_MULTIPART_LIMITS.fields).toBeGreaterThanOrEqual(15);
    expect(TRY_ON_LAB_MULTIPART_LIMITS.parts).toBeGreaterThanOrEqual(17);
    expect(parsed.personImage.mimeType).toBe("image/jpeg");
    expect(parsed.garmentImage.mimeType).toBe("image/jpeg");
    expect(parsed.garmentSource).toBe("DIRECT_UPLOAD");
    expect(parsed.garmentIntent).toBe("AUTO");
    expect(parsed.category).toBe("AUTO");
    expect(parsed.garmentPhotoType).toBe("AUTO");
    expect(parsed.categoryResolutionSource).toBe("AUTO_FALLBACK");
    expect(parsed.analysisConfidence).toBeUndefined();
    expect(parsed.garmentAnalysisBodyCoverage).toBeUndefined();
    expect(parsed.garmentAnalysisReasonCodes).toEqual([
      "POSE_ANALYSIS_UNAVAILABLE",
    ]);
  });

  it("accepts upper-body automatic TOP resolution metadata", async () => {
    const parsed = await parseTryOnLabMultipartRequest(
      fakeMultipartRequest([
        file("personImage", "image/png", tinyPng),
        file("garmentImage", "image/png", tinyPng),
        ...automaticResolutionFields({
          garmentIntent: "TOP",
          category: "TOP",
          garmentPhotoType: "ON_MODEL",
          categoryResolutionSource: "BODY_COVERAGE_ANALYSIS",
          photoTypeResolutionSource: "BODY_COVERAGE_ANALYSIS",
          analysisConfidence: "0.82",
          garmentAnalysisBodyCoverage: "UPPER_BODY_MODEL",
          garmentAnalysisReasonCodes: JSON.stringify([
            "POSE_UPPER_BODY_COVERAGE",
          ]),
        }),
      ]),
    );

    expect(parsed.garmentIntent).toBe("TOP");
    expect(parsed.category).toBe("TOP");
    expect(parsed.garmentPhotoType).toBe("ON_MODEL");
    expect(parsed.analysisConfidence).toBe(0.82);
    expect(parsed.garmentAnalysisBodyCoverage).toBe("UPPER_BODY_MODEL");
  });

  it("accepts Advanced settings override metadata", async () => {
    const parsed = await parseTryOnLabMultipartRequest(
      fakeMultipartRequest([
        file("personImage", "image/png", tinyPng),
        file("garmentImage", "image/png", tinyPng),
        ...automaticResolutionFields({
          garmentIntent: "BOTTOM",
          category: "BOTTOM",
          garmentPhotoType: "FLAT_LAY",
          generationProfile: "QUALITY",
          categoryResolutionSource: "INTERNAL_LAB_OVERRIDE",
          photoTypeResolutionSource: "INTERNAL_LAB_OVERRIDE",
          profileResolutionSource: "INTERNAL_LAB_OVERRIDE",
        }),
      ]),
    );

    expect(parsed.garmentIntent).toBe("BOTTOM");
    expect(parsed.category).toBe("BOTTOM");
    expect(parsed.garmentPhotoType).toBe("FLAT_LAY");
    expect(parsed.generationProfile).toBe("QUALITY");
    expect(parsed.categoryResolutionSource).toBe("INTERNAL_LAB_OVERRIDE");
  });

  it("returns a specific multipart error for metadata limit failures before provider submission", async () => {
    const provider = new FakeTryOnProvider();

    await expectErrorCodeAsync(
      parseTryOnLabMultipartRequest(
        throwingMultipartRequest("FST_FIELDS_LIMIT"),
      ),
      TRY_ON_LAB_ERROR_CODES.multipartInvalid,
    );
    expect(provider.submissions).toBe(0);
  });

  it("rejects invalid quality warning telemetry codes", async () => {
    await expectErrorCodeAsync(
      parseTryOnLabMultipartRequest(
        fakeMultipartRequest([
          file("personImage", "image/png", tinyPng),
          file("garmentImage", "image/png", tinyPng),
          field("qualityWarningCodes", JSON.stringify(["FASHN_API_KEY"])),
        ]),
      ),
      TRY_ON_LAB_ERROR_CODES.resolutionMetadataInvalid,
    );
  });

  it("rejects invalid automatic garment resolution telemetry", async () => {
    await expectErrorCodeAsync(
      parseTryOnLabMultipartRequest(
        fakeMultipartRequest([
          file("personImage", "image/png", tinyPng),
          file("garmentImage", "image/png", tinyPng),
          field("garmentIntent", "DRESS_FULL_OUTFIT"),
        ]),
      ),
      TRY_ON_LAB_ERROR_CODES.resolutionMetadataInvalid,
    );

    await expectErrorCodeAsync(
      parseTryOnLabMultipartRequest(
        fakeMultipartRequest([
          file("personImage", "image/png", tinyPng),
          file("garmentImage", "image/png", tinyPng),
          field("analysisConfidence", "4"),
        ]),
      ),
      TRY_ON_LAB_ERROR_CODES.resolutionMetadataInvalid,
    );
  });
});

function createService(provider: TryOnProvider): TryOnLabService {
  return new TryOnLabService(
    new TryOnLabRunRegistryService(),
    new TryOnExecutionService(provider),
  );
}

function payload() {
  return {
    personImage: {
      fieldName: "personImage" as const,
      filename: "person.png",
      mimeType: "image/png" as const,
      sizeBytes: tinyPng.length,
      buffer: tinyPng,
      dataUri: `data:image/png;base64,${tinyPng.toString("base64")}`,
    },
    garmentImage: {
      fieldName: "garmentImage" as const,
      filename: "garment.png",
      mimeType: "image/png" as const,
      sizeBytes: tinyPng.length,
      buffer: tinyPng,
      dataUri: `data:image/png;base64,${tinyPng.toString("base64")}`,
    },
    garmentSource: "DIRECT_UPLOAD" as const,
    garmentIntent: "TOP" as const,
    category: "TOP" as const,
    garmentPhotoType: "FLAT_LAY" as const,
    generationProfile: "BALANCED" as const,
    categoryResolutionSource: "BODY_COVERAGE_ANALYSIS" as const,
    photoTypeResolutionSource: "AUTO_FALLBACK" as const,
    profileResolutionSource: "PLATFORM_DEFAULT" as const,
    analysisConfidence: 0.82,
    disambiguationRequired: false,
    disambiguationResolved: false,
    garmentAnalysisBodyCoverage: "UPPER_BODY_MODEL" as const,
    garmentAnalysisReasonCodes: ["POSE_UPPER_BODY_COVERAGE" as const],
    qualityWarningCodes: ["IMAGE_TOO_BLURRY" as const],
    qualityOverrideAccepted: true,
  };
}

async function waitForRunStatus(
  service: TryOnLabService,
  actorUserId: string,
  runId: string,
) {
  for (let index = 0; index < 20; index += 1) {
    const run = service.getRun(actorUserId, runId);
    if (run.status === "COMPLETED" || run.status === "FAILED") {
      return run;
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  return service.getRun(actorUserId, runId);
}

function setLabEnabled(enabled: boolean): () => void {
  const previous = process.env.TRYON_LAB_ENABLED;
  process.env.TRYON_LAB_ENABLED = enabled ? "true" : "false";
  return () => {
    if (previous === undefined) {
      delete process.env.TRYON_LAB_ENABLED;
    } else {
      process.env.TRYON_LAB_ENABLED = previous;
    }
  };
}

function expectErrorCode(error: unknown, code: string): void {
  expect(error).toBeInstanceOf(ApiErrorException);
  expect((error as ApiErrorException).getResponse()).toMatchObject({
    error: { code },
  });
}

async function expectErrorCodeAsync(
  promise: Promise<unknown>,
  code: string,
): Promise<void> {
  try {
    await promise;
    throw new Error(`Expected ${code}`);
  } catch (error) {
    expectErrorCode(error, code);
  }
}

function fakeMultipartRequest(parts: unknown[]): FastifyRequest {
  return {
    isMultipart: () => true,
    parts: async function* () {
      for (const part of parts) {
        yield part;
      }
    },
  } as unknown as FastifyRequest;
}

function field(fieldname: string, value: string) {
  return {
    type: "field",
    fieldname,
    value,
  };
}

function file(
  fieldname: string,
  mimetype: string,
  buffer: Buffer,
  filename = `${fieldname}.png`,
) {
  return {
    type: "file",
    fieldname,
    filename,
    mimetype,
    toBuffer: async () => buffer,
  };
}

function throwingMultipartRequest(code: string): FastifyRequest {
  return {
    isMultipart: () => true,
    parts: () => ({
      [Symbol.asyncIterator]() {
        return {
          next: async () => {
            const error = new Error(code) as Error & { code: string };
            error.code = code;
            throw error;
          },
        };
      },
    }),
  } as unknown as FastifyRequest;
}

function automaticResolutionFields(
  overrides: Partial<Record<string, string>> = {},
) {
  return [
    field("garmentSource", overrides.garmentSource ?? "DIRECT_UPLOAD"),
    field("garmentIntent", overrides.garmentIntent ?? "AUTO"),
    field("category", overrides.category ?? "AUTO"),
    field("garmentPhotoType", overrides.garmentPhotoType ?? "AUTO"),
    field("generationProfile", overrides.generationProfile ?? "BALANCED"),
    field(
      "categoryResolutionSource",
      overrides.categoryResolutionSource ?? "AUTO_FALLBACK",
    ),
    field(
      "photoTypeResolutionSource",
      overrides.photoTypeResolutionSource ?? "AUTO_FALLBACK",
    ),
    field(
      "profileResolutionSource",
      overrides.profileResolutionSource ?? "PLATFORM_DEFAULT",
    ),
    field("analysisConfidence", overrides.analysisConfidence ?? ""),
    field(
      "disambiguationRequired",
      overrides.disambiguationRequired ?? "false",
    ),
    field(
      "disambiguationResolved",
      overrides.disambiguationResolved ?? "false",
    ),
    field(
      "garmentAnalysisBodyCoverage",
      overrides.garmentAnalysisBodyCoverage ?? "",
    ),
    field(
      "garmentAnalysisReasonCodes",
      overrides.garmentAnalysisReasonCodes ??
        JSON.stringify(["POSE_ANALYSIS_UNAVAILABLE"]),
    ),
    field("qualityWarningCodes", overrides.qualityWarningCodes ?? "[]"),
    field(
      "qualityOverrideAccepted",
      overrides.qualityOverrideAccepted ?? "false",
    ),
  ];
}

class FakeTryOnProvider implements TryOnProvider {
  private submitCount = 0;

  constructor(private readonly statuses: TryOnProviderStatusResult[] = []) {}

  assertConfigured(): void {
    return undefined;
  }

  metadata() {
    return {
      provider: "fake-provider",
      providerDisplayName: "Fake Provider",
      model: "fake-model-v1",
    };
  }

  async submit(): Promise<{ providerPredictionId: string }> {
    this.submitCount += 1;
    return { providerPredictionId: `provider-${this.submitCount}` };
  }

  get submissions(): number {
    return this.submitCount;
  }

  async poll(): Promise<TryOnProviderStatusResult> {
    return this.statuses.shift() ?? { status: "COMPLETED" };
  }
}

vi.mock("@selfx/database", () => ({
  createSelfxId: () => "0198a9b3-d0bc-7000-8000-000000000001",
}));
