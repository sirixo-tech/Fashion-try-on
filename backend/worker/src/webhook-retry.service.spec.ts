import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { WebhookRetryService } from "./webhook-retry.service.js";

describe("WebhookRetryService", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-31T10:00:00.000Z"));
    vi.stubEnv("SELFX_WEBHOOK_SIGNING_KEY", "test-webhook-signing-key");
    vi.stubEnv("SELFX_WEBHOOK_RETRY_MAX_ATTEMPTS", "5");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("retries a due failed delivery and marks it delivered", async () => {
    const prisma = new FakePrisma([
      delivery({
        id: "delivery-1",
        attemptNumber: 1,
        payload: webhookPayload({ id: "event-1" }),
      }),
    ]);
    const fetchMock = vi.fn(async () => ({ ok: true, status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    const service = new WebhookRetryService(prisma as never);

    const result = await service.retryDueDeliveries();

    expect(result).toMatchObject({
      scanned: 1,
      claimed: 1,
      delivered: 1,
      failed: 0,
      exhausted: 0,
      signingConfigured: true,
    });
    expect(prisma.deliveries[0]).toMatchObject({
      status: "DELIVERED",
      attemptNumber: 2,
      httpStatus: 204,
      nextRetryAt: null,
      errorMessage: null,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, request] = fetchMock.mock.calls[0] as unknown as [
      string,
      { body: string; headers: Record<string, string>; method: string },
    ];
    expect(url).toBe("https://merchant.example.com/selfx/webhooks");
    expect(request.method).toBe("POST");
    expect(request.headers["selfx-delivery-id"]).toBe("delivery-1");
    expect(request.headers["selfx-event-id"]).toBe("event-1");
    expect(request.headers["selfx-signature"]).toMatch(/^v1=[a-f0-9]{64}$/);
    expect(JSON.parse(request.body)).toMatchObject({
      id: "event-1",
      type: "try_on.completed",
    });
  });

  it("keeps a failed retry scheduled with backoff", async () => {
    const prisma = new FakePrisma([
      delivery({ id: "delivery-1", attemptNumber: 1 }),
    ]);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 503 })),
    );
    const service = new WebhookRetryService(prisma as never);

    const result = await service.retryDueDeliveries();

    expect(result).toMatchObject({
      claimed: 1,
      delivered: 0,
      failed: 1,
      exhausted: 0,
    });
    expect(prisma.deliveries[0]).toMatchObject({
      status: "FAILED",
      attemptNumber: 2,
      httpStatus: 503,
      errorMessage: "Webhook endpoint returned HTTP 503.",
      nextRetryAt: new Date("2026-08-31T10:15:00.000Z"),
    });
  });

  it("exhausts deliveries that reached the maximum attempt count", async () => {
    const prisma = new FakePrisma([
      delivery({
        id: "delivery-1",
        attemptNumber: 5,
        nextRetryAt: new Date("2026-08-31T09:59:00.000Z"),
      }),
    ]);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const service = new WebhookRetryService(prisma as never);

    const result = await service.retryDueDeliveries();

    expect(result).toMatchObject({
      scanned: 0,
      claimed: 0,
      delivered: 0,
      failed: 0,
      exhausted: 1,
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(prisma.deliveries[0]).toMatchObject({
      status: "FAILED",
      attemptNumber: 5,
      nextRetryAt: null,
      errorMessage: "Webhook delivery retry limit reached after 5 attempts.",
    });
  });

  it("does not claim deliveries when signing is not configured", async () => {
    vi.stubEnv("SELFX_WEBHOOK_SIGNING_KEY", "");
    vi.stubEnv("JWT_ACCESS_SECRET", "");
    const prisma = new FakePrisma([delivery({ id: "delivery-1" })]);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const service = new WebhookRetryService(prisma as never);

    const result = await service.retryDueDeliveries();

    expect(result).toMatchObject({
      scanned: 0,
      claimed: 0,
      delivered: 0,
      failed: 0,
      exhausted: 0,
      signingConfigured: false,
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(prisma.webhookDelivery.findMany).not.toHaveBeenCalled();
  });
});

class FakePrisma {
  readonly deliveries: FakeDelivery[];

  readonly webhookDelivery = {
    findMany: vi.fn(
      async ({ where, take }: { where: FindManyWhere; take: number }) => {
        return this.deliveries
          .filter((item) => matchesWhere(item, where))
          .slice(0, take);
      },
    ),
    updateMany: vi.fn(
      async ({ where, data }: { where: UpdateManyWhere; data: UpdateData }) => {
        let count = 0;
        for (const item of this.deliveries) {
          if (matchesWhere(item, where)) {
            applyData(item, data);
            count += 1;
          }
        }
        return { count };
      },
    ),
    update: vi.fn(
      async ({ where, data }: { where: { id: string }; data: UpdateData }) => {
        const current = this.deliveries.find((item) => item.id === where.id);
        if (!current) {
          throw new Error("delivery not found");
        }
        applyData(current, data);
        return current;
      },
    ),
  };

  constructor(deliveries: FakeDelivery[] = []) {
    this.deliveries = [...deliveries];
  }
}

type FindManyWhere = {
  status?: string;
  nextRetryAt?: { lte: Date };
  attemptNumber?: { lt?: number; gte?: number } | number;
  webhookEndpoint?: { status: string };
};

type UpdateManyWhere = FindManyWhere & { id?: string };

type UpdateData = Partial<
  Omit<FakeDelivery, "webhookEndpoint" | "attemptNumber">
> & {
  attemptNumber?: { increment: number } | number;
};

type FakeEndpoint = {
  id: string;
  organizationId: string;
  url: string;
  status: string;
  secretReference: string;
  subscribedEvents: unknown;
  createdAt: Date;
  updatedAt: Date;
};

type FakeDelivery = {
  id: string;
  organizationId: string;
  webhookEndpointId: string;
  eventId: string;
  eventType: string;
  payload: unknown;
  attemptNumber: number;
  status: string;
  httpStatus: number | null;
  errorMessage: string | null;
  nextRetryAt: Date | null;
  deliveredAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  webhookEndpoint: FakeEndpoint;
};

function matchesWhere(item: FakeDelivery, where: UpdateManyWhere): boolean {
  if (where.id !== undefined && item.id !== where.id) {
    return false;
  }
  if (where.status !== undefined && item.status !== where.status) {
    return false;
  }
  if (
    where.nextRetryAt?.lte &&
    (!item.nextRetryAt || item.nextRetryAt > where.nextRetryAt.lte)
  ) {
    return false;
  }
  if (typeof where.attemptNumber === "number") {
    return item.attemptNumber === where.attemptNumber;
  }
  if (
    where.attemptNumber?.lt !== undefined &&
    item.attemptNumber >= where.attemptNumber.lt
  ) {
    return false;
  }
  if (
    where.attemptNumber?.gte !== undefined &&
    item.attemptNumber < where.attemptNumber.gte
  ) {
    return false;
  }
  if (
    where.webhookEndpoint?.status !== undefined &&
    item.webhookEndpoint.status !== where.webhookEndpoint.status
  ) {
    return false;
  }
  return true;
}

function applyData(item: FakeDelivery, data: UpdateData): void {
  for (const [key, value] of Object.entries(data)) {
    if (key === "attemptNumber" && isIncrement(value)) {
      item.attemptNumber += value.increment;
      continue;
    }
    (item as unknown as Record<string, unknown>)[key] = value;
  }
  item.updatedAt = new Date();
}

function isIncrement(value: unknown): value is { increment: number } {
  return (
    value !== null &&
    typeof value === "object" &&
    "increment" in value &&
    typeof (value as { increment: unknown }).increment === "number"
  );
}

function delivery(overrides: Partial<FakeDelivery> = {}): FakeDelivery {
  const now = new Date("2026-08-31T09:55:00.000Z");
  const endpoint = {
    id: "endpoint-1",
    organizationId: "store-1",
    url: "https://merchant.example.com/selfx/webhooks",
    status: "ACTIVE",
    secretReference: "derived:v1",
    subscribedEvents: ["try_on.completed"],
    createdAt: now,
    updatedAt: now,
  };
  return {
    id: "delivery-1",
    organizationId: "store-1",
    webhookEndpointId: endpoint.id,
    eventId: "event-1",
    eventType: "try_on.completed",
    payload: webhookPayload({ id: "event-1" }),
    attemptNumber: 1,
    status: "FAILED",
    httpStatus: 500,
    errorMessage: "Webhook endpoint returned HTTP 500.",
    nextRetryAt: new Date("2026-08-31T09:59:00.000Z"),
    deliveredAt: null,
    createdAt: now,
    updatedAt: now,
    webhookEndpoint: endpoint,
    ...overrides,
  };
}

function webhookPayload(overrides: Record<string, unknown> = {}) {
  return {
    id: "event-1",
    type: "try_on.completed",
    apiVersion: "2026-08-29",
    createdAt: "2026-08-31T09:55:00.000Z",
    data: {
      object: "try_on",
      run: {
        id: "run-1",
        status: "COMPLETED",
        sessionId: "session-1",
        createdAt: "2026-08-31T09:54:00.000Z",
        updatedAt: "2026-08-31T09:55:00.000Z",
      },
    },
    ...overrides,
  };
}
