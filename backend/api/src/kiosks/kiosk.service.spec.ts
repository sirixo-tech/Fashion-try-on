import { JwtService } from "@nestjs/jwt";
import {
  KioskAssignmentScope,
  KioskDeviceStatus,
  PlatformRole,
  PlatformRoleAssignmentStatus,
  OrganizationStatus,
  UserStatus,
} from "@prisma/client";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";

import { createSelfxId } from "@selfx/database";

import { ApiErrorException } from "../common/api-error.exception.js";
import { loadSelfxEnv } from "../config/load-env.js";
import { PrismaService } from "../database/prisma.service.js";
import { PLATFORM_PERMISSIONS } from "../platform/platform-permissions.js";
import { PlatformAuthorizationService } from "../platform/platform-authorization.service.js";
import { KIOSK_ERROR_CODES } from "./kiosk.constants.js";
import { canonicalPairingCode, KioskService } from "./kiosk.service.js";

loadSelfxEnv();

const kioskConfig = {
  pairingCodePepper: "test_pairing_code_pepper_32_chars_minimum",
  provisioningSecretPepper: "test_provisioning_secret_pepper_32_chars_minimum",
  deviceRefreshTokenPepper: "test_device_refresh_pepper_32_chars_minimum",
  customerUploadTokenPepper: "test_customer_upload_pepper_32_chars_minimum",
  deviceJwtSecret: "test_device_jwt_secret_32_chars_minimum",
  publicWebBaseUrl: "https://try.selfx.test",
  pairingTtlSeconds: 480,
  customerUploadTtlSeconds: 300,
  deviceAccessTokenTtlSeconds: 900,
  deviceRefreshSessionTtlSeconds: 3600,
};

describe("KIOSK-4A device provisioning", () => {
  let prisma: PrismaService;
  let service: KioskService;
  let platformAuth: PlatformAuthorizationService;
  let userIds: string[];
  let organizationIds: string[];
  let storeIds: string[];
  let pairingSessionIds: string[];

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    service = new KioskService(prisma, new JwtService(), kioskConfig);
    platformAuth = new PlatformAuthorizationService(prisma);
  });

  beforeEach(() => {
    userIds = [];
    organizationIds = [];
    storeIds = [];
    pairingSessionIds = [];
  });

  afterEach(async () => {
    await cleanup();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("validates exactly six numeric pairing code characters and preserves leading zeroes", () => {
    expect(canonicalPairingCode("004281")).toBe("004281");
    for (const value of ["ABC123", "12345", "1234567", "12-3456", "123 456"]) {
      expect(() => canonicalPairingCode(value)).toThrow(ApiErrorException);
    }
  });

  it("creates backend-generated six-digit sessions with exact 480 second expiry and no plaintext code storage", async () => {
    const session = await createPairingSession(
      { installationId: "install-a", platform: "windows", appVersion: "1.0.0" },
      "127.0.0.10",
    );
    expect(session.pairingCode).toMatch(/^\d{6}$/);
    expect(session.ttlSeconds).toBe(480);
    expect(
      Date.parse(session.expiresAt) - Date.parse(session.serverTime),
    ).toBe(480_000);

    const stored = await prisma.kioskPairingSession.findUniqueOrThrow({
      where: { id: session.pairingSessionId },
    });
    expect(stored.codeDigest).not.toBe(session.pairingCode);
    expect(stored.provisioningSecretHash).not.toBe(session.provisioningSecret);
  });

  it("expires old sessions and rotates to a new code automatically on the client-facing status path", async () => {
    const first = await createPairingSession({}, "127.0.0.11");
    await prisma.kioskPairingSession.update({
      where: { id: first.pairingSessionId },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    const status = await service.getPairingStatus(
      first.pairingSessionId,
      first.provisioningSecret,
    );
    expect(status.status).toBe("EXPIRED");

    const second = await createPairingSession({}, "127.0.0.12");
    expect(second.pairingSessionId).not.toBe(first.pairingSessionId);
    expect(second.pairingCode).toMatch(/^\d{6}$/);
  });

  it("rejects expired codes, replays and concurrent second claims", async () => {
    const admin = await createUser("super");
    await assignSuperAdmin(admin.id);
    const expired = await createPairingSession({}, "127.0.0.13");
    await prisma.kioskPairingSession.update({
      where: { id: expired.pairingSessionId },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    await expectApiCode(
      service.pairKiosk(admin.id, {
        pairingCode: expired.pairingCode,
        displayName: "Expired",
        assignmentScope: KioskAssignmentScope.PLATFORM,
      }),
      KIOSK_ERROR_CODES.pairingInvalid,
    );

    const active = await createPairingSession({}, "127.0.0.14");
    const attempts = await Promise.allSettled([
      service.pairKiosk(admin.id, {
        pairingCode: active.pairingCode,
        displayName: "One",
        assignmentScope: KioskAssignmentScope.PLATFORM,
      }),
      service.pairKiosk(admin.id, {
        pairingCode: active.pairingCode,
        displayName: "Two",
        assignmentScope: KioskAssignmentScope.PLATFORM,
      }),
    ]);
    expect(attempts.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    await expectApiCode(
      service.pairKiosk(admin.id, {
        pairingCode: active.pairingCode,
        displayName: "Replay",
        assignmentScope: KioskAssignmentScope.PLATFORM,
      }),
      KIOSK_ERROR_CODES.pairingInvalid,
    );
  });

  it("authorizes only superadmin for kiosk pairing in this phase", async () => {
    const support = await createUser("support");
    await prisma.platformRoleAssignment.create({
      data: {
        id: createSelfxId(),
        userId: support.id,
        role: PlatformRole.SELFX_SUPPORT_ADMIN,
        status: PlatformRoleAssignmentStatus.ACTIVE,
      },
    });
    await expectApiCode(
      platformAuth.requirePermission(support.id, PLATFORM_PERMISSIONS.kiosksPair),
      "PLATFORM_PERMISSION_DENIED",
    );

    const superadmin = await createUser("super-auth");
    await assignSuperAdmin(superadmin.id);
    await expect(
      platformAuth.requirePermission(superadmin.id, PLATFORM_PERMISSIONS.kiosksPair),
    ).resolves.toBeUndefined();
  });

  it("supports PLATFORM assignment and rejects invalid organization/store relationships", async () => {
    const admin = await createUser("assignment-admin");
    const org = await createOrganization("assignment-org");
    const otherOrg = await createOrganization("assignment-other");
    const store = await createStore(otherOrg.id, "cross-store");
    await assignSuperAdmin(admin.id);

    const platformSession = await createPairingSession({}, "127.0.0.15");
    const platformDevice = await service.pairKiosk(admin.id, {
      pairingCode: platformSession.pairingCode,
      displayName: "Platform Demo",
      assignmentScope: KioskAssignmentScope.PLATFORM,
    });
    expect(platformDevice.assignment.scope).toBe(KioskAssignmentScope.PLATFORM);
    expect(platformDevice.assignment.organizationId).toBeNull();

    const invalidStoreSession = await createPairingSession(
      {},
      "127.0.0.16",
    );
    await expectApiCode(
      service.pairKiosk(admin.id, {
        pairingCode: invalidStoreSession.pairingCode,
        displayName: "Bad Store",
        assignmentScope: KioskAssignmentScope.STORE,
        organizationId: org.id,
        storeId: store.id,
      }),
      KIOSK_ERROR_CODES.assignmentInvalid,
    );
  });

  it("requires provisioning secret, keeps browser pairing response credential-free and exchanges grant once", async () => {
    const admin = await createUser("grant-admin");
    await assignSuperAdmin(admin.id);
    const session = await createPairingSession({}, "127.0.0.17");

    await expectApiCode(
      service.getPairingStatus(session.pairingSessionId, undefined),
      KIOSK_ERROR_CODES.provisioningSecretInvalid,
    );

    const device = await service.pairKiosk(admin.id, {
      pairingCode: session.pairingCode,
      displayName: "Grant Kiosk",
      assignmentScope: KioskAssignmentScope.PLATFORM,
    });
    expect(JSON.stringify(device)).not.toContain("Token");

    const status = await service.getPairingStatus(
      session.pairingSessionId,
      session.provisioningSecret,
    );
    expect(status.status).toBe("PAIRED");
    expect(status.provisioningGrant).toBeTruthy();

    const credentials = await service.exchangeProvisioningGrant({
      pairingSessionId: session.pairingSessionId,
      provisioningSecret: session.provisioningSecret,
      provisioningGrant: status.provisioningGrant!,
    });
    expect(credentials.device.id).toBe(device.id);
    await expectApiCode(
      service.exchangeProvisioningGrant({
        pairingSessionId: session.pairingSessionId,
        provisioningSecret: session.provisioningSecret,
        provisioningGrant: status.provisioningGrant!,
      }),
      KIOSK_ERROR_CODES.provisioningGrantConsumed,
    );
  });

  it("uses dedicated device access token type, rotates refresh credentials and rejects revoked devices", async () => {
    const admin = await createUser("token-admin");
    await assignSuperAdmin(admin.id);
    const credentials = await pairedCredentials(admin.id);
    const payloadSegment = credentials.accessToken.split(".")[1];
    expect(payloadSegment).toBeTruthy();
    const payload = JSON.parse(
      Buffer.from(payloadSegment!, "base64url").toString("utf8"),
    ) as { typ: string; sub: string };
    expect(payload.typ).toBe("kiosk_device_access");

    const refreshed = await service.refreshDeviceSession(
      { refreshToken: credentials.refreshToken },
    );
    expect(refreshed.refreshToken).not.toBe(credentials.refreshToken);
    await expectApiCode(
      service.refreshDeviceSession({ refreshToken: credentials.refreshToken }),
      KIOSK_ERROR_CODES.deviceTokenInvalid,
    );

    await service.revokeDevice(admin.id, refreshed.device.id);
    await expectApiCode(
      service.refreshDeviceSession({ refreshToken: refreshed.refreshToken }),
      KIOSK_ERROR_CODES.deviceTokenInvalid,
    );
    await expectApiCode(
      service.me(`Bearer ${refreshed.accessToken}`),
      KIOSK_ERROR_CODES.deviceRevoked,
    );
  });

  it("supports inactive reactivation and soft deletion without listing deleted devices", async () => {
    const admin = await createUser("lifecycle-admin");
    await assignSuperAdmin(admin.id);
    const credentials = await pairedCredentials(admin.id);

    const inactive = await service.deactivateDevice(
      admin.id,
      credentials.device.id,
    );
    expect(inactive.status).toBe(KioskDeviceStatus.INACTIVE);
    expect(inactive.inactiveAt).toBeTruthy();
    await expectApiCode(
      service.refreshDeviceSession({ refreshToken: credentials.refreshToken }),
      KIOSK_ERROR_CODES.deviceInactive,
    );

    const active = await service.activateDevice(admin.id, credentials.device.id);
    expect(active.status).toBe(KioskDeviceStatus.ACTIVE);
    expect(active.inactiveAt).toBeNull();

    const refreshed = await service.refreshDeviceSession({
      refreshToken: credentials.refreshToken,
    });
    expect(refreshed.device.status).toBe(KioskDeviceStatus.ACTIVE);

    const deleted = await service.deleteDevice(admin.id, credentials.device.id);
    expect(deleted.status).toBe(KioskDeviceStatus.DELETED);
    expect(deleted.deletedAt).toBeTruthy();
    await expectApiCode(
      service.refreshDeviceSession({ refreshToken: refreshed.refreshToken }),
      KIOSK_ERROR_CODES.deviceTokenInvalid,
    );
    const listed = await service.listDevices();
    expect(listed.data.some((device) => device.id === deleted.id)).toBe(false);
  });

  it("session/me reloads current assignment from the database", async () => {
    const admin = await createUser("me-admin");
    const org = await createOrganization("me-org");
    await assignSuperAdmin(admin.id);
    const credentials = await pairedCredentials(admin.id);

    await prisma.kioskDevice.update({
      where: { id: credentials.device.id },
      data: {
        assignmentScope: KioskAssignmentScope.ORGANIZATION,
        organizationId: org.id,
      },
    });

    const current = await service.me(`Bearer ${credentials.accessToken}`);
    expect(current.assignment.scope).toBe(KioskAssignmentScope.ORGANIZATION);
    expect(current.assignment.organizationId).toBe(org.id);
  });

  async function pairedCredentials(adminUserId: string) {
    const session = await createPairingSession(
      {},
      `127.0.1.${userIds.length + 1}`,
    );
    await service.pairKiosk(adminUserId, {
      pairingCode: session.pairingCode,
      displayName: "Paired Kiosk",
      assignmentScope: KioskAssignmentScope.PLATFORM,
    });
    const status = await service.getPairingStatus(
      session.pairingSessionId,
      session.provisioningSecret,
    );
    return service.exchangeProvisioningGrant({
      pairingSessionId: session.pairingSessionId,
      provisioningSecret: session.provisioningSecret,
      provisioningGrant: status.provisioningGrant!,
    });
  }

  async function createUser(label: string) {
    const user = await prisma.user.create({
      data: {
        id: createSelfxId(),
        email: `${label}-${createSelfxId()}@selfx.test`,
        passwordHash: "not-used",
        displayName: label,
        status: UserStatus.ACTIVE,
      },
    });
    userIds.push(user.id);
    return user;
  }

  async function createPairingSession(
    input: Parameters<KioskService["createPairingSession"]>[0],
    ipAddress: string,
  ) {
    const session = await service.createPairingSession(input, ipAddress);
    pairingSessionIds.push(session.pairingSessionId);
    return session;
  }

  async function assignSuperAdmin(userId: string) {
    await prisma.platformRoleAssignment.create({
      data: {
        id: createSelfxId(),
        userId,
        role: PlatformRole.SELFX_SUPER_ADMIN,
        status: PlatformRoleAssignmentStatus.ACTIVE,
      },
    });
  }

  async function createOrganization(label: string) {
    const org = await prisma.organization.create({
      data: {
        id: createSelfxId(),
        name: label,
        slug: `${label}-${createSelfxId()}`,
        status: OrganizationStatus.ACTIVE,
      },
    });
    organizationIds.push(org.id);
    return org;
  }

  async function createStore(orgId: string, label: string) {
    const store = await prisma.store.create({
      data: {
        id: createSelfxId(),
        orgId,
        name: label,
        code: `${label}-${createSelfxId()}`,
      },
    });
    storeIds.push(store.id);
    return store;
  }

  async function cleanup() {
    const linkedDevices = await prisma.kioskPairingSession.findMany({
      where: { id: { in: pairingSessionIds } },
      select: { kioskDeviceId: true },
    });
    const deviceIds = linkedDevices
      .map((session) => session.kioskDeviceId)
      .filter((id): id is string => Boolean(id));
    await prisma.kioskDeviceSession.deleteMany({
      where: { kioskDeviceId: { in: deviceIds } },
    });
    await prisma.kioskCustomerUploadSession.deleteMany({
      where: { kioskDeviceId: { in: deviceIds } },
    });
    await prisma.kioskPairingSession.deleteMany({
      where: { id: { in: pairingSessionIds } },
    });
    await prisma.kioskDevice.deleteMany({ where: { id: { in: deviceIds } } });
    await prisma.auditLog.deleteMany({
      where: { OR: [{ actorUserId: { in: userIds } }, { resourceType: "kiosk_device" }] },
    });
    await prisma.platformRoleAssignment.deleteMany({
      where: { userId: { in: userIds } },
    });
    await prisma.store.deleteMany({ where: { id: { in: storeIds } } });
    await prisma.organization.deleteMany({
      where: { id: { in: organizationIds } },
    });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  }
});

async function expectApiCode(
  promise: Promise<unknown>,
  expectedCode: string,
): Promise<void> {
  await expect(promise).rejects.toMatchObject({
    response: { error: { code: expectedCode } },
  });
}
