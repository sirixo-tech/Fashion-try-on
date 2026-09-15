import { ImpersonationSessionStatus, OrganizationStatus } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import { ApiErrorException } from "../common/api-error.exception.js";
import {
  STORE_IMPERSONATION_ERROR_CODES,
  StoreImpersonationService,
} from "./store-impersonation.service.js";

describe("StoreImpersonationService", () => {
  it("starts a short-lived internal impersonation session without tenant-visible audit scope", async () => {
    const prisma = createPrismaMock();
    const service = new StoreImpersonationService(prisma as never);
    prisma.organization.findFirst.mockResolvedValue({
      id: "store-1",
      name: "Retail Store",
      slug: "retail-store",
    });
    prisma.impersonationSession.create.mockResolvedValue(
      sessionRecord({
        id: "session-1",
        actorUserId: "admin-1",
        targetStoreId: "store-1",
      }),
    );

    const result = await service.startSession("admin-1", "store-1");

    expect(prisma.organization.findFirst).toHaveBeenCalledWith({
      where: {
        id: "store-1",
        status: { not: OrganizationStatus.ARCHIVED },
      },
      select: { id: true, name: true, slug: true },
    });
    expect(prisma.impersonationSession.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorUserId: "admin-1",
        targetStoreId: "store-1",
      }),
      include: expect.any(Object),
    });
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorUserId: "admin-1",
        action: "IMPERSONATION_SESSION_STARTED",
        resourceType: "impersonation_session",
        metadata: { target_store_id: "store-1" },
      }),
    });
    const auditData = prisma.auditLog.create.mock.calls[0]?.[0]?.data;
    expect(auditData).not.toHaveProperty("organizationId");
    expect(auditData).not.toHaveProperty("storeId");
    expect(result.session).toMatchObject({
      id: "session-1",
      actorUserId: "admin-1",
      targetStoreId: "store-1",
      targetStoreName: "Retail Store",
      status: ImpersonationSessionStatus.ACTIVE,
      endedAt: null,
    });
  });

  it("rejects missing or archived target Stores", async () => {
    const prisma = createPrismaMock();
    const service = new StoreImpersonationService(prisma as never);
    prisma.organization.findFirst.mockResolvedValue(null);

    await expectApiCode(
      service.startSession("admin-1", "store-1"),
      STORE_IMPERSONATION_ERROR_CODES.storeNotFound,
    );
    expect(prisma.impersonationSession.create).not.toHaveBeenCalled();
  });

  it("reads only active unexpired sessions for the actor", async () => {
    const prisma = createPrismaMock();
    const service = new StoreImpersonationService(prisma as never);
    prisma.impersonationSession.findFirst.mockResolvedValue(
      sessionRecord({ id: "session-1", actorUserId: "admin-1" }),
    );

    const current = await service.currentSession("admin-1", "session-1");

    expect(prisma.impersonationSession.updateMany).toHaveBeenCalledWith({
      where: {
        status: ImpersonationSessionStatus.ACTIVE,
        endedAt: null,
        expiresAt: { lte: expect.any(Date) },
      },
      data: { status: ImpersonationSessionStatus.EXPIRED },
    });
    expect(prisma.impersonationSession.findFirst).toHaveBeenCalledWith({
      where: {
        actorUserId: "admin-1",
        id: "session-1",
        status: ImpersonationSessionStatus.ACTIVE,
        endedAt: null,
        expiresAt: { gt: expect.any(Date) },
        targetStore: {
          status: { not: OrganizationStatus.ARCHIVED },
        },
      },
      include: expect.any(Object),
      orderBy: { startedAt: "desc" },
    });
    expect(current.session?.id).toBe("session-1");
  });

  it("ends only sessions owned by the actor and records an internal audit event", async () => {
    const prisma = createPrismaMock();
    const service = new StoreImpersonationService(prisma as never);
    prisma.impersonationSession.findFirst.mockResolvedValue(
      sessionRecord({
        id: "session-1",
        actorUserId: "admin-1",
        targetStoreId: "store-1",
      }),
    );
    prisma.impersonationSession.update.mockResolvedValue(
      sessionRecord({
        id: "session-1",
        actorUserId: "admin-1",
        targetStoreId: "store-1",
        status: ImpersonationSessionStatus.ENDED,
        endedAt: new Date("2026-09-13T10:10:00.000Z"),
      }),
    );

    const ended = await service.endSession("admin-1", "session-1");

    expect(prisma.impersonationSession.findFirst).toHaveBeenCalledWith({
      where: { id: "session-1", actorUserId: "admin-1" },
      include: expect.any(Object),
    });
    expect(prisma.impersonationSession.update).toHaveBeenCalledWith({
      where: { id: "session-1" },
      data: {
        status: ImpersonationSessionStatus.ENDED,
        endedAt: expect.any(Date),
      },
      include: expect.any(Object),
    });
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorUserId: "admin-1",
        action: "IMPERSONATION_SESSION_ENDED",
        resourceType: "impersonation_session",
        resourceId: "session-1",
        metadata: { target_store_id: "store-1" },
      }),
    });
    expect(ended.session.status).toBe(ImpersonationSessionStatus.ENDED);
  });

  it("does not end another admin's impersonation session", async () => {
    const prisma = createPrismaMock();
    const service = new StoreImpersonationService(prisma as never);
    prisma.impersonationSession.findFirst.mockResolvedValue(null);

    await expectApiCode(
      service.endSession("admin-1", "session-1"),
      STORE_IMPERSONATION_ERROR_CODES.sessionNotFound,
    );
    expect(prisma.impersonationSession.update).not.toHaveBeenCalled();
  });

  it("resolves Store context when impersonation targets the requested Store", async () => {
    const prisma = createPrismaMock();
    const service = new StoreImpersonationService(prisma as never);
    prisma.impersonationSession.findFirst.mockResolvedValue(
      sessionRecord({
        id: "session-1",
        actorUserId: "admin-1",
        targetStoreId: "store-1",
      }),
    );

    const context = await service.resolveStoreContext("admin-1", "store-1");

    expect(context).toMatchObject({
      actorUserId: "admin-1",
      effectiveStoreId: "store-1",
      impersonationSession: {
        id: "session-1",
        targetStoreId: "store-1",
      },
    });
  });

  it("blocks Store-scoped requests outside the active impersonation target", async () => {
    const prisma = createPrismaMock();
    const service = new StoreImpersonationService(prisma as never);
    prisma.impersonationSession.findFirst.mockResolvedValue(
      sessionRecord({
        id: "session-1",
        actorUserId: "admin-1",
        targetStoreId: "store-1",
      }),
    );

    await expectApiCode(
      service.resolveStoreContext("admin-1", "store-2"),
      STORE_IMPERSONATION_ERROR_CODES.storeMismatch,
    );
  });
});

function createPrismaMock() {
  const prisma = {
    organization: {
      findFirst: vi.fn(),
    },
    impersonationSession: {
      create: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    auditLog: {
      create: vi.fn(),
    },
    $transaction: vi.fn(async (callback: (transaction: never) => unknown) =>
      callback(prisma as never),
    ),
  };
  return prisma;
}

function sessionRecord(
  overrides: Partial<{
    id: string;
    actorUserId: string;
    targetStoreId: string;
    status: ImpersonationSessionStatus;
    startedAt: Date;
    expiresAt: Date;
    endedAt: Date | null;
  }> = {},
) {
  return {
    id: overrides.id ?? "session-1",
    actorUserId: overrides.actorUserId ?? "admin-1",
    targetStoreId: overrides.targetStoreId ?? "store-1",
    status: overrides.status ?? ImpersonationSessionStatus.ACTIVE,
    startedAt:
      overrides.startedAt ?? new Date("2026-09-13T10:00:00.000Z"),
    expiresAt:
      overrides.expiresAt ?? new Date("2026-09-13T10:30:00.000Z"),
    endedAt: overrides.endedAt ?? null,
    targetStore: {
      id: overrides.targetStoreId ?? "store-1",
      name: "Retail Store",
      slug: "retail-store",
    },
  };
}

async function expectApiCode(
  promise: Promise<unknown>,
  code: string,
): Promise<void> {
  await expect(promise).rejects.toBeInstanceOf(ApiErrorException);
  await expect(promise).rejects.toMatchObject({
    response: expect.objectContaining({
      error: expect.objectContaining({ code }),
    }),
  });
}
