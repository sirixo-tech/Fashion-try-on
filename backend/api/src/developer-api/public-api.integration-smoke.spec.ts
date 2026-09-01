import "reflect-metadata";

import fastifyMultipart from "@fastify/multipart";
import { HttpStatus, Module, ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from "@nestjs/platform-fastify";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { ApiErrorException } from "../common/api-error.exception.js";
import { PrismaExceptionFilter } from "../common/prisma-exception.filter.js";
import { PublicApiController } from "./public-api.controller.js";
import { PublicApiKeyAuthService } from "./public-api-key-auth.service.js";
import { PublicApiRateLimitService } from "./public-api-rate-limit.service.js";
import { PublicApiTryOnService } from "./public-api-try-on.service.js";
import { PublicApiUploadService } from "./public-api-upload.service.js";
import { PublicApiUsageService } from "./public-api-usage.service.js";
import { PublicApiWebhookService } from "./public-api-webhook.service.js";

const apiKey = "selfx_test_smoke012345678901234567890123456";

describe("Public API integration smoke flow", () => {
  let app: NestFastifyApplication;
  let state: SmokeState;

  beforeAll(async () => {
    state = new SmokeState();

    @Module({
      controllers: [PublicApiController],
      providers: [
        {
          provide: PublicApiKeyAuthService,
          useValue: { verifyRequest: state.verifyRequest.bind(state) },
        },
        {
          provide: PublicApiRateLimitService,
          useValue: { consume: state.consumeRateLimit },
        },
        {
          provide: PublicApiUploadService,
          useValue: { uploadImage: state.uploadImage.bind(state) },
        },
        {
          provide: PublicApiTryOnService,
          useValue: {
            createRun: state.createRun.bind(state),
            getRun: state.getRun.bind(state),
            downloadRunResult: state.downloadRunResult.bind(state),
          },
        },
        {
          provide: PublicApiUsageService,
          useValue: { summary: state.usageSummary.bind(state) },
        },
        {
          provide: PublicApiWebhookService,
          useValue: {
            createEndpoint: state.createWebhookEndpoint.bind(state),
            listEndpoints: state.listWebhookEndpoints.bind(state),
            updateEndpoint: state.updateWebhookEndpoint.bind(state),
            disableEndpoint: state.disableWebhookEndpoint.bind(state),
          },
        },
      ],
    })
    class PublicApiSmokeModule {}

    app = await NestFactory.create<NestFastifyApplication>(
      PublicApiSmokeModule,
      new FastifyAdapter(),
      { logger: false },
    );

    await app.register(fastifyMultipart);
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        exceptionFactory: () =>
          new ApiErrorException(
            HttpStatus.BAD_REQUEST,
            "VALIDATION_FAILED",
            "Request validation failed.",
          ),
      }),
    );
    app.useGlobalFilters(new PrismaExceptionFilter());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("covers credential inspection, uploads, run creation, polling, download, usage and webhooks", async () => {
    const http = request(app.getHttpServer());

    const me = await http
      .get("/api/v1/public/me")
      .set("x-selfx-api-key", apiKey)
      .expect(200);
    expect(me.headers["x-ratelimit-bucket"]).toBe("identity");
    expect(me.body).toMatchObject({
      authenticated: true,
      environment: "TEST",
      scopes: [
        "tryon:create",
        "tryon:read",
        "usage:read",
        "webhooks:manage",
      ],
      store: { id: "store-smoke", name: "Smoke Store" },
    });

    const personUpload = await http
      .post("/api/v1/public/uploads")
      .set("x-selfx-api-key", apiKey)
      .field("purpose", "PERSON")
      .attach("image", pngBuffer(), {
        filename: "person.png",
        contentType: "image/png",
      })
      .expect(201);

    const garmentUpload = await http
      .post("/api/v1/public/uploads")
      .set("x-selfx-api-key", apiKey)
      .field("purpose", "GARMENT")
      .field("sessionId", personUpload.body.sessionId)
      .attach("image", pngBuffer(), {
        filename: "garment.png",
        contentType: "image/png",
      })
      .expect(201);

    expect(personUpload.headers["x-ratelimit-bucket"]).toBe("upload");
    expect(garmentUpload.body).toMatchObject({
      sessionId: personUpload.body.sessionId,
      purpose: "GARMENT",
      contentType: "image/png",
      width: 320,
      height: 480,
    });

    const createdRun = await http
      .post("/api/v1/public/try-ons")
      .set("x-selfx-api-key", apiKey)
      .send({
        clientRequestId: "smoke-order-1001-look-1",
        sessionId: personUpload.body.sessionId,
        personAssetId: personUpload.body.assetId,
        garmentAssetId: garmentUpload.body.assetId,
        garmentIntent: "TOP",
        category: "TOP",
        garmentPhotoType: "FLAT_LAY",
        generationProfile: "BALANCED",
        catalogSource: "CUSTOM_API",
        externalProductId: "merchant-shirt-1001",
        externalVariantId: "merchant-shirt-1001-blue-xl",
        sku: "BLUE-SHIRT-XL",
        productName: "Blue Shirt",
        price: "2499.00",
        currency: "INR",
      })
      .expect(201);

    expect(createdRun.headers["x-ratelimit-bucket"]).toBe("try_on_create");
    expect(createdRun.body).toMatchObject({
      status: "QUEUED",
      sessionId: personUpload.body.sessionId,
      productReference: {
        catalogSource: "CUSTOM_API",
        externalProductId: "merchant-shirt-1001",
        externalVariantId: "merchant-shirt-1001-blue-xl",
        sku: "BLUE-SHIRT-XL",
        productName: "Blue Shirt",
        price: "2499.00",
        currency: "INR",
      },
    });

    const completedRun = await http
      .get(`/api/v1/public/try-ons/${createdRun.body.id}`)
      .set("x-selfx-api-key", apiKey)
      .expect(200);

    expect(completedRun.headers["x-ratelimit-bucket"]).toBe("try_on_read");
    expect(completedRun.body).toMatchObject({
      id: createdRun.body.id,
      status: "COMPLETED",
      result: {
        assetId: "0198a9b3-d0bc-7000-8000-000000000401",
        readUrl: `/api/v1/public/try-ons/${createdRun.body.id}/download`,
      },
    });
    expect(state.webhookDeliveries).toEqual([
      {
        event: "try_on.completed",
        runId: createdRun.body.id,
        status: "DELIVERED",
        attempts: 1,
      },
    ]);

    const download = await http
      .get(`/api/v1/public/try-ons/${createdRun.body.id}/download`)
      .set("x-selfx-api-key", apiKey)
      .buffer()
      .parse((response, callback) =>
        binaryParser(response as unknown as NodeJS.ReadableStream, callback),
      )
      .expect(200);

    expect(download.headers["content-type"]).toBe("image/png");
    expect(download.headers["content-disposition"]).toContain("attachment;");
    expect(download.headers["x-ratelimit-bucket"]).toBe("download");
    expect(Buffer.isBuffer(download.body)).toBe(true);
    expect(download.body.subarray(0, 8)).toEqual(pngBuffer().subarray(0, 8));

    const usage = await http
      .get("/api/v1/public/usage?range=7d&catalogSource=CUSTOM_API&productQuery=BLUE-SHIRT")
      .set("x-selfx-api-key", apiKey)
      .expect(200);

    expect(usage.headers["x-ratelimit-bucket"]).toBe("usage");
    expect(usage.body).toMatchObject({
      store: { id: "store-smoke", name: "Smoke Store" },
      totals: {
        runsCreated: 1,
        completedRuns: 1,
        generatedLooks: 1,
        downloadsCompleted: 1,
      },
      catalogSourceUsage: [
        {
          catalogSource: "CUSTOM_API",
          runsCreated: 1,
          generatedLooks: 1,
          downloadsCompleted: 1,
        },
      ],
      productUsage: [
        {
          catalogSource: "CUSTOM_API",
          externalProductId: "merchant-shirt-1001",
          sku: "BLUE-SHIRT-XL",
          productName: "Blue Shirt",
          downloadsCompleted: 1,
        },
      ],
    });

    const webhook = await http
      .post("/api/v1/public/webhooks")
      .set("x-selfx-api-key", apiKey)
      .send({
        url: "https://merchant.example.com/selfx/webhooks",
        subscribedEvents: ["try_on.completed", "try_on.failed"],
      })
      .expect(201);
    expect(webhook.body).toMatchObject({
      id: "webhook-smoke-1",
      status: "ACTIVE",
      secret: expect.stringMatching(/^whsec_/),
    });

    const webhooks = await http
      .get("/api/v1/public/webhooks")
      .set("x-selfx-api-key", apiKey)
      .expect(200);
    expect(webhooks.headers["x-ratelimit-bucket"]).toBe("webhook_manage");
    expect(webhooks.body.data).toHaveLength(1);
  });

  it("returns a clear 429 when the per-route bucket is exhausted", async () => {
    state.blockNextBucket = "try_on_create";

    const response = await request(app.getHttpServer())
      .post("/api/v1/public/try-ons")
      .set("x-selfx-api-key", apiKey)
      .send({
        clientRequestId: "rate-limit-smoke",
        sessionId: "0198a9b3-d0bc-7000-8000-000000000101",
        garmentAssetId: "0198a9b3-d0bc-7000-8000-000000000202",
      })
      .expect(429);

    expect(response.headers["retry-after"]).toBe("60");
    expect(response.body).toMatchObject({
      error: { code: "PUBLIC_API_RATE_LIMIT_EXCEEDED" },
    });
  });
});

class SmokeState {
  blockNextBucket: string | null = null;
  private readonly uploads = new Map<string, SmokeUpload>();
  private readonly runs = new Map<string, SmokeRun>();
  private readonly webhooks: SmokeWebhook[] = [];
  readonly webhookDeliveries: SmokeWebhookDelivery[] = [];
  private downloadCount = 0;

  readonly consumeRateLimit = vi.fn(
    async ({ bucket }: { bucket: string }) => {
      if (this.blockNextBucket === bucket) {
        this.blockNextBucket = null;
        return {
          allowed: false,
          bucket,
          retryAfterSeconds: 60,
          headers: {
            "X-RateLimit-Bucket": bucket,
            "X-RateLimit-Remaining": "0",
            "X-RateLimit-Reset": "1788200060",
          },
        };
      }
      return {
        allowed: true,
        bucket,
        headers: {
          "X-RateLimit-Bucket": bucket,
          "X-RateLimit-Remaining": "99",
          "X-RateLimit-Reset": "1788200060",
        },
      };
    },
  );

  async verifyRequest(
    request: { headers: Record<string, string | string[] | undefined> },
    requiredScopes: readonly string[],
  ) {
    const supplied = firstHeaderValue(request.headers["x-selfx-api-key"]);
    if (supplied !== apiKey) {
      throw new ApiErrorException(
        HttpStatus.UNAUTHORIZED,
        "PUBLIC_API_KEY_INVALID",
        "Public API key is invalid.",
      );
    }

    const scopes = [
      "tryon:create",
      "tryon:read",
      "usage:read",
      "webhooks:manage",
    ];
    const missingScopes = requiredScopes.filter(
      (scope) => !scopes.includes(scope),
    );
    if (missingScopes.length > 0) {
      throw new ApiErrorException(
        HttpStatus.FORBIDDEN,
        "PUBLIC_API_SCOPE_DENIED",
        "Public API key does not include the required scope.",
      );
    }

    return {
      apiKeyId: "api-key-smoke",
      keyPrefix: "selfx_test_smoke0123456",
      storeId: "store-smoke",
      storeName: "Smoke Store",
      environment: "TEST" as const,
      scopes,
    };
  }

  async uploadImage(
    _credential: unknown,
    payload: {
      purpose: "PERSON" | "GARMENT";
      sessionId?: string;
      image: { mimeType: string; sizeBytes: number; width: number; height: number };
    },
  ) {
    const sessionId = payload.sessionId ?? "0198a9b3-d0bc-7000-8000-000000000101";
    const assetId =
      payload.purpose === "PERSON"
        ? "0198a9b3-d0bc-7000-8000-000000000201"
        : "0198a9b3-d0bc-7000-8000-000000000202";
    this.uploads.set(assetId, {
      id: assetId,
      sessionId,
      purpose: payload.purpose,
    });

    return {
      sessionId,
      assetId,
      purpose: payload.purpose,
      contentType: payload.image.mimeType,
      sizeBytes: payload.image.sizeBytes,
      width: payload.image.width,
      height: payload.image.height,
      expiresAt: "2026-09-05T12:00:00.000Z",
      serverTime: "2026-09-01T06:00:00.000Z",
    };
  }

  async createRun(_credential: unknown, body: SmokeCreateRunBody) {
    expect(this.uploads.get(body.personAssetId)).toMatchObject({
      purpose: "PERSON",
    });
    expect(this.uploads.get(body.garmentAssetId)).toMatchObject({
      purpose: "GARMENT",
    });

    const run: SmokeRun = {
      id: "0198a9b3-d0bc-7000-8000-000000000301",
      status: "QUEUED",
      sessionId: body.sessionId,
      personAssetId: body.personAssetId,
      garmentAssetId: body.garmentAssetId,
      productReference: {
        catalogSource: body.catalogSource,
        externalProductId: body.externalProductId,
        externalVariantId: body.externalVariantId,
        sku: body.sku,
        productName: body.productName,
        price: body.price,
        currency: body.currency,
      },
      createdAt: "2026-09-01T06:00:00.000Z",
      updatedAt: "2026-09-01T06:00:00.000Z",
    };
    this.runs.set(run.id, {
      ...run,
      status: "COMPLETED",
      updatedAt: "2026-09-01T06:00:02.000Z",
      result: resultFor(run.id),
    });
    this.webhookDeliveries.push({
      event: "try_on.completed",
      runId: run.id,
      status: "DELIVERED",
      attempts: 1,
    });

    return run;
  }

  async getRun(_credential: unknown, runId: string) {
    const run = this.runs.get(runId);
    if (!run) {
      throw new ApiErrorException(
        HttpStatus.NOT_FOUND,
        "PUBLIC_API_TRY_ON_NOT_FOUND",
        "Try-On run was not found.",
      );
    }
    return run;
  }

  async downloadRunResult(_credential: unknown, runId: string) {
    if (!this.runs.has(runId)) {
      throw new ApiErrorException(
        HttpStatus.NOT_FOUND,
        "PUBLIC_API_TRY_ON_NOT_FOUND",
        "Try-On run was not found.",
      );
    }
    this.downloadCount += 1;
    return {
      body: pngBuffer(),
      contentType: "image/png",
      contentDisposition: `attachment; filename="selfx-${runId}.png"`,
      contentLength: pngBuffer().length,
    };
  }

  async usageSummary() {
    return {
      range: {
        preset: "7d",
        from: "2026-08-25T00:00:00.000Z",
        to: "2026-09-01T00:00:00.000Z",
      },
      store: { id: "store-smoke", name: "Smoke Store" },
      keyPrefix: "selfx_test_smoke0123456",
      totals: {
        runsCreated: this.runs.size,
        queuedRuns: 0,
        processingRuns: 0,
        completedRuns: this.completedRuns,
        failedRuns: 0,
        generatedLooks: this.completedRuns,
        downloadsCompleted: this.downloadCount,
      },
      providerUsage: [
        {
          provider: "fake-provider",
          providerModel: "fake-model-v1",
          runsCreated: this.runs.size,
          completedRuns: this.completedRuns,
          failedRuns: 0,
        },
      ],
      catalogSourceUsage: [
        {
          catalogSource: "CUSTOM_API",
          runsCreated: this.runs.size,
          completedRuns: this.completedRuns,
          failedRuns: 0,
          generatedLooks: this.completedRuns,
          downloadsCompleted: this.downloadCount,
        },
      ],
      productUsage: [
        {
          catalogSource: "CUSTOM_API",
          externalProductId: "merchant-shirt-1001",
          externalVariantId: "merchant-shirt-1001-blue-xl",
          sku: "BLUE-SHIRT-XL",
          productName: "Blue Shirt",
          price: "2499.00",
          currency: "INR",
          runsCreated: this.runs.size,
          completedRuns: this.completedRuns,
          failedRuns: 0,
          generatedLooks: this.completedRuns,
          downloadsCompleted: this.downloadCount,
        },
      ],
    };
  }

  async createWebhookEndpoint(
    _credential: unknown,
    body: { url: string; subscribedEvents?: string[] },
  ) {
    const endpoint = {
      id: "webhook-smoke-1",
      url: body.url,
      status: "ACTIVE",
      subscribedEvents: body.subscribedEvents ?? [
        "try_on.completed",
        "try_on.failed",
      ],
      createdAt: "2026-09-01T06:00:00.000Z",
      updatedAt: "2026-09-01T06:00:00.000Z",
    };
    this.webhooks.push(endpoint);
    return { ...endpoint, secret: "whsec_smoke_secret" };
  }

  async listWebhookEndpoints() {
    return { data: this.webhooks };
  }

  async updateWebhookEndpoint() {
    throw new Error("Not used by smoke test.");
  }

  async disableWebhookEndpoint() {
    throw new Error("Not used by smoke test.");
  }

  private get completedRuns(): number {
    return [...this.runs.values()].filter((run) => run.status === "COMPLETED")
      .length;
  }
}

interface SmokeUpload {
  id: string;
  sessionId: string;
  purpose: "PERSON" | "GARMENT";
}

interface SmokeCreateRunBody {
  sessionId: string;
  personAssetId: string;
  garmentAssetId: string;
  catalogSource: "CUSTOM_API";
  externalProductId: string;
  externalVariantId: string;
  sku: string;
  productName: string;
  price: string;
  currency: string;
}

interface SmokeRun {
  id: string;
  status: "QUEUED" | "COMPLETED";
  sessionId: string;
  personAssetId: string;
  garmentAssetId: string;
  productReference: {
    catalogSource: "CUSTOM_API";
    externalProductId: string;
    externalVariantId: string;
    sku: string;
    productName: string;
    price: string;
    currency: string;
  };
  createdAt: string;
  updatedAt: string;
  result?: {
    assetId: string;
    readUrl: string;
    contentType: string;
    sizeBytes: number;
    width: number;
    height: number;
    expiresAt: string;
  };
}

interface SmokeWebhook {
  id: string;
  url: string;
  status: string;
  subscribedEvents: string[];
  createdAt: string;
  updatedAt: string;
}

interface SmokeWebhookDelivery {
  event: string;
  runId: string;
  status: string;
  attempts: number;
}

function resultFor(runId: string) {
  return {
    assetId: "0198a9b3-d0bc-7000-8000-000000000401",
    readUrl: `/api/v1/public/try-ons/${runId}/download`,
    contentType: "image/png",
    sizeBytes: pngBuffer().length,
    width: 320,
    height: 480,
    expiresAt: "2026-09-05T12:00:00.000Z",
  };
}

function pngBuffer(): Buffer {
  const buffer = Buffer.alloc(24);
  buffer.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  buffer.write("IHDR", 12, "ascii");
  buffer.writeUInt32BE(320, 16);
  buffer.writeUInt32BE(480, 20);
  return buffer;
}

function firstHeaderValue(
  value: string | string[] | undefined,
): string | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }
  return value ?? null;
}

function binaryParser(
  response: NodeJS.ReadableStream,
  callback: (error: Error | null, body?: Buffer) => void,
): void {
  const chunks: Buffer[] = [];
  response.on("data", (chunk: Buffer) => chunks.push(chunk));
  response.on("end", () => callback(null, Buffer.concat(chunks)));
  response.on("error", (error) => callback(error));
}
