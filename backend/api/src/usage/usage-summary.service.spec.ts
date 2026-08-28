import { describe, expect, it, vi } from "vitest";

import { KIOSK_USAGE_EVENTS } from "./usage-event.service.js";
import { UsageSummaryService } from "./usage-summary.service.js";

describe("UsageSummaryService", () => {
  it("rolls up kiosk usage without touching image assets", async () => {
    const prisma = new FakePrisma([
      event({
        eventName: KIOSK_USAGE_EVENTS.sessionStarted,
        organizationId: "store-a",
        kioskDeviceId: "kiosk-1",
      }),
      event({
        eventName: KIOSK_USAGE_EVENTS.tryOnGenerated,
        organizationId: "store-a",
        kioskDeviceId: "kiosk-1",
        productId: "product-1",
        provider: "google",
        providerModel: "virtual-try-on-001",
        quantity: 2,
      }),
      event({
        eventName: KIOSK_USAGE_EVENTS.downloadCompleted,
        organizationId: "store-a",
        kioskDeviceId: "kiosk-1",
        productId: "product-1",
      }),
      event({
        eventName: KIOSK_USAGE_EVENTS.sessionIdleExpired,
        organizationId: "store-a",
        kioskDeviceId: "kiosk-1",
      }),
      event({
        eventName: KIOSK_USAGE_EVENTS.tryOnGenerated,
        organizationId: "store-b",
        kioskDeviceId: "kiosk-2",
        productId: "product-2",
        provider: "google",
        providerModel: "virtual-try-on-001",
      }),
    ]);
    const service = new UsageSummaryService(prisma as never);

    const summary = await service.summary({
      range: "custom",
      from: "2026-08-01T00:00:00.000Z",
      to: "2026-09-01T00:00:00.000Z",
      storeId: "store-a",
    });

    expect(summary.totals).toMatchObject({
      sessionsStarted: 1,
      sessionsIdleExpired: 1,
      tryOnsGenerated: 2,
      downloadsCompleted: 1,
      downloadRate: 50,
    });
    expect(summary.providerUsage).toEqual([
      {
        provider: "google",
        providerModel: "virtual-try-on-001",
        tryOnsGenerated: 2,
      },
    ]);
    expect(summary.stores).toEqual([
      {
        storeId: "store-a",
        storeName: "Store A",
        sessionsStarted: 1,
        tryOnsGenerated: 2,
        downloadsCompleted: 1,
      },
    ]);
    expect(summary.kiosks[0]).toMatchObject({
      kioskDeviceId: "kiosk-1",
      displayName: "Front Kiosk",
      storeName: "Store A",
      tryOnsGenerated: 2,
      downloadsCompleted: 1,
    });
    expect(summary.products).toEqual([
      {
        productId: "product-1",
        name: "Linen Shirt",
        tryOnsGenerated: 2,
        downloadsCompleted: 1,
      },
    ]);
    expect("tryOnAsset" in prisma).toBe(false);
  });
});

type FakeUsageEvent = {
  eventName: string;
  channel: string;
  organizationId: string | null;
  storeId: string | null;
  kioskDeviceId: string | null;
  productId: string | null;
  provider: string | null;
  providerModel: string | null;
  quantity: number;
  occurredAt: Date;
};

class FakePrisma {
  readonly usageEvent = {
    aggregate: vi.fn(async ({ where }: { where: Record<string, unknown> }) => ({
      _sum: {
        quantity: this.filter(where).reduce(
          (sum, item) => sum + item.quantity,
          0,
        ),
      },
    })),
    groupBy: vi.fn(
      async ({
        by,
        where,
        take,
      }: {
        by: string[];
        where: Record<string, unknown>;
        take?: number;
      }) => {
        const groups = new Map<string, FakeUsageEvent[]>();
        for (const item of this.filter(where)) {
          const key = JSON.stringify(
            by.map((field) => item[field as keyof FakeUsageEvent]),
          );
          groups.set(key, [...(groups.get(key) ?? []), item]);
        }
        return [...groups.values()]
          .map((items) => {
            const first = items[0]!;
            return {
              ...Object.fromEntries(
                by.map((field) => [
                  field,
                  first[field as keyof FakeUsageEvent],
                ]),
              ),
              _sum: {
                quantity: items.reduce((sum, item) => sum + item.quantity, 0),
              },
            };
          })
          .sort((left, right) => right._sum.quantity - left._sum.quantity)
          .slice(0, take);
      },
    ),
  };
  readonly organization = {
    findMany: vi.fn(async () => [{ id: "store-a", name: "Store A" }]),
  };
  readonly kioskDevice = {
    findMany: vi.fn(async () => [
      {
        id: "kiosk-1",
        displayName: "Front Kiosk",
        organizationId: "store-a",
        storeId: null,
        organization: { name: "Store A" },
        store: null,
      },
    ]),
  };
  readonly product = {
    findMany: vi.fn(async () => [{ id: "product-1", name: "Linen Shirt" }]),
  };

  constructor(private readonly events: FakeUsageEvent[]) {}

  private filter(where: Record<string, unknown>): FakeUsageEvent[] {
    return this.events.filter((item) => matchesWhere(item, where));
  }
}

function event(input: Partial<FakeUsageEvent>): FakeUsageEvent {
  return {
    eventName: KIOSK_USAGE_EVENTS.sessionStarted,
    channel: "KIOSK",
    organizationId: null,
    storeId: null,
    kioskDeviceId: null,
    productId: null,
    provider: null,
    providerModel: null,
    quantity: 1,
    occurredAt: new Date("2026-08-28T10:00:00.000Z"),
    ...input,
  };
}

function matchesWhere(
  item: FakeUsageEvent,
  where: Record<string, unknown>,
): boolean {
  return Object.entries(where).every(([key, value]) => {
    if (key === "OR" && Array.isArray(value)) {
      return value.some((entry) => matchesWhere(item, entry));
    }
    if (key === "occurredAt" && isDateRange(value)) {
      return item.occurredAt >= value.gte && item.occurredAt <= value.lte;
    }
    const actual = item[key as keyof FakeUsageEvent];
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
