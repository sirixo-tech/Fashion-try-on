import { KioskAssignmentScope, Prisma } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import {
  KIOSK_USAGE_EVENTS,
  UsageEventService,
} from "./usage-event.service.js";

describe("UsageEventService", () => {
  it("records privacy-safe kiosk usage with platform attribution", async () => {
    const prisma = new FakePrisma();
    const service = new UsageEventService(prisma as never);

    await service.recordKioskEvent({
      eventName: KIOSK_USAGE_EVENTS.sessionStarted,
      idempotencyKey: "kiosk-session-started:session-1",
      device: {
        id: "kiosk-1",
        assignmentScope: KioskAssignmentScope.PLATFORM,
        organizationId: "org-ignored",
        storeId: "store-ignored",
      },
      tryOnSessionId: "session-1",
      status: "ACTIVE",
    });

    expect(prisma.createdEvents[0]).toMatchObject({
      eventName: KIOSK_USAGE_EVENTS.sessionStarted,
      channel: "KIOSK",
      assignmentScope: KioskAssignmentScope.PLATFORM,
      organizationId: null,
      storeId: null,
      kioskDeviceId: "kiosk-1",
      tryOnSessionId: "session-1",
      status: "ACTIVE",
    });
    expect(prisma.createdEvents[0]).not.toHaveProperty("customerId");
  });

  it("records store-owned kiosk attribution", async () => {
    const prisma = new FakePrisma();
    const service = new UsageEventService(prisma as never);

    await service.recordKioskEvent({
      eventName: KIOSK_USAGE_EVENTS.tryOnGenerated,
      idempotencyKey: "kiosk-try-on-generated:run-1",
      device: {
        id: "kiosk-1",
        assignmentScope: KioskAssignmentScope.STORE,
        organizationId: "store-tenant-1",
        storeId: "store-location-1",
      },
      tryOnSessionId: "session-1",
      kioskTryOnRunId: "run-1",
      tryOnLookId: "look-1",
      productId: "product-1",
      provider: "google",
      providerModel: "virtual-try-on-001",
      status: "COMPLETED",
    });

    expect(prisma.createdEvents[0]).toMatchObject({
      assignmentScope: KioskAssignmentScope.STORE,
      organizationId: "store-tenant-1",
      storeId: "store-location-1",
      kioskDeviceId: "kiosk-1",
      kioskTryOnRunId: "run-1",
      tryOnLookId: "look-1",
      productId: "product-1",
      provider: "google",
      providerModel: "virtual-try-on-001",
    });
  });

  it("returns the existing event when the idempotency key already exists", async () => {
    const prisma = new FakePrisma();
    const service = new UsageEventService(prisma as never);

    const first = await service.recordKioskEvent({
      eventName: KIOSK_USAGE_EVENTS.downloadCompleted,
      idempotencyKey: "kiosk-look-downloaded:look-1",
      device: {
        id: "kiosk-1",
        assignmentScope: KioskAssignmentScope.PLATFORM,
        organizationId: null,
        storeId: null,
      },
      tryOnLookId: "look-1",
    });
    const second = await service.recordKioskEvent({
      eventName: KIOSK_USAGE_EVENTS.downloadCompleted,
      idempotencyKey: "kiosk-look-downloaded:look-1",
      device: {
        id: "kiosk-1",
        assignmentScope: KioskAssignmentScope.PLATFORM,
        organizationId: null,
        storeId: null,
      },
      tryOnLookId: "look-1",
    });

    expect(second).toBe(first);
    expect(prisma.createdEvents).toHaveLength(1);
  });
});

class FakePrisma {
  private readonly events = new Map<string, FakeUsageEvent>();
  readonly createdEvents: FakeUsageEvent[] = [];

  readonly usageEvent = {
    create: vi.fn(async ({ data }: { data: FakeUsageEventInput }) => {
      if (this.events.has(data.idempotencyKey)) {
        throw new Prisma.PrismaClientKnownRequestError("Unique constraint", {
          code: "P2002",
          clientVersion: "test",
        });
      }
      const event: FakeUsageEvent = {
        ...data,
        quantity: data.quantity ?? 1,
        occurredAt: data.occurredAt ?? new Date(),
        createdAt: new Date(),
      };
      this.events.set(event.idempotencyKey, event);
      this.createdEvents.push(event);
      return event;
    }),
    findUniqueOrThrow: vi.fn(
      async ({ where }: { where: { idempotencyKey: string } }) => {
        const event = this.events.get(where.idempotencyKey);
        if (!event) {
          throw new Error("usage event not found");
        }
        return event;
      },
    ),
  };
}

interface FakeUsageEventInput {
  id: string;
  idempotencyKey: string;
  eventName: string;
  channel: string;
  assignmentScope: KioskAssignmentScope | null;
  organizationId: string | null;
  storeId: string | null;
  kioskDeviceId: string;
  tryOnSessionId?: string | null;
  kioskTryOnRunId?: string | null;
  tryOnLookId?: string | null;
  productId?: string | null;
  provider?: string | null;
  providerModel?: string | null;
  status?: string | null;
  quantity?: number;
  metadata?: Prisma.InputJsonValue;
  occurredAt?: Date;
}

type FakeUsageEvent = FakeUsageEventInput & {
  quantity: number;
  occurredAt: Date;
  createdAt: Date;
};
