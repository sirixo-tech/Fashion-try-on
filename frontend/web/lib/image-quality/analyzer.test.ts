import { describe, expect, it } from "vitest";

import {
  createInvalidImageQualityResult,
  normalizeImageQualityResult,
} from "@selfx/shared";

import {
  TRY_ON_LAB_BROWSER_MAX_IMAGE_BYTES,
  validateBrowserImageFile,
} from "./analyzer";

describe("image quality normalization", () => {
  it("passes useful image metrics", () => {
    const result = normalizeImageQualityResult(
      {
        width: 640,
        height: 640,
        sharpness: 120,
        brightness: 120,
        contrast: 42,
      },
      "person",
    );

    expect(result.passed).toBe(true);
    expect(result.issues).toHaveLength(0);
    expect(result.score).toBe(100);
  });

  it("keeps low resolution advisory for technically valid uploads", () => {
    const tooSmall = normalizeImageQualityResult(
      {
        width: 80,
        height: 80,
        sharpness: 10,
        brightness: 20,
        contrast: 5,
      },
      "garment",
    );

    expect(tooSmall.status).toBe("WARNING");
    expect(tooSmall.passed).toBe(true);
    expect(tooSmall.issues.map((issue) => issue.code)).toContain(
      "IMAGE_LOW_RESOLUTION",
    );
  });

  it.each([
    [
      "blurry",
      { sharpness: 10, brightness: 120, contrast: 36 },
      "IMAGE_TOO_BLURRY",
    ],
    [
      "dark",
      { sharpness: 120, brightness: 25, contrast: 36 },
      "IMAGE_TOO_DARK",
    ],
    [
      "low contrast",
      { sharpness: 120, brightness: 120, contrast: 8 },
      "IMAGE_LOW_CONTRAST",
    ],
  ] as const)("returns %s concerns as warnings", (_label, metrics, code) => {
    const result = normalizeImageQualityResult(
      {
        width: 640,
        height: 640,
        ...metrics,
      },
      "person",
    );

    expect(result.status).toBe("WARNING");
    expect(result.passed).toBe(true);
    expect(result.issues.map((issue) => issue.code)).toContain(code);
    expect(result.issues.every((issue) => issue.severity === "WARNING")).toBe(
      true,
    );
  });

  it("represents invalid images as blocking quality results", () => {
    const invalid = createInvalidImageQualityResult(
      "IMAGE_INVALID",
      "Image could not be decoded.",
    );

    expect(invalid.status).toBe("BLOCKED");
    expect(invalid.passed).toBe(false);
    expect(invalid.score).toBe(0);
    expect(invalid.metrics.width).toBeNull();
    expect(invalid.issues[0]).toMatchObject({
      code: "IMAGE_INVALID",
      severity: "BLOCKING",
    });
  });

  it("blocks unsupported and oversized files during browser technical validation", () => {
    const unsupported = validateBrowserImageFile(
      new File(["text"], "note.txt", { type: "text/plain" }),
    );
    const oversized = validateBrowserImageFile(
      new File(
        [new Uint8Array(TRY_ON_LAB_BROWSER_MAX_IMAGE_BYTES + 1)],
        "big.png",
        {
          type: "image/png",
        },
      ),
    );

    expect(unsupported?.status).toBe("BLOCKED");
    expect(unsupported?.issues[0]?.code).toBe("IMAGE_UNSUPPORTED_FORMAT");
    expect(oversized?.status).toBe("BLOCKED");
    expect(oversized?.issues[0]?.code).toBe("IMAGE_TOO_LARGE");
  });
});
