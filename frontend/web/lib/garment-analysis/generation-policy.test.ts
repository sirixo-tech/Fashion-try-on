import { describe, expect, it } from "vitest";

import {
  analyzeGarmentBodyCoverageFromPoseLandmarks,
  createUnavailableGarmentInputAnalysisResult,
  resolveGenerationPolicy,
  type GarmentInputAnalysisResult,
  type PoseLandmarkLike,
} from "@selfx/shared";

describe("garment input analysis and generation policy resolution", () => {
  it("resolves product-only direct uploads to automatic category and photo type", () => {
    const analysis = analyzeGarmentBodyCoverageFromPoseLandmarks([]);

    expect(analysis).toMatchObject({
      personPresent: false,
      bodyCoverage: "NO_PERSON",
      ambiguity: false,
      suggestedCategory: "AUTO",
    });
    expect(
      resolveGenerationPolicy({
        garmentSource: "DIRECT_UPLOAD",
        directUploadAnalysis: analysis,
      }),
    ).toMatchObject({
      garmentIntent: "AUTO",
      category: "AUTO",
      garmentPhotoType: "AUTO",
      categoryResolutionSource: "AUTO_FALLBACK",
      photoTypeResolutionSource: "AUTO_FALLBACK",
      profileResolutionSource: "PLATFORM_DEFAULT",
    });
  });

  it("resolves upper and lower on-model coverage without asking a question", () => {
    expect(
      resolveGenerationPolicy({
        garmentSource: "DIRECT_UPLOAD",
        directUploadAnalysis: bodyCoverage("UPPER_BODY_MODEL"),
      }),
    ).toMatchObject({
      garmentIntent: "TOP",
      category: "TOP",
      garmentPhotoType: "ON_MODEL",
      categoryResolutionSource: "BODY_COVERAGE_ANALYSIS",
      disambiguationRequired: false,
    });

    expect(
      resolveGenerationPolicy({
        garmentSource: "DIRECT_UPLOAD",
        directUploadAnalysis: bodyCoverage("LOWER_BODY_MODEL"),
      }),
    ).toMatchObject({
      garmentIntent: "BOTTOM",
      category: "BOTTOM",
      garmentPhotoType: "ON_MODEL",
      categoryResolutionSource: "BODY_COVERAGE_ANALYSIS",
      disambiguationRequired: false,
    });
  });

  it("asks one question for full-body on-model direct uploads", () => {
    const policy = resolveGenerationPolicy({
      garmentSource: "DIRECT_UPLOAD",
      directUploadAnalysis: bodyCoverage("FULL_BODY_MODEL"),
    });

    expect(policy).toMatchObject({
      garmentIntent: "AUTO",
      category: "AUTO",
      garmentPhotoType: "ON_MODEL",
      disambiguationRequired: true,
      disambiguationResolved: false,
    });
  });

  it("keeps full outfit intent distinct from one-piece after disambiguation", () => {
    const policy = resolveGenerationPolicy({
      garmentSource: "DIRECT_UPLOAD",
      directUploadAnalysis: bodyCoverage("FULL_BODY_MODEL"),
      userDisambiguationIntent: "FULL_OUTFIT",
    });

    expect(policy).toMatchObject({
      garmentIntent: "FULL_OUTFIT",
      category: "AUTO",
      categoryResolutionSource: "USER_DISAMBIGUATION",
      disambiguationResolved: true,
    });
  });

  it.each([
    ["TOP", "TOP"],
    ["BOTTOM", "BOTTOM"],
    ["ONE_PIECE", "ONE_PIECE"],
    ["FULL_OUTFIT", "AUTO"],
  ] as const)(
    "maps %s disambiguation to provider-neutral category %s",
    (intent, category) => {
      expect(
        resolveGenerationPolicy({
          garmentSource: "DIRECT_UPLOAD",
          directUploadAnalysis: bodyCoverage("FULL_BODY_MODEL"),
          userDisambiguationIntent: intent,
        }),
      ).toMatchObject({
        garmentIntent: intent,
        category,
        categoryResolutionSource: "USER_DISAMBIGUATION",
        disambiguationResolved: true,
      });
    },
  );

  it("falls back to automatic resolution for low-confidence or unavailable analysis", () => {
    expect(
      resolveGenerationPolicy({
        garmentSource: "DIRECT_UPLOAD",
        directUploadAnalysis: bodyCoverage("UNKNOWN"),
      }),
    ).toMatchObject({
      garmentIntent: "AUTO",
      category: "AUTO",
      garmentPhotoType: "AUTO",
      categoryResolutionSource: "AUTO_FALLBACK",
      analysisConfidence: 0.2,
      disambiguationRequired: false,
    });

    expect(
      resolveGenerationPolicy({
        garmentSource: "DIRECT_UPLOAD",
        directUploadAnalysis: createUnavailableGarmentInputAnalysisResult(),
      }),
    ).toMatchObject({
      garmentIntent: "AUTO",
      category: "AUTO",
      garmentPhotoType: "AUTO",
      categoryResolutionSource: "AUTO_FALLBACK",
      analysisConfidence: null,
      disambiguationRequired: false,
      analysisReasonCodes: ["POSE_ANALYSIS_UNAVAILABLE"],
    });
  });

  it("lets trusted catalog metadata take precedence over direct-upload analysis", () => {
    expect(
      resolveGenerationPolicy({
        garmentSource: "SHOPIFY",
        trustedMetadata: {
          category: "ONE_PIECE",
          photoType: "FLAT_LAY",
        },
        directUploadAnalysis: bodyCoverage("UPPER_BODY_MODEL"),
      }),
    ).toMatchObject({
      garmentIntent: "ONE_PIECE",
      category: "ONE_PIECE",
      garmentPhotoType: "FLAT_LAY",
      categoryResolutionSource: "SHOPIFY_CATALOG_METADATA",
      photoTypeResolutionSource: "SHOPIFY_CATALOG_METADATA",
    });
  });

  it("supports internal Lab overrides without changing provider-neutral values", () => {
    expect(
      resolveGenerationPolicy({
        garmentSource: "DIRECT_UPLOAD",
        directUploadAnalysis: bodyCoverage("UPPER_BODY_MODEL"),
        internalLabOverride: {
          garmentIntent: "BOTTOM",
          garmentPhotoType: "FLAT_LAY",
          generationProfile: "QUALITY",
        },
      }),
    ).toMatchObject({
      garmentIntent: "BOTTOM",
      category: "BOTTOM",
      garmentPhotoType: "FLAT_LAY",
      generationProfile: "QUALITY",
      categoryResolutionSource: "INTERNAL_LAB_OVERRIDE",
      photoTypeResolutionSource: "INTERNAL_LAB_OVERRIDE",
      profileResolutionSource: "INTERNAL_LAB_OVERRIDE",
    });
  });

  it("classifies body coverage from pose landmark regions", () => {
    expect(
      analyzeGarmentBodyCoverageFromPoseLandmarks(
        landmarksWith(["shoulders", "hips"]),
      ).bodyCoverage,
    ).toBe("UPPER_BODY_MODEL");
    expect(
      analyzeGarmentBodyCoverageFromPoseLandmarks(
        landmarksWith(["hips", "knees", "ankles"]),
      ).bodyCoverage,
    ).toBe("LOWER_BODY_MODEL");
    expect(
      analyzeGarmentBodyCoverageFromPoseLandmarks(
        landmarksWith(["shoulders", "hips", "knees", "ankles"]),
      ).bodyCoverage,
    ).toBe("FULL_BODY_MODEL");
  });
});

function bodyCoverage(
  bodyCoverage: GarmentInputAnalysisResult["bodyCoverage"],
): GarmentInputAnalysisResult {
  return {
    personPresent: bodyCoverage !== "NO_PERSON" && bodyCoverage !== "UNKNOWN",
    bodyCoverage,
    ambiguity: bodyCoverage === "FULL_BODY_MODEL",
    suggestedCategory:
      bodyCoverage === "UPPER_BODY_MODEL"
        ? "TOP"
        : bodyCoverage === "LOWER_BODY_MODEL"
          ? "BOTTOM"
          : "AUTO",
    confidence: bodyCoverage === "UNKNOWN" ? 0.2 : 0.82,
    reasonCodes:
      bodyCoverage === "UPPER_BODY_MODEL"
        ? ["POSE_UPPER_BODY_COVERAGE"]
        : bodyCoverage === "LOWER_BODY_MODEL"
          ? ["POSE_LOWER_BODY_COVERAGE"]
          : bodyCoverage === "FULL_BODY_MODEL"
            ? ["POSE_FULL_BODY_COVERAGE"]
            : ["POSE_LOW_CONFIDENCE"],
  };
}

function landmarksWith(
  regions: ("shoulders" | "hips" | "knees" | "ankles")[],
): PoseLandmarkLike[] {
  const landmarks = Array.from({ length: 33 }, () => ({
    visibility: 0.1,
    presence: 0.1,
  }));

  const mark = (left: number, right: number) => {
    landmarks[left] = { visibility: 0.9, presence: 0.9 };
    landmarks[right] = { visibility: 0.9, presence: 0.9 };
  };

  if (regions.includes("shoulders")) {
    mark(11, 12);
  }
  if (regions.includes("hips")) {
    mark(23, 24);
  }
  if (regions.includes("knees")) {
    mark(25, 26);
  }
  if (regions.includes("ankles")) {
    mark(27, 28);
  }

  return landmarks;
}
