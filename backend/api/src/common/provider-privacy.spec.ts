import "reflect-metadata";
import { Controller, Get, HttpStatus, Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from "@nestjs/platform-fastify";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { ApiErrorException } from "./api-error.exception.js";
import { inlineTryOnResult } from "./inline-try-on-result.js";
import { publicTryOnErrorMessage } from "./public-try-on-errors.js";
import { TryOnErrorFilter } from "./try-on-error.filter.js";
import { JewelleryTryOnLabRunRegistryService } from "../try-on-lab/jewellery-try-on-lab-run-registry.service.js";
import { TRY_ON_RESULT_MAX_IMAGE_BYTES } from "../try-on/try-on.constants.js";

@Controller()
class PrivacyController {
  @Get([
    "api/v1/try-on-lab/runs",
    "api/v1/try-on-lab/jewellery/runs",
    "api/v1/kiosk/try-on/runs",
    "api/v1/public/try-ons",
    "api/v1/public/integrations/shopify/try-on-sessions",
  ])
  tryOn() {
    throw new ApiErrorException(
      HttpStatus.SERVICE_UNAVAILABLE,
      "TRYON_CONFIGURATION_ERROR",
      "GOOGLE_PROJECT_ID is missing for Vertex provider.",
    );
  }

  @Get("api/v1/auth/google/callback")
  auth() {
    throw new ApiErrorException(
      HttpStatus.UNAUTHORIZED,
      "GOOGLE_AUTH_FAILED",
      "Google sign-in failed.",
    );
  }

  @Get("api/v1/payments")
  payment() {
    throw new ApiErrorException(
      HttpStatus.BAD_REQUEST,
      "PAYMENT_FAILED",
      "PhonePe payment provider is unavailable.",
    );
  }
}

@Module({ controllers: [PrivacyController] })
class PrivacyModule {}

describe("Try-On provider privacy at the HTTP boundary", () => {
  let app: NestFastifyApplication;
  beforeAll(async () => {
    app = await NestFactory.create<NestFastifyApplication>(
      PrivacyModule,
      new FastifyAdapter(),
      { logger: false },
    );
    app.useGlobalFilters(new TryOnErrorFilter());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });
  afterAll(async () => {
    await app?.close();
  });

  it.each([
    "api/v1/try-on-lab/runs",
    "api/v1/try-on-lab/jewellery/runs",
    "api/v1/kiosk/try-on/runs",
    "api/v1/public/try-ons",
    "api/v1/public/integrations/shopify/try-on-sessions",
  ])(
    "hides configuration details on %s while preserving status and code",
    async (url) => {
      const result = await app.inject({ method: "GET", url: `/${url}` });
      expect(result.statusCode).toBe(503);
      expect(result.json()).toEqual({
        error: {
          code: "TRYON_CONFIGURATION_ERROR",
          message:
            "SelfX Try-On is temporarily unavailable. Please try again later.",
        },
      });
    },
  );

  it.each([
    ["/api/v1/auth/google/callback", 401, "Google sign-in failed."],
    ["/api/v1/payments", 400, "PhonePe payment provider is unavailable."],
  ])(
    "preserves the separate authentication and payment errors on %s",
    async (url, status, message) => {
      const result = await app.inject({ method: "GET", url });
      expect(result.statusCode).toBe(status);
      expect(result.json().error.message).toBe(message);
    },
  );

  it("keeps actionable image guidance and sanitizes stored failures without mutating diagnostics", () => {
    expect(
      publicTryOnErrorMessage(
        "TRYON_IMAGE_INVALID",
        "Upload a JPEG, PNG or WebP image.",
      ),
    ).toBe("Upload a JPEG, PNG or WebP image.");
    const registry = new JewelleryTryOnLabRunRegistryService();
    const run = registry.create({
      id: "selfx-run",
      actorUserId: "user-1",
      jewelleryType: "RING",
      providerMetadata: {
        provider: "perfect-corp",
        providerDisplayName: "Perfect Corp",
        model: "jewellery-virtual-try-on",
      },
    });
    registry.update(run.id, {
      status: "FAILED",
      providerPredictionId: "vendor-secret-id",
      errorCode: "TRYON_PROVIDER_UNAVAILABLE",
      errorMessage: "Perfect Corp provider image upload failed.",
    });
    const response = registry.toResponse(run);
    expect(JSON.stringify(response)).not.toMatch(
      /perfect.corp|jewellery-virtual-try-on|vendor-secret-id/i,
    );
    expect(response.telemetry).not.toHaveProperty("provider");
    expect(response.telemetry).not.toHaveProperty("model");
    expect(response.errorMessage).toBe(
      "SelfX Try-On is temporarily unavailable. Please try again later.",
    );
    expect(run.providerPredictionId).toBe("vendor-secret-id");
    expect(run.errorMessage).toContain("Perfect Corp");
  });
});

describe("SelfX inline result images", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });
  const png = Buffer.from(
    "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c636000000200015d0b2a0b0000000049454e44ae426082",
    "hex",
  );

  it("fetches remote images on the server and returns image bytes without the vendor URL", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(png, { headers: { "content-type": "image/png" } }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const result = await inlineTryOnResult(
      "https://vendor.example/result.png?token=secret",
    );
    expect(result).toBe(`data:image/png;base64,${png.toString("base64")}`);
    expect(result).not.toContain("vendor");
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("does not fetch existing inline output", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const image = `data:image/png;base64,${png.toString("base64")}`;
    expect(await inlineTryOnResult(image)).toBe(image);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    "http://vendor.example/result.png",
    "https://user:secret@vendor.example/result.png",
  ])("rejects insecure output %s", async (url) => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(inlineTryOnResult(url)).rejects.toMatchObject({
      response: {
        error: {
          message: "SelfX could not load this Try-On result. Please try again.",
        },
      },
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    () => new Response("signed vendor error", { status: 403 }),
    () => new Response("not an image"),
    () =>
      new Response("too large", {
        headers: {
          "content-length": String(TRY_ON_RESULT_MAX_IMAGE_BYTES + 1),
        },
      }),
    () =>
      new Response(null, {
        status: 302,
        headers: { location: "http://vendor.example/insecure.png" },
      }),
  ])(
    "does not leak failed, invalid, oversized or insecure redirected output",
    async (response) => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => response()),
      );
      await expect(
        inlineTryOnResult("https://vendor.example/result.png?secret=token"),
      ).rejects.toMatchObject({
        response: {
          error: {
            message:
              "SelfX could not load this Try-On result. Please try again.",
          },
        },
      });
    },
  );
});
