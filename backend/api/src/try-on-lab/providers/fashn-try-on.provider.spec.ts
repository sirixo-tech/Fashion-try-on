import { describe, expect, it } from "vitest";

import { TRY_ON_LAB_ERROR_CODES } from "@selfx/shared";

import {
  mapGarmentCategory,
  mapGarmentPhotoType,
  mapGenerationProfile,
  mapProviderRuntimeError,
  mapProviderStatus,
} from "./fashn-try-on.provider.js";

describe("FashnTryOnProvider mappings", () => {
  it("maps SelfX garment categories to FASHN v1.6 categories", () => {
    expect(mapGarmentCategory("AUTO")).toBe("auto");
    expect(mapGarmentCategory("TOP")).toBe("tops");
    expect(mapGarmentCategory("BOTTOM")).toBe("bottoms");
    expect(mapGarmentCategory("ONE_PIECE")).toBe("one-pieces");
  });

  it("maps SelfX photo types and generation profiles to FASHN values", () => {
    expect(mapGarmentPhotoType("AUTO")).toBe("auto");
    expect(mapGarmentPhotoType("FLAT_LAY")).toBe("flat-lay");
    expect(mapGarmentPhotoType("ON_MODEL")).toBe("model");

    expect(mapGenerationProfile("PERFORMANCE")).toBe("performance");
    expect(mapGenerationProfile("BALANCED")).toBe("balanced");
    expect(mapGenerationProfile("QUALITY")).toBe("quality");
  });

  it("maps provider statuses and runtime errors to SelfX outcomes", () => {
    expect(mapProviderStatus("starting")).toBe("QUEUED");
    expect(mapProviderStatus("in_queue")).toBe("QUEUED");
    expect(mapProviderStatus("processing")).toBe("PROCESSING");
    expect(mapProviderStatus("completed")).toBe("COMPLETED");
    expect(mapProviderStatus("failed")).toBe("FAILED");
    expect(mapProviderStatus("time_out")).toBe("FAILED");

    expect(mapProviderRuntimeError("failed", "PoseError").errorCode).toBe(
      TRY_ON_LAB_ERROR_CODES.poseNotDetected,
    );
    expect(
      mapProviderRuntimeError("failed", "ContentModerationError").errorCode,
    ).toBe(TRY_ON_LAB_ERROR_CODES.moderationRejected);
    expect(mapProviderRuntimeError("time_out").errorCode).toBe(
      TRY_ON_LAB_ERROR_CODES.timedOut,
    );
  });
});
