import { createHmac } from "node:crypto";

import { Injectable, Logger } from "@nestjs/common";
import {
  type Prisma,
  type WebhookDelivery,
  type WebhookEndpoint,
} from "@prisma/client";

import { WorkerPrismaService } from "./prisma.service.js";

const webhookApiVersion = "2026-08-29";
const webhookTimeoutMs = 5_000;
const defaultBatchSize = 25;
const maxBatchSize = 100;
const defaultMaxAttempts = 5;
const retryDelayMsByAttempt = [
  5 * 60 * 1000,
  15 * 60 * 1000,
  60 * 60 * 1000,
  6 * 60 * 60 * 1000,
  24 * 60 * 60 * 1000,
] as const;

export type WebhookRetryCycleResult = {
  scanned: number;
  claimed: number;
  delivered: number;
  failed: number;
  exhausted: number;
  skipped: number;
  signingConfigured: boolean;
};

type RetriableWebhookDelivery = WebhookDelivery & {
  webhookEndpoint: WebhookEndpoint;
};

@Injectable()
export class WebhookRetryService {
  private readonly logger = new Logger(WebhookRetryService.name);

  constructor(private readonly prisma: WorkerPrismaService) {}

  async retryDueDeliveries(now = new Date()): Promise<WebhookRetryCycleResult> {
    let signingKey: string;
    try {
      signingKey = requireSigningKey();
    } catch (error) {
      this.logger.warn({
        event: "public_api_webhook_retry_signing_not_configured",
        message: error instanceof Error ? error.message : "Unknown error",
      });
      return emptyResult({ signingConfigured: false });
    }

    const maxAttempts = readPositiveInt(
      process.env.SELFX_WEBHOOK_RETRY_MAX_ATTEMPTS,
      defaultMaxAttempts,
      1,
      20,
    );
    const exhausted = await this.exhaustMaxAttemptDeliveries(now, maxAttempts);
    const dueDeliveries = await this.findDueDeliveries(now, maxAttempts);
    const result: WebhookRetryCycleResult = {
      scanned: dueDeliveries.length,
      claimed: 0,
      delivered: 0,
      failed: 0,
      exhausted,
      skipped: 0,
      signingConfigured: true,
    };

    for (const delivery of dueDeliveries) {
      const claimedAttempt = delivery.attemptNumber + 1;
      const claimed = await this.claimDelivery(delivery, now);
      if (!claimed) {
        result.skipped += 1;
        continue;
      }
      result.claimed += 1;

      const body = stringifyStoredPayload(delivery.payload);
      if (!body) {
        await this.failDeliveryWithoutRetry(
          delivery.id,
          "Webhook delivery payload is unavailable; retry cannot be sent.",
        );
        result.exhausted += 1;
        continue;
      }

      const delivered = await this.retryClaimedDelivery(
        delivery,
        body,
        signingKey,
        claimedAttempt,
        maxAttempts,
        now,
      );
      if (delivered) {
        result.delivered += 1;
      } else {
        result.failed += 1;
      }
    }

    return result;
  }

  private async findDueDeliveries(
    now: Date,
    maxAttempts: number,
  ): Promise<RetriableWebhookDelivery[]> {
    const batchSize = readPositiveInt(
      process.env.SELFX_WEBHOOK_RETRY_BATCH_SIZE,
      defaultBatchSize,
      1,
      maxBatchSize,
    );
    return this.prisma.webhookDelivery.findMany({
      where: {
        status: "FAILED",
        nextRetryAt: { lte: now },
        attemptNumber: { lt: maxAttempts },
        webhookEndpoint: { status: "ACTIVE" },
      },
      include: { webhookEndpoint: true },
      orderBy: [{ nextRetryAt: "asc" }, { createdAt: "asc" }],
      take: batchSize,
    });
  }

  private async exhaustMaxAttemptDeliveries(
    now: Date,
    maxAttempts: number,
  ): Promise<number> {
    const result = await this.prisma.webhookDelivery.updateMany({
      where: {
        status: "FAILED",
        nextRetryAt: { lte: now },
        attemptNumber: { gte: maxAttempts },
      },
      data: {
        nextRetryAt: null,
        errorMessage: `Webhook delivery retry limit reached after ${maxAttempts} attempts.`,
      },
    });
    return result.count;
  }

  private async claimDelivery(
    delivery: RetriableWebhookDelivery,
    now: Date,
  ): Promise<boolean> {
    const result = await this.prisma.webhookDelivery.updateMany({
      where: {
        id: delivery.id,
        status: "FAILED",
        nextRetryAt: { lte: now },
        attemptNumber: delivery.attemptNumber,
      },
      data: {
        status: "PENDING",
        attemptNumber: { increment: 1 },
        httpStatus: null,
        errorMessage: null,
        nextRetryAt: null,
      },
    });
    return result.count === 1;
  }

  private async retryClaimedDelivery(
    delivery: RetriableWebhookDelivery,
    body: string,
    signingKey: string,
    attemptNumber: number,
    maxAttempts: number,
    now: Date,
  ): Promise<boolean> {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const endpointSecret = deriveEndpointSecret(
      delivery.webhookEndpointId,
      signingKey,
    );
    const signature = signWebhookPayload(endpointSecret, timestamp, body);

    try {
      const response = await postWebhook(delivery.webhookEndpoint.url, {
        body,
        headers: {
          "content-type": "application/json",
          "selfx-api-version": webhookApiVersion,
          "selfx-delivery-id": delivery.id,
          "selfx-event-id": delivery.eventId,
          "selfx-event-type": delivery.eventType,
          "selfx-signature": signature,
          "selfx-timestamp": timestamp,
        },
      });
      if (response.ok) {
        await this.prisma.webhookDelivery.update({
          where: { id: delivery.id },
          data: {
            status: "DELIVERED",
            httpStatus: response.status,
            deliveredAt: new Date(),
            nextRetryAt: null,
            errorMessage: null,
          },
        });
        return true;
      }
      await this.markRetryFailed(delivery.id, attemptNumber, maxAttempts, now, {
        httpStatus: response.status,
        errorMessage: `Webhook endpoint returned HTTP ${response.status}.`,
      });
      return false;
    } catch (error) {
      await this.markRetryFailed(delivery.id, attemptNumber, maxAttempts, now, {
        errorMessage:
          error instanceof Error ? error.message : "Webhook delivery failed.",
      });
      return false;
    }
  }

  private async markRetryFailed(
    deliveryId: string,
    attemptNumber: number,
    maxAttempts: number,
    now: Date,
    input: { httpStatus?: number; errorMessage: string },
  ): Promise<void> {
    const retryAvailable = attemptNumber < maxAttempts;
    await this.prisma.webhookDelivery.update({
      where: { id: deliveryId },
      data: {
        status: "FAILED",
        httpStatus: input.httpStatus,
        errorMessage: input.errorMessage.slice(0, 1000),
        nextRetryAt: retryAvailable
          ? new Date(now.getTime() + retryDelayMsForAttempt(attemptNumber))
          : null,
      },
    });
  }

  private async failDeliveryWithoutRetry(
    deliveryId: string,
    errorMessage: string,
  ): Promise<void> {
    await this.prisma.webhookDelivery.update({
      where: { id: deliveryId },
      data: {
        status: "FAILED",
        errorMessage,
        nextRetryAt: null,
      },
    });
  }
}

function emptyResult(
  overrides: Partial<WebhookRetryCycleResult> = {},
): WebhookRetryCycleResult {
  return {
    scanned: 0,
    claimed: 0,
    delivered: 0,
    failed: 0,
    exhausted: 0,
    skipped: 0,
    signingConfigured: true,
    ...overrides,
  };
}

function requireSigningKey(): string {
  const value =
    process.env.SELFX_WEBHOOK_SIGNING_KEY?.trim() ||
    process.env.JWT_ACCESS_SECRET?.trim();
  if (!value) {
    throw new Error("Webhook signing is not configured.");
  }
  return value;
}

function deriveEndpointSecret(endpointId: string, signingKey: string): string {
  return `whsec_${createHmac("sha256", signingKey)
    .update(`selfx:webhook:endpoint:${endpointId}`, "utf8")
    .digest("base64url")}`;
}

function signWebhookPayload(
  endpointSecret: string,
  timestamp: string,
  body: string,
): string {
  const signature = createHmac("sha256", endpointSecret)
    .update(`${timestamp}.${body}`, "utf8")
    .digest("hex");
  return `v1=${signature}`;
}

function stringifyStoredPayload(
  payload: Prisma.JsonValue | null,
): string | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }
  return JSON.stringify(payload);
}

function retryDelayMsForAttempt(attemptNumber: number): number {
  const index = Math.min(
    Math.max(attemptNumber - 1, 0),
    retryDelayMsByAttempt.length - 1,
  );
  return retryDelayMsByAttempt[index] ?? retryDelayMsByAttempt[0];
}

function readPositiveInt(
  value: string | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(Math.max(parsed, min), max);
}

async function postWebhook(
  url: string,
  input: { body: string; headers: Record<string, string> },
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), webhookTimeoutMs);
  try {
    return await fetch(url, {
      method: "POST",
      headers: input.headers,
      body: input.body,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}
