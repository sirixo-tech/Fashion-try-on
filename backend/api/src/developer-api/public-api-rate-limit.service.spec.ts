import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  PublicApiRateLimitExceededException,
  PublicApiRateLimitService,
} from "./public-api-rate-limit.service.js";

describe("PublicApiRateLimitService", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-31T10:00:12.000Z"));
    vi.stubEnv("SELFX_PUBLIC_API_RATE_LIMIT_ENABLED", "true");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it("keeps separate counters per API key and route category", async () => {
    const prisma = new FakePrisma();
    const service = new PublicApiRateLimitService(prisma as never);

    for (let index = 0; index < 10; index += 1) {
      await expect(
        service.consume({ apiKeyId: "key-1", bucket: "try_on_create" }),
      ).resolves.toMatchObject({ allowed: true });
    }

    await expect(
      service.consume({ apiKeyId: "key-1", bucket: "try_on_create" }),
    ).resolves.toMatchObject({
      allowed: false,
      retryAfterSeconds: 48,
      headers: expect.objectContaining({
        "X-RateLimit-Bucket": "try_on_create",
        "X-RateLimit-Remaining": "0",
      }),
    });
    await expect(
      service.consume({ apiKeyId: "key-2", bucket: "try_on_create" }),
    ).resolves.toMatchObject({ allowed: true });
    await expect(
      service.consume({ apiKeyId: "key-1", bucket: "try_on_read" }),
    ).resolves.toMatchObject({ allowed: true });
  });

  it("allows disabling rate limits for local/operator fallback", async () => {
    vi.stubEnv("SELFX_PUBLIC_API_RATE_LIMIT_ENABLED", "false");
    const prisma = new FakePrisma();
    const service = new PublicApiRateLimitService(prisma as never);

    await expect(
      service.consume({ apiKeyId: "key-1", bucket: "upload" }),
    ).resolves.toMatchObject({
      allowed: true,
      headers: {
        "X-RateLimit-Bucket": "upload",
        "X-RateLimit-Policy": "disabled",
      },
    });
    expect(prisma.apiRateLimitBucket.upsert).not.toHaveBeenCalled();
  });

  it("uses the SelfX 429 error envelope", () => {
    const error = new PublicApiRateLimitExceededException(30);

    expect(error.getStatus()).toBe(429);
    expect(error.getResponse()).toEqual({
      error: {
        code: "PUBLIC_API_RATE_LIMIT_EXCEEDED",
        message: "Public API rate limit exceeded. Try again in 30 seconds.",
      },
    });
  });
});

class FakePrisma {
  private readonly buckets = new Map<string, FakeBucket>();

  readonly apiRateLimitBucket = {
    upsert: vi.fn(
      async ({
        where,
        create,
        update,
      }: {
        where: {
          apiKeyId_routeBucket_windowSeconds_windowStartsAt: {
            apiKeyId: string;
            routeBucket: string;
            windowSeconds: number;
            windowStartsAt: Date;
          };
        };
        create: FakeBucket;
        update: { requestCount: { increment: number } };
      }) => {
        const key = bucketKey(
          where.apiKeyId_routeBucket_windowSeconds_windowStartsAt,
        );
        const current = this.buckets.get(key);
        if (current) {
          current.requestCount += update.requestCount.increment;
          current.updatedAt = new Date();
          return current;
        }
        const created = {
          ...create,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        this.buckets.set(key, created);
        return created;
      },
    ),
  };
}

type FakeBucket = {
  id: string;
  apiKeyId: string;
  routeBucket: string;
  windowSeconds: number;
  windowStartsAt: Date;
  requestCount: number;
  createdAt?: Date;
  updatedAt?: Date;
};

function bucketKey(input: {
  apiKeyId: string;
  routeBucket: string;
  windowSeconds: number;
  windowStartsAt: Date;
}): string {
  return [
    input.apiKeyId,
    input.routeBucket,
    input.windowSeconds,
    input.windowStartsAt.toISOString(),
  ].join(":");
}
