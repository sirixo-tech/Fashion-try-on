import { describe, expect, it, vi } from "vitest";

import {
  KIOSK_USAGE_EVENTS,
  PUBLIC_API_USAGE_EVENTS,
} from "./usage-event.service.js";
import { UsageSummaryService } from "./usage-summary.service.js";

describe("UsageSummaryService", () => {
  it("rolls up hierarchical usage without touching image assets", async () => {
    const prisma = new FakePrisma({
      events: [
        event({
          eventName: KIOSK_USAGE_EVENTS.sessionStarted,
          organizationId: "store-a",
          kioskDeviceId: "kiosk-1",
        }),
        event({
          eventName: KIOSK_USAGE_EVENTS.sessionCompleted,
          organizationId: "store-a",
          kioskDeviceId: "kiosk-1",
        }),
        event({
          eventName: KIOSK_USAGE_EVENTS.downloadCompleted,
          organizationId: "store-a",
          kioskDeviceId: "kiosk-1",
          kioskTryOnRunId: "run-1",
        }),
        event({
          eventName: KIOSK_USAGE_EVENTS.sessionIdleExpired,
          organizationId: "store-a",
          kioskDeviceId: "kiosk-1",
        }),
        event({
          eventName: PUBLIC_API_USAGE_EVENTS.downloadCompleted,
          channel: "PUBLIC_API",
          organizationId: "store-a",
          kioskTryOnRunId: "run-3",
        }),
        event({
          eventName: KIOSK_USAGE_EVENTS.sessionStarted,
          organizationId: "store-b",
          kioskDeviceId: "kiosk-2",
        }),
      ],
      runs: [
        run({
          id: "run-1",
          organizationId: "store-a",
          kioskDeviceId: "kiosk-1",
          productId: "product-1",
          resultAssetId: "result-1",
          status: "COMPLETED",
        }),
        run({
          id: "run-2",
          organizationId: "store-a",
          kioskDeviceId: "kiosk-1",
          productId: "product-1",
          status: "FAILED",
        }),
        run({
          id: "run-3",
          apiKeyId: "api-key-1",
          organizationId: "store-a",
          externalProductName: "Partner Dress",
          catalogSource: "PUBLIC_API",
          resultAssetId: "result-3",
          status: "COMPLETED",
          garmentCategory: "dress",
        }),
        run({
          id: "run-4",
          organizationId: "store-b",
          kioskDeviceId: "kiosk-2",
          productId: "product-2",
          resultAssetId: "result-4",
          status: "COMPLETED",
        }),
      ],
    });
    const service = new UsageSummaryService(
      prisma as never,
      storage() as never,
    );

    const summary = await service.summary({
      range: "custom",
      from: "2026-08-01T00:00:00.000Z",
      to: "2026-09-01T00:00:00.000Z",
      storeId: "store-a",
    });

    expect(summary.scope).toEqual({
      mode: "STORE",
      storeId: "store-a",
      storeName: "Store A",
    });
    expect(summary.totals).toMatchObject({
      sessionsStarted: 1,
      sessionsCompleted: 1,
      sessionsIdleExpired: 1,
      runsCreated: 3,
      completedRuns: 2,
      failedRuns: 1,
      tryOnsGenerated: 2,
      downloadsCompleted: 2,
      downloadRate: 100,
      successRate: 66.7,
    });
    expect(summary.channels).toEqual([
      expect.objectContaining({
        channel: "KIOSK",
        sessionsStarted: 1,
        runsCreated: 2,
        downloadsCompleted: 1,
      }),
      expect.objectContaining({
        channel: "PUBLIC_API",
        sessionsStarted: 0,
        runsCreated: 1,
        downloadsCompleted: 1,
      }),
    ]);
    expect(summary.providerUsage).toEqual([
      expect.objectContaining({
        provider: "google",
        providerModel: "virtual-try-on-001",
        runsCreated: 3,
        tryOnsGenerated: 2,
        downloadsCompleted: 2,
      }),
    ]);
    expect(summary.stores).toEqual([
      expect.objectContaining({
        storeId: "store-a",
        storeName: "Store A",
        sessionsStarted: 1,
        runsCreated: 3,
        tryOnsGenerated: 2,
        downloadsCompleted: 2,
      }),
    ]);
    expect(summary.kiosks).toEqual([
      expect.objectContaining({
        kioskDeviceId: "kiosk-1",
        displayName: "Front Kiosk",
        storeName: "Store A",
        runsCreated: 2,
        tryOnsGenerated: 1,
        downloadsCompleted: 1,
      }),
    ]);
    expect(summary.products).toEqual([
      expect.objectContaining({
        productId: "product-1",
        name: "Linen Shirt",
        category: "Tops",
        runsCreated: 2,
        downloadsCompleted: 1,
      }),
      expect.objectContaining({
        productId: null,
        name: "Partner Dress",
        category: "dress",
        catalogSource: "PUBLIC_API",
        runsCreated: 1,
        downloadsCompleted: 1,
      }),
    ]);
    expect(summary.categories).toEqual([
      expect.objectContaining({ category: "dress", runsCreated: 1 }),
      expect.objectContaining({ category: "Tops", runsCreated: 2 }),
    ]);
    expect(summary.daily).toContainEqual(
      expect.objectContaining({
        date: "2026-08-28",
        sessionsStarted: 1,
        runsCreated: 3,
        downloadsCompleted: 2,
      }),
    );
    expect("tryOnAsset" in prisma).toBe(false);
  });

  it("ranks completed runs across channels and preserves counts after result expiry", async () => {
    const shirt = run({ productId: "product-1" }).product!;
    const ring = {
      ...shirt,
      id: "ring-1",
      name: "Gold ring",
      imageUrl: null,
      imageStorageKey: "catalog/ring.jpg",
      category: { name: "Shopify products" },
    };
    const prisma = new FakePrisma({
      events: [],
      runs: [
        run({
          id: "ring-run",
          organizationId: "store-a",
          productId: ring.id,
          product: ring,
          catalogSource: "SHOPIFY",
          tryOnVertical: "JEWELLERY",
          jewelleryType: "RING",
          status: "COMPLETED",
          resultAssetId: null,
        }),
        run({
          id: "kiosk-run",
          organizationId: "store-a",
          productId: ring.id,
          product: ring,
          tryOnVertical: "JEWELLERY",
          jewelleryType: "RING",
          status: "COMPLETED",
        }),
        run({
          id: "shirt-run",
          apiKeyId: "key-1",
          organizationId: "store-a",
          productId: shirt.id,
          product: { ...shirt, category: { name: "WooCommerce products" } },
          status: "COMPLETED",
          resultAssetId: "result-1",
        }),
        ...Array.from({ length: 6 }, (_, index) =>
          run({
            id: `failed-${index}`,
            organizationId: "store-a",
            productId: "failed-product",
            status: "FAILED",
          }),
        ),
        run({
          id: "other-store",
          organizationId: "store-b",
          productId: "other-product",
          status: "COMPLETED",
        }),
        run({
          id: "outside-range",
          organizationId: "store-a",
          productId: "older-product",
          status: "COMPLETED",
          createdAt: new Date("2026-07-01T00:00:00Z"),
        }),
      ],
    });
    const objectStorage = storage();
    const service = new UsageSummaryService(
      prisma as never,
      objectStorage as never,
    );
    const summary = await service.summary({
      range: "custom",
      from: "2026-08-01T00:00:00Z",
      to: "2026-09-01T00:00:00Z",
      storeId: "store-a",
      limit: 2,
    });

    expect(summary.products).toEqual([
      expect.objectContaining({
        name: "Gold ring",
        category: "Rings",
        productVertical: "JEWELLERY",
        completedRuns: 2,
        tryOnsGenerated: 0,
        thumbnailUrl: "https://storage.test/catalog/ring.jpg",
      }),
      expect.objectContaining({
        name: "Linen Shirt",
        category: "Tops",
        productVertical: "GARMENT",
        completedRuns: 1,
        thumbnailUrl: "https://cdn.test/shirt.jpg",
      }),
    ]);
    expect(summary.categories).toEqual([
      expect.objectContaining({ category: "Rings", completedRuns: 2 }),
      expect.objectContaining({ category: "Tops", completedRuns: 1 }),
    ]);
    expect(objectStorage.createReadUrl).toHaveBeenCalledWith({
      key: "catalog/ring.jpg",
      expiresInSeconds: 900,
    });
    expect(prisma.kioskTryOnRun.findMany.mock.calls[0]![0]).toMatchObject({
      where: { OR: [{ organizationId: "store-a" }, { storeId: "store-a" }] },
    });
  });

  it("uses the Shopify category and aggregates external product variants within a Store", async () => {
    const shirt = run({ productId: "product-1" }).product!;
    const prisma = new FakePrisma({
      events: [],
      runs: [
        run({
          id: "shopify-run",
          organizationId: "store-a",
          status: "COMPLETED",
          catalogSource: "SHOPIFY",
          externalProductId: "shopify-1",
          productId: shirt.id,
          product: {
            ...shirt,
            category: { name: "Shopify products" },
            externalMappings: [
              {
                organizationId: "store-a",
                externalProductId: "shopify-1",
                metadata: {
                  shopifyCategoryName:
                    "Apparel & Accessories > Clothing > Shirts",
                },
              },
            ],
          },
        }),
        run({
          id: "variant-1",
          organizationId: "store-a",
          status: "COMPLETED",
          catalogSource: "PUBLIC_API",
          externalProductId: "external-1",
          externalVariantId: "size-s",
          externalProductName: "Dress S",
        }),
        run({
          id: "variant-2",
          organizationId: "store-a",
          status: "COMPLETED",
          catalogSource: "PUBLIC_API",
          externalProductId: "external-1",
          externalVariantId: "size-m",
          externalProductName: "Dress M",
        }),
        run({
          id: "store-b-variant",
          organizationId: "store-b",
          status: "COMPLETED",
          catalogSource: "PUBLIC_API",
          externalProductId: "external-1",
          externalProductName: "Other Store Dress",
        }),
      ],
    });
    const service = new UsageSummaryService(
      prisma as never,
      storage() as never,
    );
    const summary = await service.summary({
      range: "custom",
      from: "2026-08-01T00:00:00Z",
      to: "2026-09-01T00:00:00Z",
    });
    expect(summary.products).toHaveLength(3);
    expect(summary.products[0]).toMatchObject({
      externalProductId: "external-1",
      completedRuns: 2,
    });
    expect(summary.categories).toContainEqual(
      expect.objectContaining({ category: "Shirts", completedRuns: 1 }),
    );
    expect(summary.products).toContainEqual(
      expect.objectContaining({ name: "Other Store Dress", completedRuns: 1 }),
    );
  });
});

type FakeUsageEvent = {
  eventName: string;
  channel: string;
  apiKeyId: string | null;
  organizationId: string | null;
  storeId: string | null;
  kioskDeviceId: string | null;
  kioskTryOnRunId: string | null;
  productId: string | null;
  provider: string | null;
  providerModel: string | null;
  quantity: number;
  occurredAt: Date;
};

type FakeRun = {
  id: string;
  status: string;
  apiKeyId: string | null;
  organizationId: string | null;
  storeId: string | null;
  kioskDeviceId: string | null;
  productId: string | null;
  resultAssetId: string | null;
  provider: string;
  providerModel: string;
  garmentCategory: string;
  tryOnVertical: "GARMENT" | "JEWELLERY";
  jewelleryType: string | null;
  catalogSource: string | null;
  externalProductId: string | null;
  externalVariantId: string | null;
  externalSku: string | null;
  externalProductName: string | null;
  createdAt: Date;
  product: {
    id: string;
    name: string;
    garmentCategory: string;
    imageUrl: string | null;
    imageStorageKey: string | null;
    externalMappings: Array<{
      organizationId: string;
      externalProductId: string;
      metadata: Record<string, unknown>;
    }>;
    category: { name: string } | null;
  } | null;
};

class FakePrisma {
  readonly usageEvent = {
    aggregate: vi.fn(async ({ where }: { where: Record<string, unknown> }) => ({
      _sum: {
        quantity: this.filterEvents(where).reduce(
          (sum, item) => sum + item.quantity,
          0,
        ),
      },
    })),
    groupBy: vi.fn(
      async ({ by, where }: { by: string[]; where: Record<string, unknown> }) =>
        groupBy(this.filterEvents(where), by),
    ),
  };
  readonly kioskTryOnRun = {
    count: vi.fn(
      async ({ where }: { where: Record<string, unknown> }) =>
        this.filterRuns(where).length,
    ),
    findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) =>
      this.filterRuns(where),
    ),
    groupBy: vi.fn(
      async ({ by, where }: { by: string[]; where: Record<string, unknown> }) =>
        groupBy(this.filterRuns(where), by),
    ),
  };
  readonly organization = {
    findMany: vi.fn(async ({ where }: { where: { id: { in: string[] } } }) =>
      [
        { id: "store-a", name: "Store A" },
        { id: "store-b", name: "Store B" },
      ].filter((store) => where.id.in.includes(store.id)),
    ),
    findUnique: vi.fn(async ({ where }: { where: { id: string } }) =>
      where.id === "store-a" ? { id: "store-a", name: "Store A" } : null,
    ),
  };
  readonly kioskDevice = {
    findMany: vi.fn(async ({ where }: { where: { id: { in: string[] } } }) =>
      [
        {
          id: "kiosk-1",
          displayName: "Front Kiosk",
          organizationId: "store-a",
          storeId: null,
          organization: { name: "Store A" },
          store: null,
        },
        {
          id: "kiosk-2",
          displayName: "Lobby Kiosk",
          organizationId: "store-b",
          storeId: null,
          organization: { name: "Store B" },
          store: null,
        },
      ].filter((kiosk) => where.id.in.includes(kiosk.id)),
    ),
  };

  constructor(
    private readonly data: { events: FakeUsageEvent[]; runs: FakeRun[] },
  ) {}

  private filterEvents(where: Record<string, unknown>): FakeUsageEvent[] {
    return this.data.events.filter((item) =>
      matchesWhere(item, where, "occurredAt"),
    );
  }

  private filterRuns(where: Record<string, unknown>): FakeRun[] {
    return this.data.runs.filter((item) =>
      matchesWhere(item, where, "createdAt"),
    );
  }
}

function event(input: Partial<FakeUsageEvent>): FakeUsageEvent {
  return {
    eventName: KIOSK_USAGE_EVENTS.sessionStarted,
    channel: "KIOSK",
    apiKeyId: null,
    organizationId: null,
    storeId: null,
    kioskDeviceId: null,
    kioskTryOnRunId: null,
    productId: null,
    provider: null,
    providerModel: null,
    quantity: 1,
    occurredAt: new Date("2026-08-28T10:00:00.000Z"),
    ...input,
  };
}

function run(input: Partial<FakeRun>): FakeRun {
  const productId = input.productId ?? null;
  return {
    id: "run-1",
    status: "QUEUED",
    apiKeyId: null,
    organizationId: null,
    storeId: null,
    kioskDeviceId: null,
    productId,
    resultAssetId: null,
    provider: "google",
    providerModel: "virtual-try-on-001",
    garmentCategory: "tops",
    tryOnVertical: "GARMENT",
    jewelleryType: null,
    catalogSource: "SELFX",
    externalProductId: null,
    externalVariantId: null,
    externalSku: null,
    externalProductName: null,
    createdAt: new Date("2026-08-28T10:00:00.000Z"),
    product: productId
      ? {
          id: productId,
          name: productId === "product-1" ? "Linen Shirt" : "Grey Trouser",
          garmentCategory: productId === "product-1" ? "tops" : "bottoms",
          imageUrl: "https://cdn.test/shirt.jpg",
          imageStorageKey: null,
          externalMappings: [],
          category: {
            name: productId === "product-1" ? "Tops" : "Bottoms",
          },
        }
      : null,
    ...input,
  };
}

function storage() {
  return {
    createReadUrl: vi.fn(
      ({ key }: { key: string }) => `https://storage.test/${key}`,
    ),
  };
}

function groupBy<T extends Record<string, unknown>>(items: T[], by: string[]) {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = JSON.stringify(by.map((field) => item[field]));
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return [...groups.values()]
    .map((groupItems) => {
      const first = groupItems[0]!;
      return {
        ...Object.fromEntries(by.map((field) => [field, first[field]])),
        _sum: {
          quantity: groupItems.reduce(
            (sum, item) =>
              sum + (typeof item.quantity === "number" ? item.quantity : 0),
            0,
          ),
        },
        _count: { _all: groupItems.length },
      };
    })
    .sort((left, right) => right._count._all - left._count._all);
}

function matchesWhere(
  item: FakeUsageEvent | FakeRun,
  where: Record<string, unknown>,
  dateField: "occurredAt" | "createdAt",
): boolean {
  return Object.entries(where).every(([key, value]) => {
    if (key === "OR" && Array.isArray(value)) {
      return value.some((entry) =>
        matchesWhere(item, entry as Record<string, unknown>, dateField),
      );
    }
    if (key === dateField && isDateRange(value)) {
      const actual =
        dateField === "occurredAt"
          ? (item as FakeUsageEvent).occurredAt
          : (item as FakeRun).createdAt;
      return actual >= value.gte && actual <= value.lte;
    }
    const actual = item[key as keyof typeof item];
    if (isNotNullFilter(value)) {
      return actual !== null;
    }
    if (isInFilter(value)) {
      return typeof actual === "string" && value.in.includes(actual);
    }
    return actual === value;
  });
}

function isDateRange(value: unknown): value is { gte: Date; lte: Date } {
  return (
    typeof value === "object" &&
    value !== null &&
    "gte" in value &&
    "lte" in value &&
    value.gte instanceof Date &&
    value.lte instanceof Date
  );
}

function isNotNullFilter(value: unknown): value is { not: null } {
  return (
    typeof value === "object" &&
    value !== null &&
    "not" in value &&
    value.not === null
  );
}

function isInFilter(value: unknown): value is { in: string[] } {
  return (
    typeof value === "object" &&
    value !== null &&
    "in" in value &&
    Array.isArray(value.in)
  );
}
