import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiErrorException } from "../common/api-error.exception.js";
import { PublicApiWebhookService } from "./public-api-webhook.service.js";
import type { PublicApiCredentialContext } from "./public-api-key-auth.service.js";

describe("PublicApiWebhookService", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-29T12:00:00.000Z"));
    vi.stubEnv("SELFX_WEBHOOK_SIGNING_KEY", "test-webhook-signing-key");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("creates Store-scoped webhook endpoints and returns the signing secret once", async () => {
    const prisma = new FakePrisma();
    const service = new PublicApiWebhookService(prisma as never);

    const created = await service.createEndpoint(credential(), {
      url: "https://merchant.example.com/selfx/webhooks#ignored",
      subscribedEvents: ["try_on.completed"],
    });
    const listed = await service.listEndpoints(credential());

    expect(created).toMatchObject({
      url: "https://merchant.example.com/selfx/webhooks",
      status: "ACTIVE",
      subscribedEvents: ["try_on.completed"],
      secret: expect.stringMatching(/^whsec_/),
    });
    expect(listed.data).toEqual([
      expect.objectContaining({
        id: created.id,
        url: "https://merchant.example.com/selfx/webhooks",
        status: "ACTIVE",
        subscribedEvents: ["try_on.completed"],
      }),
    ]);
    expect(listed.data[0]).not.toHaveProperty("secret");
  });

  it("rejects non-HTTPS webhook URLs", async () => {
    const service = new PublicApiWebhookService(new FakePrisma() as never);

    await expect(
      service.createEndpoint(credential(), {
        url: "http://merchant.example.com/selfx/webhooks",
      }),
    ).rejects.toBeInstanceOf(ApiErrorException);
  });

  it("updates and disables only endpoints in the current Store scope", async () => {
    const prisma = new FakePrisma([
      endpoint({ id: "endpoint-1", organizationId: "store-1" }),
      endpoint({ id: "endpoint-2", organizationId: "store-2" }),
    ]);
    const service = new PublicApiWebhookService(prisma as never);

    const updated = await service.updateEndpoint(credential(), "endpoint-1", {
      enabled: false,
      subscribedEvents: ["try_on.failed"],
    });
    await service.disableEndpoint(credential(), "endpoint-1");

    expect(updated).toMatchObject({
      id: "endpoint-1",
      status: "DISABLED",
      subscribedEvents: ["try_on.failed"],
    });
    await expect(
      service.updateEndpoint(credential(), "endpoint-2", { enabled: false }),
    ).rejects.toBeInstanceOf(ApiErrorException);
  });

  it("sends signed terminal Try-On events to subscribed active endpoints", async () => {
    const prisma = new FakePrisma([
      endpoint({
        id: "endpoint-1",
        subscribedEvents: ["try_on.completed"],
      }),
      endpoint({
        id: "endpoint-2",
        subscribedEvents: ["try_on.failed"],
      }),
      endpoint({
        id: "endpoint-3",
        status: "DISABLED",
        subscribedEvents: ["try_on.completed"],
      }),
    ]);
    const fetchMock = vi.fn(async () => ({ ok: true, status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    const service = new PublicApiWebhookService(prisma as never);

    await service.deliverTryOnRunTerminalEvent("store-1", {
      id: "run-1",
      status: "COMPLETED",
      sessionId: "session-1",
      createdAt: "2026-08-29T12:00:00.000Z",
      updatedAt: "2026-08-29T12:00:02.000Z",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const firstCall = fetchMock.mock.calls[0];
    expect(firstCall).toBeDefined();
    const [url, request] = firstCall as unknown as [
      string,
      {
        body: string;
        headers: Record<string, string>;
        method: string;
      },
    ];
    expect(url).toBe("https://merchant.example.com/selfx/webhooks");
    expect(request.method).toBe("POST");
    expect(request.headers["selfx-event-type"]).toBe("try_on.completed");
    expect(request.headers["selfx-signature"]).toMatch(/^v1=[a-f0-9]{64}$/);
    expect(JSON.parse(request.body)).toMatchObject({
      type: "try_on.completed",
      data: {
        object: "try_on",
        run: { id: "run-1", status: "COMPLETED" },
      },
    });
    expect(prisma.deliveries).toEqual([
      expect.objectContaining({
        webhookEndpointId: "endpoint-1",
        eventType: "try_on.completed",
        status: "DELIVERED",
        httpStatus: 204,
      }),
    ]);
  });

  it("records failed webhook deliveries with a retry timestamp", async () => {
    const prisma = new FakePrisma([endpoint({ id: "endpoint-1" })]);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 500 })),
    );
    const service = new PublicApiWebhookService(prisma as never);

    await service.deliverTryOnRunTerminalEvent("store-1", {
      id: "run-1",
      status: "COMPLETED",
      sessionId: "session-1",
      createdAt: "2026-08-29T12:00:00.000Z",
      updatedAt: "2026-08-29T12:00:02.000Z",
    });

    expect(prisma.deliveries[0]).toMatchObject({
      status: "FAILED",
      httpStatus: 500,
      errorMessage: "Webhook endpoint returned HTTP 500.",
      nextRetryAt: new Date("2026-08-29T12:05:00.000Z"),
    });
  });
});

class FakePrisma {
  readonly endpoints: FakeEndpoint[];
  readonly deliveries: FakeDelivery[] = [];

  readonly webhookEndpoint = {
    count: vi.fn(async ({ where }: { where: { organizationId: string } }) => {
      return this.endpoints.filter(
        (item) => item.organizationId === where.organizationId,
      ).length;
    }),
    create: vi.fn(async ({ data }: { data: CreateEndpointData }) => {
      const now = new Date();
      const created = {
        ...data,
        createdAt: now,
        updatedAt: now,
      } satisfies FakeEndpoint;
      this.endpoints.unshift(created);
      return created;
    }),
    findMany: vi.fn(
      async ({
        where,
      }: {
        where: { organizationId: string; status?: string };
      }) => {
        return this.endpoints.filter(
          (item) =>
            item.organizationId === where.organizationId &&
            (where.status === undefined || item.status === where.status),
        );
      },
    ),
    findFirst: vi.fn(
      async ({ where }: { where: { id: string; organizationId: string } }) => {
        return (
          this.endpoints.find(
            (item) =>
              item.id === where.id &&
              item.organizationId === where.organizationId,
          ) ?? null
        );
      },
    ),
    update: vi.fn(
      async ({
        where,
        data,
      }: {
        where: { id: string };
        data: Partial<FakeEndpoint>;
      }) => {
        const current = this.endpoints.find((item) => item.id === where.id);
        if (!current) {
          throw new Error("endpoint not found");
        }
        Object.assign(current, data, { updatedAt: new Date() });
        return current;
      },
    ),
  };

  readonly webhookDelivery = {
    create: vi.fn(async ({ data }: { data: CreateDeliveryData }) => {
      const now = new Date();
      const created = {
        ...data,
        httpStatus: null,
        errorMessage: null,
        nextRetryAt: null,
        deliveredAt: null,
        createdAt: now,
        updatedAt: now,
      } satisfies FakeDelivery;
      this.deliveries.push(created);
      return created;
    }),
    update: vi.fn(
      async ({
        where,
        data,
      }: {
        where: { id: string };
        data: Partial<FakeDelivery>;
      }) => {
        const current = this.deliveries.find((item) => item.id === where.id);
        if (!current) {
          throw new Error("delivery not found");
        }
        Object.assign(current, data, { updatedAt: new Date() });
        return current;
      },
    ),
  };

  constructor(endpoints: FakeEndpoint[] = []) {
    this.endpoints = [...endpoints];
  }
}

type CreateEndpointData = Pick<
  FakeEndpoint,
  | "id"
  | "organizationId"
  | "url"
  | "status"
  | "secretReference"
  | "subscribedEvents"
>;

type CreateDeliveryData = Pick<
  FakeDelivery,
  | "id"
  | "organizationId"
  | "webhookEndpointId"
  | "eventId"
  | "eventType"
  | "attemptNumber"
  | "status"
>;

interface FakeEndpoint {
  id: string;
  organizationId: string;
  url: string;
  status: string;
  secretReference: string;
  subscribedEvents: unknown;
  createdAt: Date;
  updatedAt: Date;
}

interface FakeDelivery {
  id: string;
  organizationId: string;
  webhookEndpointId: string;
  eventId: string;
  eventType: string;
  attemptNumber: number;
  status: string;
  httpStatus: number | null;
  errorMessage: string | null;
  nextRetryAt: Date | null;
  deliveredAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

function credential(): PublicApiCredentialContext {
  return {
    apiKeyId: "api-key-1",
    keyPrefix: "selfx_test_abcdefghijkl",
    storeId: "store-1",
    storeName: "Store One",
    environment: "TEST",
    scopes: ["webhooks:manage"],
  };
}

function endpoint(overrides: Partial<FakeEndpoint> = {}): FakeEndpoint {
  const now = new Date("2026-08-29T12:00:00.000Z");
  return {
    id: "endpoint-1",
    organizationId: "store-1",
    url: "https://merchant.example.com/selfx/webhooks",
    status: "ACTIVE",
    secretReference: "derived:v1",
    subscribedEvents: ["try_on.completed", "try_on.failed"],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}
