import { SELFX_CATALOG_SOURCES, type SelfxCatalogSource } from "@selfx/shared";

import {
  type PublicApiCatalogSourceUsageRowDto,
  type PublicApiProductUsageRowDto,
} from "./dto/public-api-usage.dto.js";

type DecimalLike = { toString(): string } | string | number;

export interface PublicApiUsageReferenceRun {
  id: string;
  productId: string | null;
  status: string;
  resultAssetId: string | null;
  catalogSource: string | null;
  externalProductId: string | null;
  externalVariantId: string | null;
  externalSku: string | null;
  externalProductName: string | null;
  externalProductPrice: DecimalLike | null;
  externalCurrency: string | null;
}

export interface PublicApiUsageDownloadGroup {
  kioskTryOnRunId: string | null;
  _sum: { quantity: number | null };
}

export function buildPublicApiUsageReferenceRollups(
  runs: PublicApiUsageReferenceRun[],
  downloads: PublicApiUsageDownloadGroup[],
  limit: number,
): {
  catalogSourceUsage: PublicApiCatalogSourceUsageRowDto[];
  productUsage: PublicApiProductUsageRowDto[];
} {
  const downloadsByRun = new Map<string, number>();
  for (const row of downloads) {
    if (row.kioskTryOnRunId) {
      downloadsByRun.set(row.kioskTryOnRunId, row._sum.quantity ?? 0);
    }
  }

  return {
    catalogSourceUsage: foldCatalogSourceUsage(runs, downloadsByRun),
    productUsage: foldProductUsage(runs, downloadsByRun).slice(0, limit),
  };
}

function foldCatalogSourceUsage(
  runs: PublicApiUsageReferenceRun[],
  downloadsByRun: Map<string, number>,
): PublicApiCatalogSourceUsageRowDto[] {
  const rows = new Map<string, PublicApiCatalogSourceUsageRowDto>();
  for (const run of runs) {
    const catalogSource = cleanCatalogSource(run.catalogSource);
    const key = catalogSource ?? "UNSPECIFIED";
    const row =
      rows.get(key) ??
      ({
        catalogSource,
        runsCreated: 0,
        completedRuns: 0,
        failedRuns: 0,
        generatedLooks: 0,
        downloadsCompleted: 0,
      } satisfies PublicApiCatalogSourceUsageRowDto);
    addRun(row, run, downloadsByRun);
    rows.set(key, row);
  }
  return [...rows.values()].sort(
    (left, right) => right.runsCreated - left.runsCreated,
  );
}

function foldProductUsage(
  runs: PublicApiUsageReferenceRun[],
  downloadsByRun: Map<string, number>,
): PublicApiProductUsageRowDto[] {
  const rows = new Map<string, PublicApiProductUsageRowDto>();
  for (const run of runs) {
    const reference = productReference(run);
    if (!reference) {
      continue;
    }
    const key = [
      reference.selfxProductId,
      reference.catalogSource,
      reference.externalProductId,
      reference.externalVariantId,
      reference.sku,
      reference.productName,
      reference.price,
      reference.currency,
    ]
      .map((value) => value ?? "")
      .join("\u001f");
    const row =
      rows.get(key) ??
      ({
        ...reference,
        runsCreated: 0,
        completedRuns: 0,
        failedRuns: 0,
        generatedLooks: 0,
        downloadsCompleted: 0,
      } satisfies PublicApiProductUsageRowDto);
    addRun(row, run, downloadsByRun);
    rows.set(key, row);
  }
  return [...rows.values()].sort((left, right) => {
    const byRuns = right.runsCreated - left.runsCreated;
    if (byRuns !== 0) {
      return byRuns;
    }
    const byDownloads = right.downloadsCompleted - left.downloadsCompleted;
    if (byDownloads !== 0) {
      return byDownloads;
    }
    return displayProductName(left).localeCompare(displayProductName(right));
  });
}

function addRun(
  row: {
    runsCreated: number;
    completedRuns: number;
    failedRuns: number;
    generatedLooks: number;
    downloadsCompleted: number;
  },
  run: PublicApiUsageReferenceRun,
  downloadsByRun: Map<string, number>,
): void {
  row.runsCreated += 1;
  if (run.status === "COMPLETED") {
    row.completedRuns += 1;
  }
  if (run.status === "FAILED") {
    row.failedRuns += 1;
  }
  if (run.resultAssetId) {
    row.generatedLooks += 1;
  }
  row.downloadsCompleted += downloadsByRun.get(run.id) ?? 0;
}

function productReference(
  run: PublicApiUsageReferenceRun,
): Omit<
  PublicApiProductUsageRowDto,
  | "runsCreated"
  | "completedRuns"
  | "failedRuns"
  | "generatedLooks"
  | "downloadsCompleted"
> | null {
  const catalogSource = cleanCatalogSource(run.catalogSource);
  const reference = {
    selfxProductId: run.productId ?? undefined,
    catalogSource: catalogSource ?? undefined,
    externalProductId: run.externalProductId ?? undefined,
    externalVariantId: run.externalVariantId ?? undefined,
    sku: run.externalSku ?? undefined,
    productName: run.externalProductName ?? undefined,
    price: run.externalProductPrice?.toString() ?? undefined,
    currency: run.externalCurrency ?? undefined,
  };
  return Object.values(reference).some((value) => value !== undefined)
    ? reference
    : null;
}

function cleanCatalogSource(value: string | null): SelfxCatalogSource | null {
  if (!value) {
    return null;
  }
  return SELFX_CATALOG_SOURCES.includes(value as SelfxCatalogSource)
    ? (value as SelfxCatalogSource)
    : null;
}

function displayProductName(row: PublicApiProductUsageRowDto): string {
  return (
    row.productName ??
    row.sku ??
    row.externalVariantId ??
    row.externalProductId ??
    row.selfxProductId ??
    ""
  );
}
