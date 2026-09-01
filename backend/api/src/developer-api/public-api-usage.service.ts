import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";

import { PrismaService } from "../database/prisma.service.js";
import { PUBLIC_API_USAGE_EVENTS } from "../usage/usage-event.service.js";
import {
  type PublicApiProviderUsageRowDto,
  type PublicApiUsageQueryDto,
  type PublicApiUsageResponseDto,
} from "./dto/public-api-usage.dto.js";
import { type PublicApiCredentialContext } from "./public-api-key-auth.service.js";
import {
  buildPublicApiUsageReferenceRollups,
  type PublicApiUsageDownloadGroup,
  type PublicApiUsageReferenceRun,
} from "./public-api-usage-rollups.js";

type PublicApiUsageRangePreset = NonNullable<PublicApiUsageQueryDto["range"]>;

type ResolvedPublicApiUsageRange = {
  preset: PublicApiUsageRangePreset;
  from: Date;
  to: Date;
};

@Injectable()
export class PublicApiUsageService {
  constructor(private readonly prisma: PrismaService) {}

  async summary(
    credential: PublicApiCredentialContext,
    input: PublicApiUsageQueryDto,
  ): Promise<PublicApiUsageResponseDto> {
    const range = resolveRange(input);
    const limit = input.limit ?? 10;
    const baseWhere = publicRunWhere(credential, range, input);

    const [
      runsCreated,
      queuedRuns,
      processingRuns,
      completedRuns,
      failedRuns,
      generatedLooks,
      downloadsCompleted,
      providerUsage,
      referenceRuns,
    ] = await Promise.all([
      this.countRuns(baseWhere),
      this.countRuns({ ...baseWhere, status: "QUEUED" }),
      this.countRuns({ ...baseWhere, status: "PROCESSING" }),
      this.countRuns({ ...baseWhere, status: "COMPLETED" }),
      this.countRuns({ ...baseWhere, status: "FAILED" }),
      this.countRuns({ ...baseWhere, resultAssetId: { not: null } }),
      this.countDownloads(credential, range),
      this.providerUsage(baseWhere, limit),
      this.referenceRuns(baseWhere),
    ]);
    const referenceDownloads = await this.referenceDownloads(
      credential,
      range,
      referenceRuns.map((run) => run.id),
    );
    const { catalogSourceUsage, productUsage } =
      buildPublicApiUsageReferenceRollups(
        referenceRuns,
        referenceDownloads,
        limit,
      );
    const filteredDownloadsCompleted = hasReferenceFilters(input)
      ? sumDownloadGroups(referenceDownloads)
      : downloadsCompleted;

    return {
      range: {
        preset: range.preset,
        from: range.from.toISOString(),
        to: range.to.toISOString(),
      },
      store: {
        id: credential.storeId,
        name: credential.storeName,
      },
      keyPrefix: credential.keyPrefix,
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
    credential: PublicApiCredentialContext,
    range: ResolvedPublicApiUsageRange,
  ): Promise<number> {
    const result = await this.prisma.usageEvent.aggregate({
      where: publicDownloadWhere(credential, range),
      _sum: { quantity: true },
    });
    return result._sum.quantity ?? 0;
  }

  private async referenceDownloads(
    credential: PublicApiCredentialContext,
    range: ResolvedPublicApiUsageRange,
    runIds: string[],
  ): Promise<PublicApiUsageDownloadGroup[]> {
    if (runIds.length === 0) {
      return [];
    }
    const rows = await this.prisma.usageEvent.groupBy({
      by: ["kioskTryOnRunId"],
      where: {
        ...publicDownloadWhere(credential, range),
        kioskTryOnRunId: { in: runIds },
      },
      _sum: { quantity: true },
    });
    return rows.map((row) => ({
      kioskTryOnRunId: row.kioskTryOnRunId,
      _sum: { quantity: row._sum.quantity ?? 0 },
    }));
  }
}

function publicRunWhere(
  credential: PublicApiCredentialContext,
  range: ResolvedPublicApiUsageRange,
  input: PublicApiUsageQueryDto,
): Prisma.KioskTryOnRunWhereInput {
  const where: Prisma.KioskTryOnRunWhereInput = {
    apiKeyId: credential.apiKeyId,
    organizationId: credential.storeId,
    createdAt: { gte: range.from, lte: range.to },
  };
  applyProductFilters(where, input);
  return where;
}

function publicDownloadWhere(
  credential: PublicApiCredentialContext,
  range: ResolvedPublicApiUsageRange,
): Prisma.UsageEventWhereInput {
  return {
    channel: "PUBLIC_API",
    apiKeyId: credential.apiKeyId,
    organizationId: credential.storeId,
    eventName: PUBLIC_API_USAGE_EVENTS.downloadCompleted,
    occurredAt: { gte: range.from, lte: range.to },
  };
}

function applyProductFilters(
  where: Prisma.KioskTryOnRunWhereInput,
  input: Pick<PublicApiUsageQueryDto, "catalogSource" | "productQuery">,
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
  input: Pick<PublicApiUsageQueryDto, "catalogSource" | "productQuery">,
): boolean {
  return Boolean(input.catalogSource || input.productQuery?.trim());
}

function sumDownloadGroups(rows: PublicApiUsageDownloadGroup[]): number {
  return rows.reduce((sum, row) => sum + (row._sum.quantity ?? 0), 0);
}

function resolveRange(
  input: PublicApiUsageQueryDto,
): ResolvedPublicApiUsageRange {
  const now = new Date();
  const preset = input.range ?? "7d";
  if (preset === "custom" && input.from && input.to) {
    return {
      preset,
      from: new Date(input.from),
      to: new Date(input.to),
    };
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
    providerModel: string;
    status: string;
    _count: { _all: number };
  }>,
): PublicApiProviderUsageRowDto[] {
  const byProvider = new Map<string, PublicApiProviderUsageRowDto>();
  for (const row of rows) {
    const key = `${row.provider}:${row.providerModel}`;
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
