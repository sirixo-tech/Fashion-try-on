import { HttpException, HttpStatus, Injectable } from "@nestjs/common";

import { createSelfxId } from "@selfx/database";

import { PrismaService } from "../database/prisma.service.js";

export const PUBLIC_API_RATE_LIMIT_ERROR_CODES = {
  exceeded: "PUBLIC_API_RATE_LIMIT_EXCEEDED",
} as const;

export const publicApiRateLimitBuckets = [
  "identity",
  "upload",
  "try_on_create",
  "try_on_read",
  "download",
  "usage",
  "webhook_manage",
  "general",
] as const;

export type PublicApiRateLimitBucket =
  (typeof publicApiRateLimitBuckets)[number];

export type PublicApiRateLimitResult = {
  allowed: boolean;
  bucket: PublicApiRateLimitBucket;
  retryAfterSeconds?: number;
  headers: Record<string, string>;
};

type WindowLimit = {
  name: "minute" | "hour";
  seconds: number;
  limit: number;
};

type ConsumedWindow = WindowLimit & {
  count: number;
  remaining: number;
  resetAt: Date;
  retryAfterSeconds: number;
};

const minuteSeconds = 60;
const hourSeconds = 60 * 60;

const defaultLimits: Record<PublicApiRateLimitBucket, WindowLimit[]> = {
  identity: [
    { name: "minute", seconds: minuteSeconds, limit: 60 },
    { name: "hour", seconds: hourSeconds, limit: 600 },
  ],
  upload: [
    { name: "minute", seconds: minuteSeconds, limit: 30 },
    { name: "hour", seconds: hourSeconds, limit: 300 },
  ],
  try_on_create: [
    { name: "minute", seconds: minuteSeconds, limit: 10 },
    { name: "hour", seconds: hourSeconds, limit: 100 },
  ],
  try_on_read: [
    { name: "minute", seconds: minuteSeconds, limit: 120 },
    { name: "hour", seconds: hourSeconds, limit: 2_000 },
  ],
  download: [
    { name: "minute", seconds: minuteSeconds, limit: 60 },
    { name: "hour", seconds: hourSeconds, limit: 300 },
  ],
  usage: [
    { name: "minute", seconds: minuteSeconds, limit: 30 },
    { name: "hour", seconds: hourSeconds, limit: 300 },
  ],
  webhook_manage: [
    { name: "minute", seconds: minuteSeconds, limit: 30 },
    { name: "hour", seconds: hourSeconds, limit: 300 },
  ],
  general: [
    { name: "minute", seconds: minuteSeconds, limit: 60 },
    { name: "hour", seconds: hourSeconds, limit: 600 },
  ],
};

@Injectable()
export class PublicApiRateLimitService {
  constructor(private readonly prisma: PrismaService) {}

  async consume(input: {
    apiKeyId: string;
    bucket: PublicApiRateLimitBucket;
    now?: Date;
  }): Promise<PublicApiRateLimitResult> {
    if (process.env.SELFX_PUBLIC_API_RATE_LIMIT_ENABLED === "false") {
      return {
        allowed: true,
        bucket: input.bucket,
        headers: disabledHeaders(input.bucket),
      };
    }

    const now = input.now ?? new Date();
    const windows = await Promise.all(
      defaultLimits[input.bucket].map((window) =>
        this.consumeWindow(input.apiKeyId, input.bucket, window, now),
      ),
    );
    const exceeded = windows.filter((window) => window.count > window.limit);
    const activeWindow = exceeded[0] ?? requireConsumedWindow(windows[0]);
    const headers = headersFor(input.bucket, windows, activeWindow);

    if (exceeded.length > 0) {
      return {
        allowed: false,
        bucket: input.bucket,
        retryAfterSeconds: Math.max(
          ...exceeded.map((window) => window.retryAfterSeconds),
        ),
        headers,
      };
    }

    return { allowed: true, bucket: input.bucket, headers };
  }

  private async consumeWindow(
    apiKeyId: string,
    bucket: PublicApiRateLimitBucket,
    window: WindowLimit,
    now: Date,
  ): Promise<ConsumedWindow> {
    const windowStartsAt = windowStart(now, window.seconds);
    const row = await this.prisma.apiRateLimitBucket.upsert({
      where: {
        apiKeyId_routeBucket_windowSeconds_windowStartsAt: {
          apiKeyId,
          routeBucket: bucket,
          windowSeconds: window.seconds,
          windowStartsAt,
        },
      },
      create: {
        id: createSelfxId(),
        apiKeyId,
        routeBucket: bucket,
        windowSeconds: window.seconds,
        windowStartsAt,
        requestCount: 1,
      },
      update: {
        requestCount: { increment: 1 },
      },
    });
    const resetAt = new Date(windowStartsAt.getTime() + window.seconds * 1000);
    return {
      ...window,
      count: row.requestCount,
      remaining: Math.max(window.limit - row.requestCount, 0),
      resetAt,
      retryAfterSeconds: Math.max(
        Math.ceil((resetAt.getTime() - now.getTime()) / 1000),
        1,
      ),
    };
  }
}

function requireConsumedWindow(
  window: ConsumedWindow | undefined,
): ConsumedWindow {
  if (!window) {
    throw new Error("Public API rate limit bucket has no configured windows.");
  }
  return window;
}

export class PublicApiRateLimitExceededException extends HttpException {
  constructor(retryAfterSeconds: number) {
    super(
      {
        error: {
          code: PUBLIC_API_RATE_LIMIT_ERROR_CODES.exceeded,
          message: `Public API rate limit exceeded. Try again in ${retryAfterSeconds} seconds.`,
        },
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}

function headersFor(
  bucket: PublicApiRateLimitBucket,
  windows: ConsumedWindow[],
  activeWindow: ConsumedWindow,
): Record<string, string> {
  const minute = windows.find((window) => window.name === "minute");
  const hour = windows.find((window) => window.name === "hour");
  return removeUndefinedHeaders({
    "X-RateLimit-Bucket": bucket,
    "X-RateLimit-Limit": String(activeWindow.limit),
    "X-RateLimit-Remaining": String(activeWindow.remaining),
    "X-RateLimit-Reset": String(
      Math.floor(activeWindow.resetAt.getTime() / 1000),
    ),
    "X-RateLimit-Limit-Minute": minute ? String(minute.limit) : undefined,
    "X-RateLimit-Remaining-Minute": minute
      ? String(minute.remaining)
      : undefined,
    "X-RateLimit-Reset-Minute": minute
      ? String(Math.floor(minute.resetAt.getTime() / 1000))
      : undefined,
    "X-RateLimit-Limit-Hour": hour ? String(hour.limit) : undefined,
    "X-RateLimit-Remaining-Hour": hour ? String(hour.remaining) : undefined,
    "X-RateLimit-Reset-Hour": hour
      ? String(Math.floor(hour.resetAt.getTime() / 1000))
      : undefined,
  });
}

function disabledHeaders(
  bucket: PublicApiRateLimitBucket,
): Record<string, string> {
  return {
    "X-RateLimit-Bucket": bucket,
    "X-RateLimit-Policy": "disabled",
  };
}

function removeUndefinedHeaders(
  headers: Record<string, string | undefined>,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(headers).filter(
      (entry): entry is [string, string] => entry[1] !== undefined,
    ),
  );
}

function windowStart(now: Date, windowSeconds: number): Date {
  return new Date(
    Math.floor(now.getTime() / (windowSeconds * 1000)) * windowSeconds * 1000,
  );
}
