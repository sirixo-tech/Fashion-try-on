import { HttpStatus } from "@nestjs/common";
import {
  KioskAssignmentScope,
  KioskDeviceStatus,
  OrganizationStatus,
  Prisma,
} from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import { ApiErrorException } from "../common/api-error.exception.js";
import { PLATFORM_PERMISSIONS } from "../platform/platform-permissions.js";
import { AdminStoresController } from "./admin-stores.controller.js";
import {
  AdminStoresService,
  STORE_ERROR_CODES,
} from "./admin-stores.service.js";
import { AdminStoreStatus } from "./dto/admin-store.dto.js";

describe("STORE-1 admin Stores", () => {
  it("creates a product Store as an active internal tenant row with Store profile settings", async () => {
    const prisma = createPrismaMock();
    const rbac = createRbacMock();
    const service = new AdminStoresService(
      prisma as never,
      createKioskMock() as never,
      rbac as never,
      createGarmentPreviewSettingsMock() as never,
    );
    prisma.organization.create.mockResolvedValue(
      organizationRecord({
        name: "SelfX Demo",
        slug: "selfx-demo",
        settings: {
          storeProfile: {
            contactEmail: "ops@example.com",
            city: "Bengaluru",
          },
        },
      }),
    );

    const store = await service.createStore({
      name: "SelfX Demo",
      slug: "selfx-demo",
      contactEmail: "ops@example.com",
      city: "Bengaluru",
      timezone: "Asia/Kolkata",
    });

    expect(prisma.organization.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        name: "SelfX Demo",
        slug: "selfx-demo",
        status: OrganizationStatus.ACTIVE,
        timezone: "Asia/Kolkata",
        settings: expect.objectContaining({
          storeProfile: expect.objectContaining({
            contactEmail: "ops@example.com",
            city: "Bengaluru",
          }),
        }),
      }),
    });
    expect(store.status).toBe(AdminStoreStatus.ACTIVE);
    expect(store.internalLegacyModel).toBe("ORGANIZATION_AS_STORE");
    expect(rbac.ensureStoreRbacInTransaction).toHaveBeenCalledWith(
      expect.any(Object),
      "store-1",
      true,
    );
  });

  it("pairs from a Store route through the existing kiosk service using Store-as-tenant assignment", async () => {
    const prisma = createPrismaMock();
    const kiosks = createKioskMock();
    const service = new AdminStoresService(
      prisma as never,
      kiosks as never,
      createRbacMock() as never,
      createGarmentPreviewSettingsMock() as never,
    );
    prisma.organization.findUnique.mockResolvedValue(
      organizationRecord({
        id: "store-active",
        status: OrganizationStatus.ACTIVE,
      }),
    );
    kiosks.pairKiosk.mockResolvedValue(
      deviceResponse({ organizationId: "store-active" }),
    );

    const response = await service.pairStoreKiosk("actor-1", "store-active", {
      pairingCode: "123456",
      displayName: "Front kiosk",
    });

    expect(kiosks.pairKiosk).toHaveBeenCalledWith(
      "actor-1",
      expect.objectContaining({
        pairingCode: "123456",
        displayName: "Front kiosk",
        assignmentScope: KioskAssignmentScope.ORGANIZATION,
        organizationId: "store-active",
      }),
    );
    expect(response.device.assignment.scope).toBe(
      KioskAssignmentScope.ORGANIZATION,
    );
    expect(response.device.assignment.organizationId).toBe("store-active");
  });

  it("blocks inactive Stores from new kiosk pairing", async () => {
    const prisma = createPrismaMock();
    const kiosks = createKioskMock();
    const service = new AdminStoresService(
      prisma as never,
      kiosks as never,
      createRbacMock() as never,
      createGarmentPreviewSettingsMock() as never,
    );
    prisma.organization.findUnique.mockResolvedValue(
      organizationRecord({
        id: "store-inactive",
        status: OrganizationStatus.SUSPENDED,
      }),
    );

    await expectApiCode(
      service.pairStoreKiosk("actor-1", "store-inactive", {
        pairingCode: "123456",
        displayName: "Front kiosk",
      }),
      STORE_ERROR_CODES.storeInactive,
    );
    expect(kiosks.pairKiosk).not.toHaveBeenCalled();
  });

  it("rejects nested kiosk reads when the kiosk belongs to another Store", async () => {
    const prisma = createPrismaMock();
    const service = new AdminStoresService(
      prisma as never,
      createKioskMock() as never,
      createRbacMock() as never,
      createGarmentPreviewSettingsMock() as never,
    );
    prisma.organization.findUnique.mockResolvedValue(
      organizationRecord({ id: "store-a" }),
    );
    prisma.kioskDevice.findUnique.mockResolvedValue(
      deviceRecord({ id: "kiosk-1", organizationId: "store-b" }),
    );

    await expectApiCode(
      service.getStoreKiosk("store-a", "kiosk-1"),
      STORE_ERROR_CODES.kioskStoreMismatch,
    );
  });

  it("moves a kiosk into a Store without deleting device configuration", async () => {
    const prisma = createPrismaMock();
    const service = new AdminStoresService(
      prisma as never,
      createKioskMock() as never,
      createRbacMock() as never,
      createGarmentPreviewSettingsMock() as never,
    );
    prisma.organization.findUnique.mockResolvedValue(
      organizationRecord({
        id: "store-target",
        status: OrganizationStatus.ACTIVE,
      }),
    );
    prisma.kioskDevice.findUnique.mockResolvedValue(
      deviceRecord({ id: "kiosk-1" }),
    );
    prisma.kioskDevice.update.mockResolvedValue(
      deviceRecord({
        id: "kiosk-1",
        organizationId: "store-target",
        configuration: { version: 7 },
      }),
    );

    const moved = await service.assignKioskToStore(
      "actor-1",
      "store-target",
      "kiosk-1",
    );

    expect(prisma.kioskDevice.update).toHaveBeenCalledWith({
      where: { id: "kiosk-1" },
      data: {
        assignmentScope: KioskAssignmentScope.ORGANIZATION,
        organizationId: "store-target",
        storeId: null,
      },
      include: expect.any(Object),
    });
    expect(moved.latestConfigurationVersion).toBe(7);
  });

  it("maps duplicate internal slugs to a Store slug conflict", async () => {
    const prisma = createPrismaMock();
    const service = new AdminStoresService(
      prisma as never,
      createKioskMock() as never,
      createRbacMock() as never,
      createGarmentPreviewSettingsMock() as never,
    );
    prisma.organization.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("Unique failed", {
        code: "P2002",
        clientVersion: "test",
      }),
    );

    await expectApiCode(
      service.createStore({ name: "Duplicate", slug: "duplicate" }),
      STORE_ERROR_CODES.storeSlugConflict,
    );
  });

  it("requires platform Store permissions before creating a Store", async () => {
    const stores = { createStore: vi.fn() };
    const platformAuthorization = {
      requirePermission: vi
        .fn()
        .mockRejectedValue(
          new ApiErrorException(
            HttpStatus.FORBIDDEN,
            "PLATFORM_PERMISSION_DENIED",
            "Platform permission denied.",
          ),
        ),
    };
    const controller = new AdminStoresController(
      {
        requireAccessUser: vi.fn().mockResolvedValue({ id: "support-user" }),
      } as never,
      platformAuthorization as never,
      stores as never,
      {} as never,
      createRbacMock() as never,
    );

    await expectApiCode(
      controller.create(
        { headers: { authorization: "Bearer support" } } as never,
        { name: "Blocked Store", slug: "blocked-store" },
      ),
      "PLATFORM_PERMISSION_DENIED",
    );
    expect(platformAuthorization.requirePermission).toHaveBeenCalledWith(
      "support-user",
      PLATFORM_PERMISSIONS.storesCreate,
    );
    expect(stores.createStore).not.toHaveBeenCalled();
  });

  it("checks Store-owned kiosk membership before reading nested configuration", async () => {
    const stores = {
      requireKioskInStore: vi
        .fn()
        .mockRejectedValue(
          new ApiErrorException(
            HttpStatus.NOT_FOUND,
            STORE_ERROR_CODES.kioskStoreMismatch,
            "Kiosk device was not found for this store.",
          ),
        ),
    };
    const configurations = { getAdminConfiguration: vi.fn() };
    const controller = new AdminStoresController(
      {
        requireAccessUser: vi.fn().mockResolvedValue({ id: "super-user" }),
      } as never,
      {
        requirePermission: vi.fn().mockResolvedValue(undefined),
        hasPermission: vi.fn().mockResolvedValue(true),
      } as never,
      stores as never,
      configurations as never,
      createRbacMock() as never,
    );

    await expectApiCode(
      controller.getKioskConfiguration(
        { headers: { authorization: "Bearer super" } } as never,
        "store-a",
        "kiosk-b",
      ),
      STORE_ERROR_CODES.kioskStoreMismatch,
    );
    expect(configurations.getAdminConfiguration).not.toHaveBeenCalled();
  });

  it("allows Store-scoped kiosk configuration through Store RBAC without platform authority", async () => {
    const stores = {
      requireKioskInStore: vi.fn().mockResolvedValue(undefined),
    };
    const configurations = {
      updateAdminConfiguration: vi.fn().mockResolvedValue({ version: 2 }),
    };
    const rbac = createRbacMock();
    const controller = new AdminStoresController(
      {
        requireAccessUser: vi.fn().mockResolvedValue({ id: "store-user" }),
      } as never,
      {
        requirePermission: vi.fn(),
        hasPermission: vi.fn().mockResolvedValue(false),
      } as never,
      stores as never,
      configurations as never,
      rbac as never,
    );

    await expect(
      controller.updateKioskConfiguration(
        { headers: { authorization: "Bearer store" } } as never,
        "store-a",
        "kiosk-a",
        { display: { ctaLabel: "Start" } } as never,
      ),
    ).resolves.toMatchObject({ version: 2 });
    expect(rbac.requireStorePermission).toHaveBeenCalledWith(
      "store-user",
      "store-a",
      "kiosks.configure",
    );
    expect(stores.requireKioskInStore).toHaveBeenCalledWith(
      "store-a",
      "kiosk-a",
    );
  });
});

function createPrismaMock() {
  const tx = {
    organization: {
      create: vi.fn(),
    },
    kioskDevice: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
    },
  };
  const prisma = {
    organization: {
      count: vi.fn(),
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    kioskDevice: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      groupBy: vi.fn().mockResolvedValue([]),
      update: vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
    },
    $transaction: vi.fn(async (callback: (transaction: typeof tx) => unknown) =>
      callback(tx),
    ),
  };
  tx.organization.create = prisma.organization.create;
  tx.kioskDevice.findUnique = prisma.kioskDevice.findUnique;
  tx.kioskDevice.update = prisma.kioskDevice.update;
  tx.auditLog.create = prisma.auditLog.create;
  return prisma;
}

function createKioskMock() {
  return {
    pairKiosk: vi.fn(),
  };
}

function createRbacMock() {
  return {
    ensureStoreRbac: vi.fn(),
    ensureStoreRbacInTransaction: vi.fn(),
    requireStorePermission: vi.fn(),
  };
}

function createGarmentPreviewSettingsMock() {
  return {
    storeSettings: vi.fn(),
    storeSettingsFromValue: vi.fn(),
  };
}

function organizationRecord(
  overrides: Partial<ReturnType<typeof organizationRecordBase>> = {},
) {
  return { ...organizationRecordBase(), ...overrides };
}

function organizationRecordBase() {
  const now = new Date("2026-01-01T00:00:00.000Z");
  return {
    id: "store-1",
    name: "Demo Store",
    slug: "demo-store",
    status: OrganizationStatus.ACTIVE as OrganizationStatus,
    timezone: "UTC",
    settings: {},
    createdAt: now,
    updatedAt: now,
  };
}

function deviceRecord(
  overrides: Partial<ReturnType<typeof deviceRecordBase>> = {},
) {
  return { ...deviceRecordBase(), ...overrides };
}

function deviceResponse(overrides: { organizationId?: string } = {}) {
  const now = "2026-01-01T00:00:00.000Z";
  const organizationId = overrides.organizationId ?? "store-1";
  return {
    id: "kiosk-1",
    displayName: "Front kiosk",
    status: KioskDeviceStatus.ACTIVE,
    assignment: {
      scope: KioskAssignmentScope.ORGANIZATION,
      organizationId,
      organizationName: "Demo Store",
      storeId: null,
      storeName: null,
    },
    platform: "android",
    appVersion: "1.0.0",
    installationId: "install-1",
    pairedAt: now,
    lastSeenAt: null,
    inactiveAt: null,
    revokedAt: null,
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
    latestConfigurationVersion: 1,
  };
}

function deviceRecordBase() {
  const now = new Date("2026-01-01T00:00:00.000Z");
  return {
    id: "kiosk-1",
    displayName: "Front kiosk",
    status: KioskDeviceStatus.ACTIVE,
    assignmentScope: KioskAssignmentScope.ORGANIZATION,
    organizationId: "store-1",
    storeId: null,
    platform: "android",
    appVersion: "1.0.0",
    installationId: "install-1",
    pairedAt: now,
    lastSeenAt: null,
    inactiveAt: null,
    revokedAt: null,
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
    organization: { id: "store-1", name: "Demo Store" },
    store: null,
    configuration: { version: 1 },
  };
}

async function expectApiCode(
  promise: Promise<unknown>,
  code: string,
): Promise<void> {
  await expect(promise).rejects.toMatchObject({
    response: expect.objectContaining({
      error: expect.objectContaining({ code }),
    }),
  });
}
