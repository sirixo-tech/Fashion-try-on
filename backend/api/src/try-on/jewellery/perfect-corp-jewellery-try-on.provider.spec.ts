import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { TRY_ON_LAB_ERROR_CODES } from "@selfx/shared";

import { ApiErrorException } from "../../common/api-error.exception.js";
import {
  PerfectCorpJewelleryTryOnProvider,
  mapPerfectCorpRuntimeError,
  normalizePerfectCorpInputImage,
  perfectCorpRoute,
} from "./perfect-corp-jewellery-try-on.provider.js";

describe("PerfectCorpJewelleryTryOnProvider", () => {
  beforeEach(() => {
    process.env.SELFX_PERFECT_CORP_JEWELLERY_TRY_ON_ENABLED = "true";
    process.env.PERFECT_CORP_API_KEY = "test-key";
    process.env.PERFECT_CORP_API_BASE_URL = "https://yce-api-01.makeupar.com";
  });

  afterEach(() => {
    delete process.env.SELFX_PERFECT_CORP_JEWELLERY_TRY_ON_ENABLED;
    delete process.env.PERFECT_CORP_API_KEY;
    delete process.env.PERFECT_CORP_API_BASE_URL;
    delete process.env.PERFECT_CORP_HTTP_TIMEOUT_MS;
  });

  it("uploads images and completes an earring task through type-specific routes", async () => {
    const provider = new TestPerfectCorpProvider([
      jsonResponse({
        status: 200,
        data: {
          files: [
            uploadDescriptor("person.jpg", "person-file", "person-upload"),
            uploadDescriptor(
              "jewellery.jpg",
              "jewellery-file",
              "jewellery-upload",
            ),
          ],
        },
      }),
      new Response(undefined, { status: 200 }),
      new Response(undefined, { status: 200 }),
      jsonResponse({ status: 200, data: { task_id: "task/one" } }),
      jsonResponse({
        status: 200,
        data: {
          task_status: "success",
          results: { url: "https://results.example/look.jpg" },
        },
      }),
    ]);
    const image = await jpegDataUri();

    const submitted = await provider.submit({
      personImageDataUri: image,
      jewelleryImageDataUri: image,
      jewelleryType: "EARRING",
    });
    await expect(
      provider.poll(submitted.providerPredictionId),
    ).resolves.toEqual({
      status: "COMPLETED",
      resultImage: "https://results.example/look.jpg",
    });

    expect(provider.calls.map((call) => String(call.input))).toEqual([
      "https://yce-api-01.makeupar.com/s2s/v2.0/file/2d-vto/earring",
      "https://uploads.example/person-upload",
      "https://uploads.example/jewellery-upload",
      "https://yce-api-01.makeupar.com/s2s/v2.0/task/2d-vto/earring",
      "https://yce-api-01.makeupar.com/s2s/v2.0/task/2d-vto/earring/task%2Fone",
    ]);
    const taskBody = JSON.parse(String(provider.calls[3]?.init.body)) as Record<
      string,
      unknown
    >;
    expect(taskBody).toMatchObject({
      src_file_id: "person-file",
      ref_file_ids: ["jewellery-file"],
      source_info: { name: "person-file" },
      object_infos: [
        {
          name: "jewellery-file",
          parameter: { earring_need_remove_background: true },
        },
      ],
    });
    expect(readHeader(provider.calls[0]?.init, "Authorization")).toBe(
      "Bearer test-key",
    );
    expect(readHeader(provider.calls[1]?.init, "Authorization")).toBeNull();
  });

  it("maps running and failed provider task states", async () => {
    const image = await jpegDataUri();
    const provider = providerWithSubmittedTask(image, [
      jsonResponse({ status: 200, data: { task_status: "running" } }),
      jsonResponse({
        status: 200,
        data: {
          task_status: "error",
          error: { code: "PHOTO_CHECK_INVALID" },
        },
      }),
    ]);
    const submitted = await provider.submit({
      personImageDataUri: image,
      jewelleryImageDataUri: image,
      jewelleryType: "RING",
    });

    await expect(
      provider.poll(submitted.providerPredictionId),
    ).resolves.toEqual({ status: "PROCESSING" });
    await expect(
      provider.poll(submitted.providerPredictionId),
    ).resolves.toEqual({
      status: "FAILED",
      errorCode: TRY_ON_LAB_ERROR_CODES.poseNotDetected,
      errorMessage:
        "The provider could not detect a suitable person pose for this jewellery type.",
    });
  });

  it("normalizes WebP input to a supported Perfect Corp image", async () => {
    const webp = await sharp({
      create: {
        width: 640,
        height: 640,
        channels: 3,
        background: "#ff6600",
      },
    })
      .webp()
      .toBuffer();

    const normalized = await normalizePerfectCorpInputImage(
      `data:image/webp;base64,${webp.toString("base64")}`,
      "jewellery",
    );

    expect(normalized.contentType).toBe("image/jpeg");
    expect(normalized.fileName).toBe("jewellery.jpg");
    await expect(sharp(normalized.buffer).metadata()).resolves.toMatchObject({
      format: "jpeg",
      width: 640,
      height: 640,
    });
  });

  it("modestly upscales a usable person photo to the provider minimum", async () => {
    const jpeg = await sharp({
      create: {
        width: 521,
        height: 587,
        channels: 3,
        background: "#ffffff",
      },
    })
      .jpeg()
      .toBuffer();

    const normalized = await normalizePerfectCorpInputImage(
      `data:image/jpeg;base64,${jpeg.toString("base64")}`,
      "person",
    );

    await expect(sharp(normalized.buffer).metadata()).resolves.toMatchObject({
      format: "jpeg",
      width: 640,
      height: 721,
    });
  });

  it("rejects undersized jewellery references instead of inventing detail", async () => {
    const jpeg = await sharp({
      create: {
        width: 225,
        height: 225,
        channels: 3,
        background: "#ffffff",
      },
    })
      .jpeg()
      .toBuffer();

    await expectApiErrorCode(
      normalizePerfectCorpInputImage(
        `data:image/jpeg;base64,${jpeg.toString("base64")}`,
        "jewellery",
      ),
      TRY_ON_LAB_ERROR_CODES.imageInvalid,
    );
  });

  it("maps authentication and rate-limit responses to stable SelfX errors", async () => {
    const image = await jpegDataUri();
    for (const [status, code] of [
      [401, TRY_ON_LAB_ERROR_CODES.configurationError],
      [429, TRY_ON_LAB_ERROR_CODES.providerRateLimited],
    ] as const) {
      const provider = new TestPerfectCorpProvider([
        jsonResponse({ error_code: "provider-error" }, status),
      ]);
      const promise = provider.submit({
        personImageDataUri: image,
        jewelleryImageDataUri: image,
        jewelleryType: "NECKLACE",
      });
      await expectApiErrorCode(promise, code);
    }
  });

  it("keeps route and runtime error mappings explicit", () => {
    expect(perfectCorpRoute("BRACELET")).toEqual({
      slug: "bracelet",
      filePath: "/s2s/v2.0/file/2d-vto/bracelet",
      taskPath: "/s2s/v2.0/task/2d-vto/bracelet",
    });
    expect(
      mapPerfectCorpRuntimeError("error_nsfw_content_detected"),
    ).toMatchObject({ errorCode: TRY_ON_LAB_ERROR_CODES.moderationRejected });
    expect(mapPerfectCorpRuntimeError("OBJECT_DETECTION_FAIL")).toMatchObject({
      errorCode: TRY_ON_LAB_ERROR_CODES.imageInvalid,
    });
    expect(mapPerfectCorpRuntimeError("INVALID_IMAGE_DIMENSION")).toMatchObject(
      { errorCode: TRY_ON_LAB_ERROR_CODES.imageInvalid },
    );
  });
});

interface FetchCall {
  input: string | URL;
  init: RequestInit;
}

class TestPerfectCorpProvider extends PerfectCorpJewelleryTryOnProvider {
  readonly calls: FetchCall[] = [];

  constructor(private readonly responses: Response[]) {
    super();
  }

  protected override performFetch(
    input: string | URL,
    init: RequestInit,
  ): Promise<Response> {
    this.calls.push({ input, init });
    const response = this.responses.shift();
    if (!response) {
      throw new Error("Unexpected Perfect Corp request");
    }
    return Promise.resolve(response);
  }
}

function providerWithSubmittedTask(
  _image: string,
  pollResponses: Response[],
): TestPerfectCorpProvider {
  return new TestPerfectCorpProvider([
    jsonResponse({
      status: 200,
      data: {
        files: [
          uploadDescriptor("person.jpg", "person-file", "person-upload"),
          uploadDescriptor(
            "jewellery.jpg",
            "jewellery-file",
            "jewellery-upload",
          ),
        ],
      },
    }),
    new Response(undefined, { status: 200 }),
    new Response(undefined, { status: 200 }),
    jsonResponse({ status: 200, data: { task_id: "task-two" } }),
    ...pollResponses,
  ]);
}

function uploadDescriptor(fileName: string, fileId: string, suffix: string) {
  return {
    file_name: fileName,
    file_id: fileId,
    requests: [
      {
        method: "PUT",
        url: `https://uploads.example/${suffix}`,
        headers: { "Content-Type": "image/jpeg" },
      },
    ],
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function readHeader(
  init: RequestInit | undefined,
  name: string,
): string | null {
  return new Headers(init?.headers).get(name);
}

async function jpegDataUri(): Promise<string> {
  const jpeg = await sharp({
    create: {
      width: 640,
      height: 640,
      channels: 3,
      background: "#ffffff",
    },
  })
    .jpeg()
    .toBuffer();
  return `data:image/jpeg;base64,${jpeg.toString("base64")}`;
}

async function expectApiErrorCode(
  promise: Promise<unknown>,
  expectedCode: string,
): Promise<void> {
  try {
    await promise;
    throw new Error("Expected provider request to fail");
  } catch (error) {
    expect(error).toBeInstanceOf(ApiErrorException);
    const response = (error as ApiErrorException).getResponse();
    expect(response).toMatchObject({ error: { code: expectedCode } });
  }
}
