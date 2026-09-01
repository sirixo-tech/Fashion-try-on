import { HttpStatus, Injectable } from "@nestjs/common";
import {
  Prisma,
  type WebhookDelivery,
  type WebhookEndpoint,
} from "@prisma/client";

import { PrismaService } from "../database/prisma.service.js";
import { ApiErrorException } from "../common/api-error.exception.js";
import { PUBLIC_API_USAGE_EVENTS } from "../usage/usage-event.service.js";
import {
  type AdminDeveloperApiUsageQueryDto,
  type AdminDeveloperApiUsageResponseDto,
  type AdminDeveloperWebhookDeliveryDto,
  type AdminDeveloperWebhookDeliveryListQueryDto,
  type AdminDeveloperWebhookDeliveryListResponseDto,
  type AdminDeveloperWebhookEndpointDto,
  type AdminDeveloperWebhookEndpointListResponseDto,
} from "./dto/developer-api-console.dto.js";
import {
  type PublicApiProviderUsageRowDto,
  type PublicApiUsageQueryDto,
} from "./dto/public-api-usage.dto.js";
import {
  type PublicApiWebhookEvent,
  publicApiWebhookEventOptions,
} from "./dto/public-api-webhook.dto.js";
import { type PublicApiCredentialContext } from "./public-api-key-auth.service.js";
import {
  buildPublicApiUsageReferenceRollups,
  type PublicApiUsageDownloadGroup,
  type PublicApiUsageReferenceRun,
} from "./public-api-usage-rollups.js";
import { PUBLIC_API_WEBHOOK_ERROR_CODES } from "./public-api-webhook.service.js";

type UsageRangePreset = NonNullable<PublicApiUsageQueryDto["range"]>;

type ResolvedUsageRange = {
  preset: UsageRangePreset;
  from: Date;
  to: Date;
};

type EndpointWithRelations = WebhookEndpoint & {
  organization: { id: string; name: string };
  deliveries: WebhookDelivery[];
};

type DeliveryWithEndpoint = WebhookDelivery & {
  webhookEndpoint: Pick<WebhookEndpoint, "id" | "url">;
};

@Injectable()
export class DeveloperApiConsoleService {
  constructor(private readonly prisma: PrismaService) {}

  async usageSummary(
    query: AdminDeveloperApiUsageQueryDto,
  ): Promise<AdminDeveloperApiUsageResponseDto> {
    const range = resolveRange(query);
    const limit = query.limit ?? 10;
    const baseWhere: Prisma.KioskTryOnRunWhereInput = {
      apiKeyId: query.apiKeyId ? query.apiKeyId : { not: null },
      createdAt: { gte: range.from, lte: range.to },
    };
    if (query.storeId) {
      baseWhere.organizationId = query.storeId;
    }
    applyProductFilters(baseWhere, query);

    const [
      runsCreated,
      queuedRuns,
      processingRuns,
      completedRuns,
      failedRuns,
      generatedLooks,
      downloadsCompleted,
      providerUsage,
      scope,
      referenceRuns,
    ] = await Promise.all([
      this.countRuns(baseWhere),
      this.countRuns({ ...baseWhere, status: "QUEUED" }),
      this.countRuns({ ...baseWhere, status: "PROCESSING" }),
      this.countRuns({ ...baseWhere, status: "COMPLETED" }),
      this.countRuns({ ...baseWhere, status: "FAILED" }),
      this.countRuns({ ...baseWhere, resultAssetId: { not: null } }),
      this.countDownloads(query, range),
      this.providerUsage(baseWhere, limit),
      this.usageScope(query),
      this.referenceRuns(baseWhere),
    ]);
    const referenceDownloads = await this.referenceDownloads(
      query,
      range,
      referenceRuns.map((run) => run.id),
    );
    const { catalogSourceUsage, productUsage } =
      buildPublicApiUsageReferenceRollups(
        referenceRuns,
        referenceDownloads,
        limit,
      );
    const filteredDownloadsCompleted = hasReferenceFilters(query)
      ? sumDownloadGroups(referenceDownloads)
      : downloadsCompleted;

    return {
      range: {
        preset: range.preset,
        from: range.from.toISOString(),
        to: range.to.toISOString(),
      },
      scope,
      totals: {
        runsCreated,
        queuedRuns,
        processingRuns,
        completedRuns,
        failedRuns,
        generatedLooks,
        downloadsCompleted: filteredDownloadsCompleted,
      },
      providerUsage,
      catalogSourceUsage,
      productUsage,
    };
  }

  async listWebhookEndpoints(query: {
    storeId?: string;
  }): Promise<AdminDeveloperWebhookEndpointListResponseDto> {
    const endpoints = await this.prisma.webhookEndpoint.findMany({
      where: query.storeId ? { organizationId: query.storeId } : {},
      include: {
        organization: { select: { id: true, name: true } },
        deliveries: {
          orderBy: [{ createdAt: "desc" }],
          take: 1,
        },
      },
      orderBy: [{ createdAt: "desc" }],
    });
    return { data: endpoints.map(mapEndpoint) };
  }

  async webhookEndpoint(
    endpointId: string,
  ): Promise<AdminDeveloperWebhookEndpointDto> {
    const endpoint = await this.prisma.webhookEndpoint.findUnique({
      where: { id: endpointId },
      include: {
        organization: { select: { id: true, name: true } },
        deliveries: {
          orderBy: [{ createdAt: "desc" }],
          take: 1,
        },
      },
    });
    if (!endpoint) {
      throw new ApiErrorException(
        HttpStatus.NOT_FOUND,
        PUBLIC_API_WEBHOOK_ERROR_CODES.endpointNotFound,
        "Webhook endpoint was not found.",
      );
    }
    return mapEndpoint(endpoint);
  }

  async storeIdForWebhookEndpoint(endpointId: string): Promise<string> {
    const endpoint = await this.prisma.webhookEndpoint.findUnique({
      where: { id: endpointId },
      select: { organizationId: true },
    });
    if (!endpoint) {
      throw new ApiErrorException(
        HttpStatus.NOT_FOUND,
        PUBLIC_API_WEBHOOK_ERROR_CODES.endpointNotFound,
        "Webhook endpoint was not found.",
      );
    }
    return endpoint.organizationId;
  }

  async credentialForStore(
    storeId: string,
  ): Promise<PublicApiCredentialContext> {
    const store = await this.prisma.organization.findUnique({
      where: { id: storeId },
      select: { id: true, name: true },
    });
    if (!store) {
      throw new ApiErrorException(
        HttpStatus.NOT_FOUND,
        "DEVELOPER_API_STORE_NOT_FOUND",
        "Store was not found.",
      );
    }
    return {
      apiKeyId: "admin-console",
      keyPrefix: "admin-console",
      storeId: store.id,
      storeName: store.name,
      environment: "LIVE",
      scopes: ["webhooks:manage"],
    };
  }

  async listWebhookDeliveries(
    query: AdminDeveloperWebhookDeliveryListQueryDto,
  ): Promise<AdminDeveloperWebhookDeliveryListResponseDto> {
    const where: Prisma.WebhookDeliveryWhereInput = {};
    if (query.storeId) {
      where.organizationId = query.storeId;
    }
    if (query.endpointId) {
      where.webhookEndpointId = query.endpointId;
    }
    const deliveries = await this.prisma.webhookDelivery.findMany({
      where,
      include: {
        webhookEndpoint: { select: { id: true, url: true } },
      },
      orderBy: [{ createdAt: "desc" }],
      take: query.limit ?? 20,
    });
    return { data: deliveries.map(mapDelivery) };
  }

  private async countRuns(
    where: Prisma.KioskTryOnRunWhereInput,
  ): Promise<number> {
    return this.prisma.kioskTryOnRun.count({ where });
  }

  private async providerUsage(
    baseWhere: Prisma.KioskTryOnRunWhereInput,
    limit: number,
  ): Promise<PublicApiProviderUsageRowDto[]> {
    const rows = await this.prisma.kioskTryOnRun.groupBy({
      by: ["provider", "providerModel", "status"],
      where: baseWhere,
      _count: { _all: true },
    });
    return foldProviderUsage(rows).slice(0, limit);
  }

  private async referenceRuns(
    baseWhere: Prisma.KioskTryOnRunWhereInput,
  ): Promise<PublicApiUsageReferenceRun[]> {
    return this.prisma.kioskTryOnRun.findMany({
      where: baseWhere,
      select: {
        id: true,
        productId: true,
        status: true,
        resultAssetId: true,
        catalogSource: true,
        externalProductId: true,
        externalVariantId: true,
        externalSku: true,
        externalProductName: true,
        externalProductPrice: true,
        externalCurrency: true,
      },
      orderBy: [{ createdAt: "desc" }],
    });
  }

  private async countDownloads(
    query: AdminDeveloperApiUsageQueryDto,
    range: ResolvedUsageRange,
  ): Promise<number> {
    const where: Prisma.UsageEventWhereInput = {
      channel: "PUBLIC_API",
      eventName: PUBLIC_API_USAGE_EVENTS.downloadCompleted,
      occurredAt: { gte: range.from, lte: range.to },
    };
    if (query.storeId) {
      where.organizationId = query.storeId;
    }
    if (query.apiKeyId) {
      where.apiKeyId = query.apiKeyId;
    }
    const result = await this.prisma.usageEvent.aggregate({
      where,
      _sum: { quantity: true },
    });
    return result._sum.quantity ?? 0;
  }

  private async referenceDownloads(
    query: AdminDeveloperApiUsageQueryDto,
    range: ResolvedUsageRange,
    runIds: string[],
  ): Promise<PublicApiUsageDownloadGroup[]> {
    if (runIds.length === 0) {
      return [];
    }
    const where: Prisma.UsageEventWhereInput = {
      channel: "PUBLIC_API",
      eventName: PUBLIC_API_USAGE_EVENTS.downloadCompleted,
      occurredAt: { gte: range.from, lte: range.to },
      kioskTryOnRunId: { in: runIds },
    };
    if (query.storeId) {
      where.organizationId = query.storeId;
    }
    if (query.apiKeyId) {
      where.apiKeyId = query.apiKeyId;
    }
    const rows = await this.prisma.usageEvent.groupBy({
      by: ["kioskTryOnRunId"],
      where,
      _sum: { quantity: true },
    });
    return rows.map((row) => ({
      kioskTryOnRunId: row.kioskTryOnRunId,
      _sum: { quantity: row._sum.quantity ?? 0 },
    }));
  }

  private async usageScope(query: AdminDeveloperApiUsageQueryDto) {
    const [store, apiKey] = await Promise.all([
      query.storeId
        ? this.prisma.organization.findUnique({
            where: { id: query.storeId },
            select: { id: true, name: true },
          })
        : null,
      query.apiKeyId
        ? this.prisma.apiKey.findUnique({
            where: { id: query.apiKeyId },
            select: { id: true, keyPrefix: true },
          })
        : null,
    ]);
    return {
      storeId: store?.id ?? query.storeId ?? null,
      storeName: store?.name ?? null,
      apiKeyId: apiKey?.id ?? query.apiKeyId ?? null,
      keyPrefix: apiKey?.keyPrefix ?? null,
    };
  }
}

function applyProductFilters(
  where: Prisma.KioskTryOnRunWhereInput,
  input: Pick<AdminDeveloperApiUsageQueryDto, "catalogSource" | "productQuery">,
): void {
  if (input.catalogSource) {
    where.catalogSource = input.catalogSource;
  }
  const productQuery = input.productQuery?.trim();
  if (productQuery) {
    where.OR = [
      { externalProductId: { contains: productQuery, mode: "insensitive" } },
      { externalVariantId: { contains: productQuery, mode: "insensitive" } },
      { externalSku: { contains: productQuery, mode: "insensitive" } },
      { externalProductName: { contains: productQuery, mode: "insensitive" } },
    ];
  }
}

function hasReferenceFilters(
  input: Pick<AdminDeveloperApiUsageQueryDto, "catalogSource" | "productQuery">,
): boolean {
  return Boolean(input.catalogSource || input.productQuery?.trim());
}

function sumDownloadGroups(rows: PublicApiUsageDownloadGroup[]): number {
  return rows.reduce((sum, row) => sum + (row._sum.quantity ?? 0), 0);
}

function mapEndpoint(
  endpoint: EndpointWithRelations,
): AdminDeveloperWebhookEndpointDto {
  return {
    id: endpoint.id,
    storeId: endpoint.organization.id,
    storeName: endpoint.organization.name,
    url: endpoint.url,
    status: endpoint.status === "DISABLED" ? "DISABLED" : "ACTIVE",
    subscribedEvents: cleanStoredEvents(endpoint.subscribedEvents),
    latestDelivery: endpoint.deliveries[0]
      ? mapDelivery({
          ...endpoint.deliveries[0],
          webhookEndpoint: { id: endpoint.id, url: endpoint.url },
        })
      : null,
    createdAt: endpoint.createdAt.toISOString(),
    updatedAt: endpoint.updatedAt.toISOString(),
  };
}

function mapDelivery(
  delivery: DeliveryWithEndpoint,
): AdminDeveloperWebhookDeliveryDto {
  return {
    id: delivery.id,
    webhookEndpointId: delivery.webhookEndpointId,
    endpointUrl: delivery.webhookEndpoint.url,
    eventId: delivery.eventId,
    eventType: delivery.eventType,
    attemptNumber: delivery.attemptNumber,
    status: delivery.status,
    httpStatus: delivery.httpStatus,
    errorMessage: delivery.errorMessage,
    nextRetryAt: delivery.nextRetryAt?.toISOString() ?? null,
    deliveredAt: delivery.deliveredAt?.toISOString() ?? null,
    createdAt: delivery.createdAt.toISOString(),
  };
}

function cleanStoredEvents(value: unknown): PublicApiWebhookEvent[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((event): event is PublicApiWebhookEvent =>
    publicApiWebhookEventOptions.includes(event as PublicApiWebhookEvent),
  );
}

function resolveRange(
  query: AdminDeveloperApiUsageQueryDto,
): ResolvedUsageRange {
  const now = new Date();
  const preset = query.range ?? "7d";
  if (preset === "custom" && query.from && query.to) {
    return { preset, from: new Date(query.from), to: new Date(query.to) };
  }
  if (preset === "today") {
    const from = new Date(now);
    from.setUTCHours(0, 0, 0, 0);
    return { preset, from, to: now };
  }
  const days = preset === "90d" ? 90 : preset === "30d" ? 30 : 7;
  return {
    preset: preset === "custom" ? "7d" : preset,
    from: new Date(now.getTime() - days * 24 * 60 * 60 * 1000),
    to: now,
  };
}

function foldProviderUsage(
  rows: Array<{
    provider: string;
    providerModel: string | null;
    status: string;
    _count: { _all: number };
  }>,
): PublicApiProviderUsageRowDto[] {
  const byProvider = new Map<string, PublicApiProviderUsageRowDto>();
  for (const row of rows) {
    const key = `${row.provider}:${row.providerModel ?? ""}`;
    const existing =
      byProvider.get(key) ??
      ({
        provider: row.provider,
        providerModel: row.providerModel,
        runsCreated: 0,
        completedRuns: 0,
        failedRuns: 0,
      } satisfies PublicApiProviderUsageRowDto);
    existing.runsCreated += row._count._all;
    if (row.status === "COMPLETED") {
      existing.completedRuns += row._count._all;
    }
    if (row.status === "FAILED") {
      existing.failedRuns += row._count._all;
    }
    byProvider.set(key, existing);
  }
  return [...byProvider.values()].sort(
    (left, right) => right.runsCreated - left.runsCreated,
  );
}
