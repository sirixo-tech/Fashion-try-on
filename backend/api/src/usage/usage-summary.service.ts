import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";

import { SELFX_CATALOG_SOURCES, type SelfxCatalogSource } from "@selfx/shared";

import { PrismaService } from "../database/prisma.service.js";
import {
  KIOSK_USAGE_EVENTS,
  PUBLIC_API_USAGE_EVENTS,
} from "./usage-event.service.js";
import {
  type UsageCategoryRowDto,
  type UsageChannelFilter,
  type UsageChannelRowDto,
  type UsageDailyRowDto,
  type UsageKioskRowDto,
  type UsageProductRowDto,
  type UsageProviderRowDto,
  type UsageSummaryQueryDto,
  type UsageSummaryResponseDto,
  type UsageStoreRowDto,
} from "./dto/usage-summary.dto.js";

type UsageEventFilterInput = Pick<
  UsageSummaryQueryDto,
  "range" | "from" | "to" | "storeId" | "kioskDeviceId" | "channel" | "limit"
>;

type AnalyticsRun = Awaited<
  ReturnType<UsageSummaryService["analyticsRuns"]>
>[number];

type RunNumberRow = {
  runsCreated: number;
  completedRuns: number;
  failedRuns: number;
  tryOnsGenerated: number;
  downloadsCompleted: number;
};

type NumberRow = RunNumberRow & {
  sessionsStarted: number;
};

const runStatus = {
  queued: "QUEUED",
  processing: "PROCESSING",
  completed: "COMPLETED",
  failed: "FAILED",
} as const;

const downloadEventNames = [
  KIOSK_USAGE_EVENTS.downloadCompleted,
  PUBLIC_API_USAGE_EVENTS.downloadCompleted,
] as const;

@Injectable()
export class UsageSummaryService {
  constructor(private readonly prisma: PrismaService) {}

  async summary(
    input: UsageEventFilterInput,
  ): Promise<UsageSummaryResponseDto> {
    const range = resolveRange(input);
    const limit = input.limit ?? 10;
    const baseEventWhere = usageEventWhere(input, range);
    const baseRunWhere = tryOnRunWhere(input, range);

    const [storeIds, kioskIds] = await Promise.all([
      this.storeIds(baseRunWhere, baseEventWhere),
      this.kioskIds(baseRunWhere, baseEventWhere),
    ]);

    const [
      sessionsStarted,
      sessionsCompleted,
      sessionsIdleExpired,
      generatedLooks,
      statusRows,
      runs,
      downloadRows,
      stores,
      kiosks,
      scopeStore,
    ] = await Promise.all([
      this.sumQuantity(baseEventWhere, KIOSK_USAGE_EVENTS.sessionStarted),
      this.sumQuantity(baseEventWhere, KIOSK_USAGE_EVENTS.sessionCompleted),
      this.sumQuantity(baseEventWhere, KIOSK_USAGE_EVENTS.sessionIdleExpired),
      this.prisma.kioskTryOnRun.count({
        where: { ...baseRunWhere, resultAssetId: { not: null } },
      }),
      this.prisma.kioskTryOnRun.groupBy({
        by: ["status"],
        where: baseRunWhere,
        _count: { _all: true },
      }),
      this.analyticsRuns(baseRunWhere),
      this.downloadsByRun(baseEventWhere),
      this.prisma.organization.findMany({
        where: { id: { in: storeIds } },
        select: { id: true, name: true },
      }),
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
      input.storeId
        ? this.prisma.organization.findUnique({
            where: { id: input.storeId },
            select: { id: true, name: true },
          })
        : Promise.resolve(null),
    ]);

    const downloadsByRun = new Map(
      downloadRows.flatMap((row) =>
        row.kioskTryOnRunId
          ? [[row.kioskTryOnRunId, row._sum.quantity ?? 0]]
          : [],
      ),
    );
    const statusCounts = foldRunStatusRows(statusRows);
    const storeNameById = new Map(stores.map((store) => [store.id, store.name]));
    const kioskById = new Map(kiosks.map((kiosk) => [kiosk.id, kiosk]));
    const context = buildRollupContext(
      runs,
      downloadsByRun,
      storeNameById,
      kioskById,
    );

    addStoreEventCounts(
      context.stores,
      await this.groupEventByStore(baseEventWhere),
      storeNameById,
    );
    addKioskEventCounts(
      context.kiosks,
      await this.groupEventByKiosk(baseEventWhere),
      kioskById,
    );
    addChannelEventCounts(
      context.channels,
      await this.groupEventByChannel(baseEventWhere),
    );
    addDailyEventCounts(context.daily, await this.groupEventByDay(baseEventWhere));

    return {
      range: {
        preset: range.preset,
        from: range.from.toISOString(),
        to: range.to.toISOString(),
      },
      scope: {
        mode: input.storeId ? "STORE" : "PLATFORM",
        storeId: input.storeId,
        storeName: scopeStore?.name,
      },
      totals: {
        sessionsStarted,
        sessionsCompleted,
        sessionsIdleExpired,
        runsCreated: statusCounts.runsCreated,
        queuedRuns: statusCounts.queuedRuns,
        processingRuns: statusCounts.processingRuns,
        completedRuns: statusCounts.completedRuns,
        failedRuns: statusCounts.failedRuns,
        tryOnsGenerated: generatedLooks,
        downloadsCompleted: sumMap(downloadsByRun),
        downloadRate: percent(sumMap(downloadsByRun), generatedLooks),
        successRate: percent(
          statusCounts.completedRuns,
          statusCounts.runsCreated,
        ),
      },
      providerUsage: providerUsage(runs, downloadsByRun).slice(0, limit),
      stores: [...context.stores.values()]
        .sort(byGeneratedThenRuns)
        .slice(0, limit),
      kiosks: [...context.kiosks.values()]
        .sort(byGeneratedThenRuns)
        .slice(0, limit),
      products: [...context.products.values()]
        .sort(byGeneratedThenRuns)
        .slice(0, limit),
      categories: [...context.categories.values()]
        .sort(byGeneratedThenRuns)
        .slice(0, limit),
      channels: channelRows(context.channels),
      daily: dailyRows(context.daily, range),
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

  private analyticsRuns(baseWhere: Prisma.KioskTryOnRunWhereInput) {
    return this.prisma.kioskTryOnRun.findMany({
      where: baseWhere,
      orderBy: { createdAt: "desc" },
      take: 10000,
      select: {
        id: true,
        status: true,
        apiKeyId: true,
        organizationId: true,
        storeId: true,
        kioskDeviceId: true,
        productId: true,
        resultAssetId: true,
        provider: true,
        providerModel: true,
        garmentCategory: true,
        catalogSource: true,
        externalProductId: true,
        externalVariantId: true,
        externalSku: true,
        externalProductName: true,
        createdAt: true,
        product: {
          select: {
            id: true,
            name: true,
            garmentCategory: true,
            category: { select: { name: true } },
          },
        },
      },
    });
  }

  private async downloadsByRun(baseWhere: Prisma.UsageEventWhereInput) {
    return this.prisma.usageEvent.groupBy({
      by: ["kioskTryOnRunId"],
      where: {
        ...baseWhere,
        eventName: { in: [...downloadEventNames] },
        kioskTryOnRunId: { not: null },
      },
      _sum: { quantity: true },
    });
  }

  private async storeIds(
    baseRunWhere: Prisma.KioskTryOnRunWhereInput,
    baseEventWhere: Prisma.UsageEventWhereInput,
  ): Promise<string[]> {
    const [runOrgRows, runStoreRows, eventOrgRows, eventStoreRows] =
      await Promise.all([
        this.prisma.kioskTryOnRun.groupBy({
          by: ["organizationId"],
          where: { ...baseRunWhere, organizationId: { not: null } },
        }),
        this.prisma.kioskTryOnRun.groupBy({
          by: ["storeId"],
          where: { ...baseRunWhere, storeId: { not: null } },
        }),
        this.prisma.usageEvent.groupBy({
          by: ["organizationId"],
          where: { ...baseEventWhere, organizationId: { not: null } },
        }),
        this.prisma.usageEvent.groupBy({
          by: ["storeId"],
          where: { ...baseEventWhere, storeId: { not: null } },
        }),
      ]);
    return unique([
      ...runOrgRows.map((row) => row.organizationId),
      ...runStoreRows.map((row) => row.storeId),
      ...eventOrgRows.map((row) => row.organizationId),
      ...eventStoreRows.map((row) => row.storeId),
    ]);
  }

  private async kioskIds(
    baseRunWhere: Prisma.KioskTryOnRunWhereInput,
    baseEventWhere: Prisma.UsageEventWhereInput,
  ): Promise<string[]> {
    const [runRows, eventRows] = await Promise.all([
      this.prisma.kioskTryOnRun.groupBy({
        by: ["kioskDeviceId"],
        where: { ...baseRunWhere, kioskDeviceId: { not: null } },
      }),
      this.prisma.usageEvent.groupBy({
        by: ["kioskDeviceId"],
        where: { ...baseEventWhere, kioskDeviceId: { not: null } },
      }),
    ]);
    return unique([
      ...runRows.map((row) => row.kioskDeviceId),
      ...eventRows.map((row) => row.kioskDeviceId),
    ]);
  }

  private async groupEventByStore(
    baseWhere: Prisma.UsageEventWhereInput,
  ): Promise<Map<string, number>> {
    const rows = await this.prisma.usageEvent.groupBy({
      by: ["organizationId", "storeId"],
      where: {
        ...baseWhere,
        eventName: KIOSK_USAGE_EVENTS.sessionStarted,
      },
      _sum: { quantity: true },
    });
    const counts = new Map<string, number>();
    for (const row of rows) {
      const key = row.organizationId ?? row.storeId ?? platformBucketKey;
      counts.set(key, (counts.get(key) ?? 0) + (row._sum.quantity ?? 0));
    }
    return counts;
  }

  private async groupEventByKiosk(
    baseWhere: Prisma.UsageEventWhereInput,
  ): Promise<Map<string, number>> {
    const rows = await this.prisma.usageEvent.groupBy({
      by: ["kioskDeviceId"],
      where: {
        ...baseWhere,
        eventName: KIOSK_USAGE_EVENTS.sessionStarted,
        kioskDeviceId: { not: null },
      },
      _sum: { quantity: true },
    });
    return new Map(
      rows.flatMap((row) =>
        row.kioskDeviceId ? [[row.kioskDeviceId, row._sum.quantity ?? 0]] : [],
      ),
    );
  }

  private async groupEventByChannel(
    baseWhere: Prisma.UsageEventWhereInput,
  ): Promise<Map<string, number>> {
    const rows = await this.prisma.usageEvent.groupBy({
      by: ["channel"],
      where: {
        ...baseWhere,
        eventName: KIOSK_USAGE_EVENTS.sessionStarted,
      },
      _sum: { quantity: true },
    });
    return new Map(rows.map((row) => [row.channel, row._sum.quantity ?? 0]));
  }

  private async groupEventByDay(
    baseWhere: Prisma.UsageEventWhereInput,
  ): Promise<Map<string, number>> {
    const rows = await this.prisma.usageEvent.groupBy({
      by: ["occurredAt"],
      where: {
        ...baseWhere,
        eventName: KIOSK_USAGE_EVENTS.sessionStarted,
      },
      _sum: { quantity: true },
    });
    const byDay = new Map<string, number>();
    for (const row of rows) {
      const key = dateKey(row.occurredAt);
      byDay.set(key, (byDay.get(key) ?? 0) + (row._sum.quantity ?? 0));
    }
    return byDay;
  }
}

const platformBucketKey = "__platform__";

type ResolvedUsageRange = {
  preset: "today" | "7d" | "30d" | "90d" | "custom";
  from: Date;
  to: Date;
};

function usageEventWhere(
  input: UsageEventFilterInput,
  range: ResolvedUsageRange,
): Prisma.UsageEventWhereInput {
  return {
    occurredAt: { gte: range.from, lte: range.to },
    ...(usageEventChannelFilter(input.channel) ?? {}),
    ...(input.storeId ? storeFilter(input.storeId) : {}),
    ...(input.kioskDeviceId ? { kioskDeviceId: input.kioskDeviceId } : {}),
  };
}

function tryOnRunWhere(
  input: UsageEventFilterInput,
  range: ResolvedUsageRange,
): Prisma.KioskTryOnRunWhereInput {
  return {
    createdAt: { gte: range.from, lte: range.to },
    ...(tryOnRunChannelFilter(input.channel) ?? {}),
    ...(input.storeId ? storeFilter(input.storeId) : {}),
    ...(input.kioskDeviceId ? { kioskDeviceId: input.kioskDeviceId } : {}),
  };
}

function usageEventChannelFilter(
  channel: UsageChannelFilter | undefined,
): Prisma.UsageEventWhereInput | null {
  if (!channel || channel === "ALL") {
    return null;
  }
  return { channel };
}

function tryOnRunChannelFilter(
  channel: UsageChannelFilter | undefined,
): Prisma.KioskTryOnRunWhereInput | null {
  if (!channel || channel === "ALL") {
    return null;
  }
  return channel === "PUBLIC_API"
    ? { apiKeyId: { not: null } }
    : { apiKeyId: null };
}

function storeFilter(storeId: string) {
  return { OR: [{ organizationId: storeId }, { storeId }] };
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

function foldRunStatusRows(
  rows: Array<{ status: string; _count: { _all: number } }>,
) {
  const counts = {
    runsCreated: 0,
    queuedRuns: 0,
    processingRuns: 0,
    completedRuns: 0,
    failedRuns: 0,
  };
  for (const row of rows) {
    counts.runsCreated += row._count._all;
    if (row.status === runStatus.queued) {
      counts.queuedRuns += row._count._all;
    }
    if (row.status === runStatus.processing) {
      counts.processingRuns += row._count._all;
    }
    if (row.status === runStatus.completed) {
      counts.completedRuns += row._count._all;
    }
    if (row.status === runStatus.failed) {
      counts.failedRuns += row._count._all;
    }
  }
  return counts;
}

function buildRollupContext(
  runs: AnalyticsRun[],
  downloadsByRun: Map<string, number>,
  storeNameById: Map<string, string>,
  kioskById: Map<
    string,
    {
      id: string;
      displayName: string;
      organizationId: string | null;
      storeId: string | null;
      organization: { name: string } | null;
      store: { name: string } | null;
    }
  >,
) {
  const context = {
    stores: new Map<string, UsageStoreRowDto>(),
    kiosks: new Map<string, UsageKioskRowDto>(),
    products: new Map<string, UsageProductRowDto>(),
    categories: new Map<string, UsageCategoryRowDto>(),
    channels: new Map<string, UsageChannelRowDto>(),
    daily: new Map<string, UsageDailyRowDto>(),
  };

  for (const run of runs) {
    const downloads = downloadsByRun.get(run.id) ?? 0;
    const channel = runChannel(run);
    addRunToCounts(getChannelRow(context.channels, channel), run, downloads);
    addRunToCounts(
      getStoreRow(context.stores, run, storeNameById),
      run,
      downloads,
    );
    if (run.kioskDeviceId) {
      addRunToCounts(getKioskRow(context.kiosks, run, kioskById), run, downloads);
    }
    addRunToCounts(
      getCategoryRow(context.categories, categoryName(run)),
      run,
      downloads,
    );
    const reference = productReference(run);
    if (reference) {
      addRunToCounts(getProductRow(context.products, reference), run, downloads);
    }
    addRunToCounts(
      getDailyRow(context.daily, dateKey(run.createdAt)),
      run,
      downloads,
    );
  }

  return context;
}

function providerUsage(
  runs: AnalyticsRun[],
  downloadsByRun: Map<string, number>,
): UsageProviderRowDto[] {
  const rows = new Map<string, UsageProviderRowDto>();
  for (const run of runs) {
    const key = `${run.provider}\u001f${run.providerModel}`;
    const row =
      rows.get(key) ??
      ({
        provider: run.provider || "Unknown provider",
        providerModel: run.providerModel || null,
        runsCreated: 0,
        completedRuns: 0,
        failedRuns: 0,
        tryOnsGenerated: 0,
        downloadsCompleted: 0,
      } satisfies UsageProviderRowDto);
    addRunToCounts(row, run, downloadsByRun.get(run.id) ?? 0);
    rows.set(key, row);
  }
  return [...rows.values()].sort(byGeneratedThenRuns);
}

function getStoreRow(
  rows: Map<string, UsageStoreRowDto>,
  run: AnalyticsRun,
  storeNameById: Map<string, string>,
): UsageStoreRowDto {
  const storeId = run.organizationId ?? run.storeId;
  const key = storeId ?? platformBucketKey;
  const row =
    rows.get(key) ??
    ({
      storeId,
      storeName: storeId
        ? (storeNameById.get(storeId) ?? "Unknown Store")
        : "Platform fleet",
      ...emptyCounts(),
    } satisfies UsageStoreRowDto);
  rows.set(key, row);
  return row;
}

function getKioskRow(
  rows: Map<string, UsageKioskRowDto>,
  run: AnalyticsRun,
  kioskById: Map<
    string,
    {
      id: string;
      displayName: string;
      organizationId: string | null;
      storeId: string | null;
      organization: { name: string } | null;
      store: { name: string } | null;
    }
  >,
): UsageKioskRowDto {
  const kioskId = run.kioskDeviceId!;
  const kiosk = kioskById.get(kioskId);
  const row =
    rows.get(kioskId) ??
    ({
      kioskDeviceId: kioskId,
      displayName: kiosk?.displayName ?? "Unknown kiosk",
      storeId: kiosk?.organizationId ?? kiosk?.storeId ?? null,
      storeName: kiosk?.organization?.name ?? kiosk?.store?.name ?? null,
      ...emptyCounts(),
    } satisfies UsageKioskRowDto);
  rows.set(kioskId, row);
  return row;
}

function getProductRow(
  rows: Map<string, UsageProductRowDto>,
  reference: ProductReference,
): UsageProductRowDto {
  const row =
    rows.get(reference.key) ??
    ({
      productId: reference.productId,
      name: reference.name,
      category: reference.category,
      catalogSource: reference.catalogSource,
      externalProductId: reference.externalProductId,
      externalVariantId: reference.externalVariantId,
      sku: reference.sku,
      ...emptyCounts(),
    } satisfies UsageProductRowDto);
  rows.set(reference.key, row);
  return row;
}

function getCategoryRow(
  rows: Map<string, UsageCategoryRowDto>,
  category: string,
): UsageCategoryRowDto {
  const row =
    rows.get(category) ??
    ({
      category,
      ...emptyCounts(),
    } satisfies UsageCategoryRowDto);
  rows.set(category, row);
  return row;
}

function getChannelRow(
  rows: Map<string, UsageChannelRowDto>,
  channel: UsageChannelRowDto["channel"],
): UsageChannelRowDto {
  const row =
    rows.get(channel) ??
    ({
      channel,
      ...emptyCounts(),
    } satisfies UsageChannelRowDto);
  rows.set(channel, row);
  return row;
}

function getDailyRow(
  rows: Map<string, UsageDailyRowDto>,
  date: string,
): UsageDailyRowDto {
  const row =
    rows.get(date) ??
    ({
      date,
      ...emptyCounts(),
    } satisfies UsageDailyRowDto);
  rows.set(date, row);
  return row;
}

function addRunToCounts(
  row: RunNumberRow,
  run: Pick<AnalyticsRun, "status" | "resultAssetId">,
  downloads: number,
): void {
  row.runsCreated += 1;
  if (run.status === runStatus.completed) {
    row.completedRuns += 1;
  }
  if (run.status === runStatus.failed) {
    row.failedRuns += 1;
  }
  if (run.resultAssetId) {
    row.tryOnsGenerated += 1;
  }
  row.downloadsCompleted += downloads;
}

function addStoreEventCounts(
  rows: Map<string, UsageStoreRowDto>,
  counts: Map<string, number>,
  storeNameById: Map<string, string>,
): void {
  for (const [key, sessionsStarted] of counts) {
    const storeId = key === platformBucketKey ? null : key;
    const row =
      rows.get(key) ??
      ({
        storeId,
        storeName: storeId
          ? (storeNameById.get(storeId) ?? "Unknown Store")
          : "Platform fleet",
        ...emptyCounts(),
      } satisfies UsageStoreRowDto);
    row.sessionsStarted += sessionsStarted;
    rows.set(key, row);
  }
}

function addKioskEventCounts(
  rows: Map<string, UsageKioskRowDto>,
  counts: Map<string, number>,
  kioskById: Map<
    string,
    {
      id: string;
      displayName: string;
      organizationId: string | null;
      storeId: string | null;
      organization: { name: string } | null;
      store: { name: string } | null;
    }
  >,
): void {
  for (const [key, sessionsStarted] of counts) {
    const kiosk = kioskById.get(key);
    const row =
      rows.get(key) ??
      ({
        kioskDeviceId: key,
        displayName: kiosk?.displayName ?? "Unknown kiosk",
        storeId: kiosk?.organizationId ?? kiosk?.storeId ?? null,
        storeName: kiosk?.organization?.name ?? kiosk?.store?.name ?? null,
        ...emptyCounts(),
      } satisfies UsageKioskRowDto);
    row.sessionsStarted += sessionsStarted;
    rows.set(key, row);
  }
}

function addChannelEventCounts(
  rows: Map<string, UsageChannelRowDto>,
  counts: Map<string, number>,
): void {
  for (const [key, sessionsStarted] of counts) {
    const channel = key === "PUBLIC_API" ? "PUBLIC_API" : "KIOSK";
    const row = getChannelRow(rows, channel);
    row.sessionsStarted += sessionsStarted;
  }
}

function addDailyEventCounts(
  rows: Map<string, UsageDailyRowDto>,
  counts: Map<string, number>,
): void {
  for (const [key, sessionsStarted] of counts) {
    const row = getDailyRow(rows, key);
    row.sessionsStarted += sessionsStarted;
  }
}

type ProductReference = Pick<
  UsageProductRowDto,
  | "productId"
  | "name"
  | "category"
  | "catalogSource"
  | "externalProductId"
  | "externalVariantId"
  | "sku"
> & { key: string };

function productReference(run: AnalyticsRun): ProductReference | null {
  if (run.product) {
    return {
      key: `selfx:${run.product.id}`,
      productId: run.product.id,
      name: run.product.name,
      category: run.product.category?.name ?? run.product.garmentCategory,
      catalogSource: cleanCatalogSource(run.catalogSource),
    };
  }

  const catalogSource = cleanCatalogSource(run.catalogSource);
  const name =
    run.externalProductName ??
    run.externalSku ??
    run.externalVariantId ??
    run.externalProductId;
  if (!name && !catalogSource) {
    return null;
  }
  return {
    key: [
      "external",
      catalogSource,
      run.externalProductId,
      run.externalVariantId,
      run.externalSku,
      name,
    ].join("\u001f"),
    productId: run.productId,
    name: name ?? "External product",
    category: categoryName(run),
    catalogSource,
    externalProductId: run.externalProductId ?? undefined,
    externalVariantId: run.externalVariantId ?? undefined,
    sku: run.externalSku ?? undefined,
  };
}

function categoryName(run: AnalyticsRun): string {
  return run.product?.category?.name ?? run.garmentCategory ?? "Uncategorized";
}

function runChannel(run: AnalyticsRun): UsageChannelRowDto["channel"] {
  return run.apiKeyId ? "PUBLIC_API" : "KIOSK";
}

function channelRows(rows: Map<string, UsageChannelRowDto>): UsageChannelRowDto[] {
  return (["KIOSK", "PUBLIC_API"] as const).map(
    (channel) =>
      rows.get(channel) ??
      ({
        channel,
        ...emptyCounts(),
      } satisfies UsageChannelRowDto),
  );
}

function dailyRows(
  rows: Map<string, UsageDailyRowDto>,
  range: ResolvedUsageRange,
): UsageDailyRowDto[] {
  const seeded = seedDailyRows(range);
  for (const [date, row] of rows) {
    const target = seeded.get(date) ?? row;
    Object.assign(target, row);
    seeded.set(date, target);
  }
  return [...seeded.values()].sort((left, right) =>
    left.date.localeCompare(right.date),
  );
}

function seedDailyRows(range: ResolvedUsageRange): Map<string, UsageDailyRowDto> {
  const rows = new Map<string, UsageDailyRowDto>();
  const current = new Date(range.from);
  current.setUTCHours(0, 0, 0, 0);
  const end = new Date(range.to);
  end.setUTCHours(0, 0, 0, 0);
  while (current <= end) {
    rows.set(dateKey(current), {
      date: dateKey(current),
      ...emptyCounts(),
    });
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return rows;
}

function emptyCounts(): NumberRow {
  return {
    sessionsStarted: 0,
    runsCreated: 0,
    completedRuns: 0,
    failedRuns: 0,
    tryOnsGenerated: 0,
    downloadsCompleted: 0,
  };
}

function byGeneratedThenRuns<
  T extends Pick<RunNumberRow, "tryOnsGenerated" | "runsCreated">,
>(
  left: T,
  right: T,
): number {
  const byGenerated = right.tryOnsGenerated - left.tryOnsGenerated;
  return byGenerated !== 0 ? byGenerated : right.runsCreated - left.runsCreated;
}

function sumMap(values: Map<string, number>): number {
  return [...values.values()].reduce((sum, value) => sum + value, 0);
}

function percent(part: number, total: number): number {
  return total > 0 ? Math.round((part / total) * 1000) / 10 : 0;
}

function dateKey(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function cleanCatalogSource(value: string | null): SelfxCatalogSource | null {
  if (!value) {
    return null;
  }
  return SELFX_CATALOG_SOURCES.includes(value as SelfxCatalogSource)
    ? (value as SelfxCatalogSource)
    : null;
}

function unique(values: Array<string | null>): string[] {
  return [...new Set(values.filter(isString))];
}

function isString(value: string | null): value is string {
  return typeof value === "string" && value.length > 0;
}
