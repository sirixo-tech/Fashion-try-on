import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PublicApiUsageService } from "./public-api-usage.service.js";
import type { PublicApiCredentialContext } from "./public-api-key-auth.service.js";

describe("PublicApiUsageService", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-29T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns current API key usage totals and provider rows", async () => {
    const prisma = new FakePrisma(
      [
        run({ status: "QUEUED" }),
        run({ status: "PROCESSING" }),
        run({ status: "COMPLETED", resultAssetId: "result-1" }),
        run({ status: "FAILED", provider: "google", providerModel: "vto-1" }),
        run({ apiKeyId: "other-key", status: "COMPLETED" }),
        run({ organizationId: "other-store", status: "COMPLETED" }),
        run({
          createdAt: new Date("2026-08-01T00:00:00.000Z"),
          status: "FAILED",
        }),
      ],
      [
        usageEvent({ quantity: 2 }),
        usageEvent({ apiKeyId: "other-key", quantity: 3 }),
        usageEvent({ organizationId: "other-store", quantity: 4 }),
        usageEvent({ occurredAt: new Date("2026-08-01T00:00:00.000Z") }),
      ],
    );
    const service = new PublicApiUsageService(prisma as never);

    const response = await service.summary(credential(), {
      range: "7d",
      limit: 5,
    });

    expect(response).toMatchObject({
      range: {
        preset: "7d",
        to: "2026-08-29T12:00:00.000Z",
      },
      store: {
        id: "store-1",
        name: "Store One",
      },
      keyPrefix: "selfx_test_abcdefghijkl",
      totals: {
        runsCreated: 4,
        queuedRuns: 1,
        processingRuns: 1,
        completedRuns: 1,
        failedRuns: 1,
        generatedLooks: 1,
        downloadsCompleted: 2,
      },
      providerUsage: [
        {
          provider: "fashn",
          providerModel: "tryon-v1.6",
          runsCreated: 3,
          completedRuns: 1,
          failedRuns: 0,
        },
        {
          provider: "google",
          providerModel: "vto-1",
          runsCreated: 1,
          completedRuns: 0,
          failedRuns: 1,
        },
      ],
    });
  });

  it("supports explicit custom ranges", async () => {
    const prisma = new FakePrisma([
      run({ createdAt: new Date("2026-08-20T00:00:00.000Z") }),
      run({ createdAt: new Date("2026-08-26T00:00:00.000Z") }),
    ]);
    const service = new PublicApiUsageService(prisma as never);

    const response = await service.summary(credential(), {
      range: "custom",
      from: "2026-08-25T00:00:00.000Z",
      to: "2026-08-27T00:00:00.000Z",
    });

    expect(response.range).toEqual({
      preset: "custom",
      from: "2026-08-25T00:00:00.000Z",
      to: "2026-08-27T00:00:00.000Z",
    });
    expect(response.totals.runsCreated).toBe(1);
  });
});

class FakePrisma {
  readonly kioskTryOnRun = {
    count: vi.fn(async ({ where }: { where: RunWhere }) => {
      return this.runs.filter((item) => matchesWhere(item, where)).length;
    }),
    groupBy: vi.fn(async ({ where }: { where: RunWhere }) => {
      const grouped = new Map<string, ProviderGroup>();
      for (const item of this.runs.filter((run) => matchesWhere(run, where))) {
        const key = `${item.provider}:${item.providerModel}:${item.status}`;
        const current =
          grouped.get(key) ??
          ({
            provider: item.provider,
            providerModel: item.providerModel,
            status: item.status,
            _count: { _all: 0 },
          } satisfies ProviderGroup);
        current._count._all += 1;
        grouped.set(key, current);
      }
      return [...grouped.values()];
    }),
  };

  readonly usageEvent = {
    aggregate: vi.fn(async ({ where }: { where: UsageWhere }) => {
      const quantity = this.events
        .filter((item) => matchesUsageWhere(item, where))
        .reduce((sum, item) => sum + item.quantity, 0);
      return { _sum: { quantity } };
    }),
  };

  constructor(
    private readonly runs: FakeRun[],
    private readonly events: FakeUsageEvent[] = [],
  ) {}
}

interface FakeRun {
  apiKeyId: string;
  organizationId: string;
  status: string;
  provider: string;
  providerModel: string;
  resultAssetId: string | null;
  createdAt: Date;
}

interface RunWhere {
  apiKeyId?: string;
  organizationId?: string;
  status?: string;
  resultAssetId?: { not: null };
  createdAt?: {
    gte?: Date;
    lte?: Date;
  };
}

interface FakeUsageEvent {
  apiKeyId: string;
  organizationId: string;
  channel: string;
  eventName: string;
  quantity: number;
  occurredAt: Date;
}

interface UsageWhere {
  apiKeyId?: string;
  organizationId?: string;
  channel?: string;
  eventName?: string;
  occurredAt?: {
    gte?: Date;
    lte?: Date;
  };
}

interface ProviderGroup {
  provider: string;
  providerModel: string;
  status: string;
  _count: { _all: number };
}

function matchesWhere(run: FakeRun, where: RunWhere): boolean {
  return (
    (where.apiKeyId === undefined || run.apiKeyId === where.apiKeyId) &&
    (where.organizationId === undefined ||
      run.organizationId === where.organizationId) &&
    (where.status === undefined || run.status === where.status) &&
    (where.resultAssetId === undefined ||
      run.resultAssetId !== where.resultAssetId.not) &&
    (where.createdAt?.gte === undefined ||
      run.createdAt >= where.createdAt.gte) &&
    (where.createdAt?.lte === undefined || run.createdAt <= where.createdAt.lte)
  );
}

function matchesUsageWhere(event: FakeUsageEvent, where: UsageWhere): boolean {
  return (
    (where.apiKeyId === undefined || event.apiKeyId === where.apiKeyId) &&
    (where.organizationId === undefined ||
      event.organizationId === where.organizationId) &&
    (where.channel === undefined || event.channel === where.channel) &&
    (where.eventName === undefined || event.eventName === where.eventName) &&
    (where.occurredAt?.gte === undefined ||
      event.occurredAt >= where.occurredAt.gte) &&
    (where.occurredAt?.lte === undefined ||
      event.occurredAt <= where.occurredAt.lte)
  );
}

function run(overrides: Partial<FakeRun> = {}): FakeRun {
  return {
    apiKeyId: "api-key-1",
    organizationId: "store-1",
    status: "QUEUED",
    provider: "fashn",
    providerModel: "tryon-v1.6",
    resultAssetId: null,
    createdAt: new Date("2026-08-29T10:00:00.000Z"),
    ...overrides,
  };
}

function usageEvent(overrides: Partial<FakeUsageEvent> = {}): FakeUsageEvent {
  return {
    apiKeyId: "api-key-1",
    organizationId: "store-1",
    channel: "PUBLIC_API",
    eventName: "PUBLIC_API_DOWNLOAD_COMPLETED",
    quantity: 1,
    occurredAt: new Date("2026-08-29T10:00:00.000Z"),
    ...overrides,
  };
}

function credential(): PublicApiCredentialContext {
  return {
    apiKeyId: "api-key-1",
    keyPrefix: "selfx_test_abcdefghijkl",
    storeId: "store-1",
    storeName: "Store One",
    environment: "TEST",
    scopes: ["usage:read"],
  };
}
