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
    const baseWhere = publicRunWhere(credential, range);

    const [
      runsCreated,
      queuedRuns,
      processingRuns,
      completedRuns,
      failedRuns,
      generatedLooks,
      downloadsCompleted,
      providerUsage,
    ] = await Promise.all([
      this.countRuns(baseWhere),
      this.countRuns({ ...baseWhere, status: "QUEUED" }),
      this.countRuns({ ...baseWhere, status: "PROCESSING" }),
      this.countRuns({ ...baseWhere, status: "COMPLETED" }),
      this.countRuns({ ...baseWhere, status: "FAILED" }),
      this.countRuns({ ...baseWhere, resultAssetId: { not: null } }),
      this.countDownloads(credential, range),
      this.providerUsage(baseWhere, limit),
    ]);

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
        downloadsCompleted,
      },
      providerUsage,
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

  private async countDownloads(
    credential: PublicApiCredentialContext,
    range: ResolvedPublicApiUsageRange,
  ): Promise<number> {
    const result = await this.prisma.usageEvent.aggregate({
      where: {
        channel: "PUBLIC_API",
        apiKeyId: credential.apiKeyId,
        organizationId: credential.storeId,
        eventName: PUBLIC_API_USAGE_EVENTS.downloadCompleted,
        occurredAt: { gte: range.from, lte: range.to },
      },
      _sum: { quantity: true },
    });
    return result._sum.quantity ?? 0;
  }
}

function publicRunWhere(
  credential: PublicApiCredentialContext,
  range: ResolvedPublicApiUsageRange,
): Prisma.KioskTryOnRunWhereInput {
  return {
    apiKeyId: credential.apiKeyId,
    organizationId: credential.storeId,
    createdAt: { gte: range.from, lte: range.to },
  };
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
