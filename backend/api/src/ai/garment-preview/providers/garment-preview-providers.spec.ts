import { HttpStatus } from "@nestjs/common";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  SELFX_AI_PROVIDER_ERROR_CODES,
  SelfxAiProviderError,
} from "../../provider-errors.js";
import {
  FashnGarmentPreviewProvider,
  imageDataUriFromOutput,
  mapFashnRuntimeError,
} from "./fashn-garment-preview.provider.js";
import {
  OpenAiGarmentPreviewProvider,
  openAiImageBase64From,
} from "./openai-garment-preview.provider.js";

describe("garment preview providers", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.FASHN_API_KEY;
    delete process.env.OPENAI_API_KEY;
  });

  it("normalizes a FASHN preview result to the SelfX preview contract", async () => {
    process.env.FASHN_API_KEY = "fashn-key";
    const subscribe = vi.fn(async () => ({
      id: "prediction-1",
      status: "completed" as const,
      output: ["data:image/png;base64,ZmFzaG4="],
      error: null,
    }));
    const provider = new TestFashnGarmentPreviewProvider({ subscribe });

    const result = await provider.generatePreview(previewInput());

    expect(subscribe).toHaveBeenCalledWith(
      expect.objectContaining({
        model_name: "edit",
        inputs: expect.objectContaining({
          image: "data:image/jpeg;base64,Z2FybWVudA==",
          output_format: "png",
          return_base64: true,
        }),
      }),
    );
    expect(result).toEqual({
      imageDataUri: "data:image/png;base64,ZmFzaG4=",
      mimeType: "image/png",
    });
  });

  it("normalizes an OpenAI preview result to the same SelfX preview contract", async () => {
    process.env.OPENAI_API_KEY = "openai-key";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [{ b64_json: "b3BlbmFp" }],
        }),
        { status: 200 },
      ),
    );
    const provider = new OpenAiGarmentPreviewProvider();

    const result = await provider.generatePreview(previewInput());

    expect(result).toEqual({
      imageDataUri: "data:image/png;base64,b3BlbmFp",
      mimeType: "image/png",
    });
  });

  it("does not require OPENAI_API_KEY when FASHN preview is selected", () => {
    process.env.FASHN_API_KEY = "fashn-key";
    delete process.env.OPENAI_API_KEY;

    expect(() =>
      new TestFashnGarmentPreviewProvider({
        subscribe: vi.fn(),
      }).assertConfigured(),
    ).not.toThrow();
  });

  it("fails in a controlled way when OpenAI preview is selected without OpenAI config", () => {
    const provider = new OpenAiGarmentPreviewProvider();

    expect(() => provider.assertConfigured()).toThrow(SelfxAiProviderError);
  });

  it("maps provider-specific image errors to normalized SelfX preview errors", () => {
    const error = mapFashnRuntimeError("failed", "ImageLoadError");

    expect(error).toMatchObject({
      code: SELFX_AI_PROVIDER_ERROR_CODES.invalidImage,
      status: HttpStatus.BAD_REQUEST,
    });
  });

  it("accepts only returned base64 PNG data URIs as preview images", () => {
    expect(imageDataUriFromOutput(["data:image/png;base64,abc"])).toBe(
      "data:image/png;base64,abc",
    );
    expect(
      imageDataUriFromOutput(["https://provider.example/image.png"]),
    ).toBeNull();
    expect(openAiImageBase64From({ data: [{ b64_json: "abc" }] })).toBe("abc");
  });
});

class TestFashnGarmentPreviewProvider extends FashnGarmentPreviewProvider {
  constructor(
    private readonly predictions: { subscribe: ReturnType<typeof vi.fn> },
  ) {
    super();
  }

  protected override createClient(apiKey: string) {
    void apiKey;
    return { predictions: this.predictions } as never;
  }
}

function previewInput() {
  return {
    image: {
      filename: "garment.jpg",
      mimeType: "image/jpeg",
      buffer: Buffer.from("garment"),
      sizeBytes: 7,
    },
    garmentIntent: "TOP" as const,
  };
}
