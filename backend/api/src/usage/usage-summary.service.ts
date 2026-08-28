import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";

import { PrismaService } from "../database/prisma.service.js";
import { KIOSK_USAGE_EVENTS } from "./usage-event.service.js";
import {
  type UsageKioskRowDto,
  type UsageProductRowDto,
  type UsageProviderRowDto,
  type UsageSummaryQueryDto,
  type UsageSummaryResponseDto,
  type UsageStoreRowDto,
} from "./dto/usage-summary.dto.js";

type UsageEventFilterInput = Pick<
  UsageSummaryQueryDto,
  "range" | "from" | "to" | "storeId" | "kioskDeviceId" | "limit"
>;

@Injectable()
export class UsageSummaryService {
  constructor(private readonly prisma: PrismaService) {}

  async summary(
    input: UsageEventFilterInput,
  ): Promise<UsageSummaryResponseDto> {
    const range = resolveRange(input);
    const limit = input.limit ?? 10;
    const baseWhere = usageWhere(input, range);

    const [
      sessionsStarted,
      sessionsCompleted,
      sessionsIdleExpired,
      tryOnsGenerated,
      downloadsCompleted,
      providerUsage,
      stores,
      kiosks,
      products,
    ] = await Promise.all([
      this.sumQuantity(baseWhere, KIOSK_USAGE_EVENTS.sessionStarted),
      this.sumQuantity(baseWhere, KIOSK_USAGE_EVENTS.sessionCompleted),
      this.sumQuantity(baseWhere, KIOSK_USAGE_EVENTS.sessionIdleExpired),
      this.sumQuantity(baseWhere, KIOSK_USAGE_EVENTS.tryOnGenerated),
      this.sumQuantity(baseWhere, KIOSK_USAGE_EVENTS.downloadCompleted),
      this.providerUsage(baseWhere, limit),
      this.storeUsage(baseWhere, limit),
      this.kioskUsage(baseWhere, limit),
      this.productUsage(baseWhere, limit),
    ]);

    return {
      range: {
        preset: range.preset,
        from: range.from.toISOString(),
        to: range.to.toISOString(),
      },
      totals: {
        sessionsStarted,
        sessionsCompleted,
        sessionsIdleExpired,
        tryOnsGenerated,
        downloadsCompleted,
        downloadRate:
          tryOnsGenerated > 0
            ? Math.round((downloadsCompleted / tryOnsGenerated) * 1000) / 10
            : 0,
      },
      providerUsage,
      stores,
      kiosks,
      products,
    };
  }

  private async sumQuantity(
    baseWhere: Prisma.UsageEventWhereInput,
    eventName: string,
  ): Promise<number> {
    const result = await this.prisma.usageEvent.aggregate({
      where: { ...baseWhere, eventName },
      _sum: { quantity: true },
    });
    return result._sum.quantity ?? 0;
  }

  private async providerUsage(
    baseWhere: Prisma.UsageEventWhereInput,
    limit: number,
  ): Promise<UsageProviderRowDto[]> {
    const rows = await this.prisma.usageEvent.groupBy({
      by: ["provider", "providerModel"],
      where: {
        ...baseWhere,
        eventName: KIOSK_USAGE_EVENTS.tryOnGenerated,
        provider: { not: null },
      },
      _sum: { quantity: true },
      orderBy: { _sum: { quantity: "desc" } },
      take: limit,
    });
    return rows.map((row) => ({
      provider: row.provider ?? "Unknown provider",
      providerModel: row.providerModel,
      tryOnsGenerated: row._sum.quantity ?? 0,
    }));
  }

  private async storeUsage(
    baseWhere: Prisma.UsageEventWhereInput,
    limit: number,
  ): Promise<UsageStoreRowDto[]> {
    const generated = await this.prisma.usageEvent.groupBy({
      by: ["organizationId"],
      where: {
        ...baseWhere,
        eventName: KIOSK_USAGE_EVENTS.tryOnGenerated,
      },
      _sum: { quantity: true },
      orderBy: { _sum: { quantity: "desc" } },
      take: limit,
    });
    const storeIds = generated
      .map((row) => row.organizationId)
      .filter(isString);
    const [sessionCounts, downloadCounts, stores] = await Promise.all([
      this.groupCountByOrganization(
        baseWhere,
        KIOSK_USAGE_EVENTS.sessionStarted,
        storeIds,
      ),
      this.groupCountByOrganization(
        baseWhere,
        KIOSK_USAGE_EVENTS.downloadCompleted,
        storeIds,
      ),
      this.prisma.organization.findMany({
        where: { id: { in: storeIds } },
        select: { id: true, name: true },
      }),
    ]);
    const nameById = new Map(stores.map((store) => [store.id, store.name]));
    return generated.map((row): UsageStoreRowDto => {
      const storeId = row.organizationId;
      return {
        storeId,
        storeName: storeId
          ? (nameById.get(storeId) ?? "Unknown Store")
          : "Platform fleet",
        sessionsStarted: storeId
          ? (sessionCounts.get(storeId) ?? 0)
          : (sessionCounts.get(platformBucketKey) ?? 0),
        tryOnsGenerated: row._sum.quantity ?? 0,
        downloadsCompleted: storeId
          ? (downloadCounts.get(storeId) ?? 0)
          : (downloadCounts.get(platformBucketKey) ?? 0),
      };
    });
  }

  private async kioskUsage(
    baseWhere: Prisma.UsageEventWhereInput,
    limit: number,
  ): Promise<UsageKioskRowDto[]> {
    const generated = await this.prisma.usageEvent.groupBy({
      by: ["kioskDeviceId"],
      where: {
        ...baseWhere,
        eventName: KIOSK_USAGE_EVENTS.tryOnGenerated,
        kioskDeviceId: { not: null },
      },
      _sum: { quantity: true },
      orderBy: { _sum: { quantity: "desc" } },
      take: limit,
    });
    const kioskIds = generated.map((row) => row.kioskDeviceId).filter(isString);
    const [sessionCounts, downloadCounts, kiosks] = await Promise.all([
      this.groupCountByKiosk(
        baseWhere,
        KIOSK_USAGE_EVENTS.sessionStarted,
        kioskIds,
      ),
      this.groupCountByKiosk(
        baseWhere,
        KIOSK_USAGE_EVENTS.downloadCompleted,
        kioskIds,
      ),
      this.prisma.kioskDevice.findMany({
        where: { id: { in: kioskIds } },
        select: {
          id: true,
          displayName: true,
          organizationId: true,
          storeId: true,
          organization: { select: { name: true } },
          store: { select: { name: true } },
        },
      }),
    ]);
    const kioskById = new Map(kiosks.map((kiosk) => [kiosk.id, kiosk]));
    return generated.flatMap((row): UsageKioskRowDto[] => {
      if (!row.kioskDeviceId) {
        return [];
      }
      const kiosk = kioskById.get(row.kioskDeviceId);
      return [
        {
          kioskDeviceId: row.kioskDeviceId,
          displayName: kiosk?.displayName ?? "Unknown kiosk",
          storeId: kiosk?.organizationId ?? kiosk?.storeId ?? null,
          storeName: kiosk?.organization?.name ?? kiosk?.store?.name ?? null,
          sessionsStarted: sessionCounts.get(row.kioskDeviceId) ?? 0,
          tryOnsGenerated: row._sum.quantity ?? 0,
          downloadsCompleted: downloadCounts.get(row.kioskDeviceId) ?? 0,
        },
      ];
    });
  }

  private async productUsage(
    baseWhere: Prisma.UsageEventWhereInput,
    limit: number,
  ): Promise<UsageProductRowDto[]> {
    const generated = await this.prisma.usageEvent.groupBy({
      by: ["productId"],
      where: {
        ...baseWhere,
        eventName: KIOSK_USAGE_EVENTS.tryOnGenerated,
        productId: { not: null },
      },
      _sum: { quantity: true },
      orderBy: { _sum: { quantity: "desc" } },
      take: limit,
    });
    const productIds = generated.map((row) => row.productId).filter(isString);
    const [downloadCounts, products] = await Promise.all([
      this.groupCountByProduct(
        baseWhere,
        KIOSK_USAGE_EVENTS.downloadCompleted,
        productIds,
      ),
      this.prisma.product.findMany({
        where: { id: { in: productIds } },
        select: { id: true, name: true },
      }),
    ]);
    const nameById = new Map(
      products.map((product) => [product.id, product.name]),
    );
    return generated.flatMap((row): UsageProductRowDto[] => {
      if (!row.productId) {
        return [];
      }
      return [
        {
          productId: row.productId,
          name: nameById.get(row.productId) ?? "Unknown product",
          tryOnsGenerated: row._sum.quantity ?? 0,
          downloadsCompleted: downloadCounts.get(row.productId) ?? 0,
        },
      ];
    });
  }

  private async groupCountByOrganization(
    baseWhere: Prisma.UsageEventWhereInput,
    eventName: string,
    organizationIds: string[],
  ): Promise<Map<string, number>> {
    const rows = await this.prisma.usageEvent.groupBy({
      by: ["organizationId"],
      where: {
        ...baseWhere,
        eventName,
        ...(organizationIds.length > 0
          ? {
              OR: [
                { organizationId: { in: organizationIds } },
                { organizationId: null },
              ],
            }
          : {}),
      },
      _sum: { quantity: true },
    });
    return new Map(
      rows.map((row) => [
        row.organizationId ?? platformBucketKey,
        row._sum.quantity ?? 0,
      ]),
    );
  }

  private async groupCountByKiosk(
    baseWhere: Prisma.UsageEventWhereInput,
    eventName: string,
    kioskDeviceIds: string[],
  ): Promise<Map<string, number>> {
    if (kioskDeviceIds.length === 0) {
      return new Map();
    }
    const rows = await this.prisma.usageEvent.groupBy({
      by: ["kioskDeviceId"],
      where: {
        ...baseWhere,
        eventName,
        kioskDeviceId: { in: kioskDeviceIds },
      },
      _sum: { quantity: true },
    });
    return new Map(
      rows.flatMap((row) =>
        row.kioskDeviceId ? [[row.kioskDeviceId, row._sum.quantity ?? 0]] : [],
      ),
    );
  }

  private async groupCountByProduct(
    baseWhere: Prisma.UsageEventWhereInput,
    eventName: string,
    productIds: string[],
  ): Promise<Map<string, number>> {
    if (productIds.length === 0) {
      return new Map();
    }
    const rows = await this.prisma.usageEvent.groupBy({
      by: ["productId"],
      where: {
        ...baseWhere,
        eventName,
        productId: { in: productIds },
      },
      _sum: { quantity: true },
    });
    return new Map(
      rows.flatMap((row) =>
        row.productId ? [[row.productId, row._sum.quantity ?? 0]] : [],
      ),
    );
  }
}

const platformBucketKey = "__platform__";

type ResolvedUsageRange = {
  preset: "today" | "7d" | "30d" | "90d" | "custom";
  from: Date;
  to: Date;
};

function usageWhere(
  input: UsageEventFilterInput,
  range: ResolvedUsageRange,
): Prisma.UsageEventWhereInput {
  return {
    channel: "KIOSK",
    occurredAt: { gte: range.from, lte: range.to },
    ...(input.storeId
      ? {
          OR: [{ organizationId: input.storeId }, { storeId: input.storeId }],
        }
      : {}),
    ...(input.kioskDeviceId ? { kioskDeviceId: input.kioskDeviceId } : {}),
  };
}

function resolveRange(input: UsageEventFilterInput): ResolvedUsageRange {
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

function isString(value: string | null): value is string {
  return typeof value === "string" && value.length > 0;
}
