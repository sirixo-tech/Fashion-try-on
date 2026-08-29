import { createHmac } from "node:crypto";

import { HttpStatus, Injectable, Logger } from "@nestjs/common";
import { Prisma, type WebhookEndpoint } from "@prisma/client";

import { createSelfxId } from "@selfx/database";

import { ApiErrorException } from "../common/api-error.exception.js";
import { type PublicApiTryOnRunResponseDto } from "./dto/public-api-try-on.dto.js";
import {
  type CreatePublicApiWebhookEndpointDto,
  type CreatePublicApiWebhookEndpointResponseDto,
  type PublicApiWebhookEndpointDto,
  type PublicApiWebhookEndpointListResponseDto,
  type PublicApiWebhookEvent,
  type UpdatePublicApiWebhookEndpointDto,
  publicApiWebhookEventOptions,
} from "./dto/public-api-webhook.dto.js";
import { type PublicApiCredentialContext } from "./public-api-key-auth.service.js";
import { PrismaService } from "../database/prisma.service.js";

export const PUBLIC_API_WEBHOOK_ERROR_CODES = {
  endpointLimitReached: "PUBLIC_API_WEBHOOK_ENDPOINT_LIMIT_REACHED",
  endpointNotFound: "PUBLIC_API_WEBHOOK_ENDPOINT_NOT_FOUND",
  eventsInvalid: "PUBLIC_API_WEBHOOK_EVENTS_INVALID",
  signingNotConfigured: "PUBLIC_API_WEBHOOK_SIGNING_NOT_CONFIGURED",
  urlInvalid: "PUBLIC_API_WEBHOOK_URL_INVALID",
} as const;

const maxWebhookEndpointsPerStore = 10;
const webhookTimeoutMs = 5_000;
const webhookApiVersion = "2026-08-29";

type PublicApiWebhookPayload = {
  id: string;
  type: PublicApiWebhookEvent;
  apiVersion: typeof webhookApiVersion;
  createdAt: string;
  data: {
    object: "try_on";
    run: PublicApiTryOnRunResponseDto;
  };
};

@Injectable()
export class PublicApiWebhookService {
  private readonly logger = new Logger(PublicApiWebhookService.name);

  constructor(private readonly prisma: PrismaService) {}

  async listEndpoints(
    credential: PublicApiCredentialContext,
  ): Promise<PublicApiWebhookEndpointListResponseDto> {
    const endpoints = await this.prisma.webhookEndpoint.findMany({
      where: { organizationId: credential.storeId },
      orderBy: [{ createdAt: "desc" }],
    });
    return { data: endpoints.map(mapEndpoint) };
  }

  async createEndpoint(
    credential: PublicApiCredentialContext,
    input: CreatePublicApiWebhookEndpointDto,
  ): Promise<CreatePublicApiWebhookEndpointResponseDto> {
    assertSigningConfigured();
    const url = normalizeWebhookUrl(input.url);
    const subscribedEvents = cleanSubscribedEvents(input.subscribedEvents);
    const endpointCount = await this.prisma.webhookEndpoint.count({
      where: { organizationId: credential.storeId },
    });
    if (endpointCount >= maxWebhookEndpointsPerStore) {
      throw new ApiErrorException(
        HttpStatus.CONFLICT,
        PUBLIC_API_WEBHOOK_ERROR_CODES.endpointLimitReached,
        "Webhook endpoint limit reached for this Store.",
      );
    }

    const created = await this.prisma.webhookEndpoint.create({
      data: {
        id: createSelfxId(),
        organizationId: credential.storeId,
        url,
        status: "ACTIVE",
        secretReference: "derived:v1",
        subscribedEvents: subscribedEvents satisfies Prisma.InputJsonArray,
      },
    });

    return {
      ...mapEndpoint(created),
      secret: deriveEndpointSecret(created.id),
    };
  }

  async updateEndpoint(
    credential: PublicApiCredentialContext,
    endpointId: string,
    input: UpdatePublicApiWebhookEndpointDto,
  ): Promise<PublicApiWebhookEndpointDto> {
    await this.assertEndpointVisible(credential, endpointId);
    const data: Prisma.WebhookEndpointUpdateInput = {};
    if (input.url !== undefined) {
      data.url = normalizeWebhookUrl(input.url);
    }
    if (input.subscribedEvents !== undefined) {
      data.subscribedEvents = cleanSubscribedEvents(input.subscribedEvents);
    }
    if (input.enabled !== undefined) {
      data.status = input.enabled ? "ACTIVE" : "DISABLED";
    }

    const updated = await this.prisma.webhookEndpoint.update({
      where: { id: endpointId },
      data,
    });
    return mapEndpoint(updated);
  }

  async disableEndpoint(
    credential: PublicApiCredentialContext,
    endpointId: string,
  ): Promise<void> {
    await this.assertEndpointVisible(credential, endpointId);
    await this.prisma.webhookEndpoint.update({
      where: { id: endpointId },
      data: { status: "DISABLED" },
    });
  }

  async deliverTryOnRunTerminalEvent(
    storeId: string,
    run: PublicApiTryOnRunResponseDto,
  ): Promise<void> {
    const eventType = eventTypeForRunStatus(run.status);
    if (!eventType) {
      return;
    }
    let signingKey: string;
    try {
      signingKey = requireSigningKey();
    } catch (error) {
      this.logger.warn({
        event: "public_api_webhook_signing_not_configured",
        runId: run.id,
        message: error instanceof Error ? error.message : "Unknown error",
      });
      return;
    }

    const endpoints = await this.prisma.webhookEndpoint.findMany({
      where: { organizationId: storeId, status: "ACTIVE" },
      orderBy: [{ createdAt: "asc" }],
    });
    const subscribed = endpoints.filter((endpoint) =>
      endpointSubscribedTo(endpoint, eventType),
    );
    if (subscribed.length === 0) {
      return;
    }

    const payload: PublicApiWebhookPayload = {
      id: createSelfxId(),
      type: eventType,
      apiVersion: webhookApiVersion,
      createdAt: new Date().toISOString(),
      data: { object: "try_on", run },
    };
    await Promise.all(
      subscribed.map((endpoint) =>
        this.deliverEndpoint(storeId, endpoint, payload, signingKey),
      ),
    );
  }

  private async assertEndpointVisible(
    credential: PublicApiCredentialContext,
    endpointId: string,
  ): Promise<WebhookEndpoint> {
    const endpoint = await this.prisma.webhookEndpoint.findFirst({
      where: { id: endpointId, organizationId: credential.storeId },
    });
    if (!endpoint) {
      throw new ApiErrorException(
        HttpStatus.NOT_FOUND,
        PUBLIC_API_WEBHOOK_ERROR_CODES.endpointNotFound,
        "Webhook endpoint was not found.",
      );
    }
    return endpoint;
  }

  private async deliverEndpoint(
    storeId: string,
    endpoint: WebhookEndpoint,
    payload: PublicApiWebhookPayload,
    signingKey: string,
  ): Promise<void> {
    const deliveryId = createSelfxId();
    await this.prisma.webhookDelivery.create({
      data: {
        id: deliveryId,
        organizationId: storeId,
        webhookEndpointId: endpoint.id,
        eventId: payload.id,
        eventType: payload.type,
        attemptNumber: 1,
        status: "PENDING",
      },
    });

    const body = JSON.stringify(payload);
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const endpointSecret = deriveEndpointSecret(endpoint.id, signingKey);
    const signature = signWebhookPayload(endpointSecret, timestamp, body);

    try {
      const response = await postWebhook(endpoint.url, {
        body,
        headers: {
          "content-type": "application/json",
          "selfx-api-version": webhookApiVersion,
          "selfx-delivery-id": deliveryId,
          "selfx-event-id": payload.id,
          "selfx-event-type": payload.type,
          "selfx-signature": signature,
          "selfx-timestamp": timestamp,
        },
      });
      if (response.ok) {
        await this.prisma.webhookDelivery.update({
          where: { id: deliveryId },
          data: {
            status: "DELIVERED",
            httpStatus: response.status,
            deliveredAt: new Date(),
            nextRetryAt: null,
          },
        });
        return;
      }
      await this.markDeliveryFailed(deliveryId, {
        httpStatus: response.status,
        errorMessage: `Webhook endpoint returned HTTP ${response.status}.`,
      });
    } catch (error) {
      await this.markDeliveryFailed(deliveryId, {
        errorMessage:
          error instanceof Error ? error.message : "Webhook delivery failed.",
      });
    }
  }

  private async markDeliveryFailed(
    deliveryId: string,
    input: { httpStatus?: number; errorMessage: string },
  ): Promise<void> {
    await this.prisma.webhookDelivery.update({
      where: { id: deliveryId },
      data: {
        status: "FAILED",
        httpStatus: input.httpStatus,
        errorMessage: input.errorMessage.slice(0, 1000),
        nextRetryAt: new Date(Date.now() + 5 * 60 * 1000),
      },
    });
  }
}

function mapEndpoint(endpoint: WebhookEndpoint): PublicApiWebhookEndpointDto {
  return {
    id: endpoint.id,
    url: endpoint.url,
    status: endpoint.status === "DISABLED" ? "DISABLED" : "ACTIVE",
    subscribedEvents: cleanStoredEvents(endpoint.subscribedEvents),
    createdAt: endpoint.createdAt.toISOString(),
    updatedAt: endpoint.updatedAt.toISOString(),
  };
}

function cleanSubscribedEvents(
  value: readonly PublicApiWebhookEvent[] | undefined,
): PublicApiWebhookEvent[] {
  const events = value ?? [...publicApiWebhookEventOptions];
  const unique = [...new Set(events)];
  if (
    unique.length === 0 ||
    unique.some((event) => !publicApiWebhookEventOptions.includes(event))
  ) {
    throw new ApiErrorException(
      HttpStatus.BAD_REQUEST,
      PUBLIC_API_WEBHOOK_ERROR_CODES.eventsInvalid,
      "Webhook subscribed events are invalid.",
    );
  }
  return unique;
}

function cleanStoredEvents(value: unknown): PublicApiWebhookEvent[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((event): event is PublicApiWebhookEvent =>
    publicApiWebhookEventOptions.includes(event as PublicApiWebhookEvent),
  );
}

function endpointSubscribedTo(
  endpoint: Pick<WebhookEndpoint, "subscribedEvents">,
  eventType: PublicApiWebhookEvent,
): boolean {
  return cleanStoredEvents(endpoint.subscribedEvents).includes(eventType);
}

function eventTypeForRunStatus(
  status: PublicApiTryOnRunResponseDto["status"],
): PublicApiWebhookEvent | null {
  if (status === "COMPLETED") {
    return "try_on.completed";
  }
  if (status === "FAILED") {
    return "try_on.failed";
  }
  return null;
}

function normalizeWebhookUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throwInvalidUrl();
  }
  if (url.protocol !== "https:") {
    throwInvalidUrl();
  }
  url.hash = "";
  const normalized = url.toString();
  if (normalized.length > 2048) {
    throwInvalidUrl();
  }
  return normalized;
}

function throwInvalidUrl(): never {
  throw new ApiErrorException(
    HttpStatus.BAD_REQUEST,
    PUBLIC_API_WEBHOOK_ERROR_CODES.urlInvalid,
    "Webhook URL must be a valid HTTPS URL.",
  );
}

function assertSigningConfigured(): void {
  requireSigningKey();
}

function requireSigningKey(): string {
  const value =
    process.env.SELFX_WEBHOOK_SIGNING_KEY?.trim() ||
    process.env.JWT_ACCESS_SECRET?.trim();
  if (!value) {
    throw new ApiErrorException(
      HttpStatus.INTERNAL_SERVER_ERROR,
      PUBLIC_API_WEBHOOK_ERROR_CODES.signingNotConfigured,
      "Webhook signing is not configured.",
    );
  }
  return value;
}

function deriveEndpointSecret(
  endpointId: string,
  signingKey = requireSigningKey(),
): string {
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
