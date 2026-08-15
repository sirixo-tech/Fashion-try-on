import { JwtService } from "@nestjs/jwt";
import {
  KioskAssignmentScope,
  KioskCustomerUploadPurpose,
  KioskCustomerUploadSessionStatus,
  PlatformRole,
  PlatformRoleAssignmentStatus,
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

import { loadSelfxEnv } from "../config/load-env.js";
import { PrismaService } from "../database/prisma.service.js";
import type { ObjectStorageService } from "../storage/object-storage.js";
import {
  KIOSK_CUSTOMER_UPLOAD_MAX_IMAGE_BYTES,
  KIOSK_ERROR_CODES,
} from "./kiosk.constants.js";
import { KioskCustomerUploadDeviceController } from "./kiosk-customer-upload.controller.js";
import { KioskCustomerUploadService } from "./kiosk-customer-upload.service.js";
import { KioskService } from "./kiosk.service.js";

loadSelfxEnv();

const tinyPng = Buffer.from(
  "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c636000000200015d0b2a0b0000000049454e44ae426082",
  "hex",
);

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

describe("KIOSK-4C customer mobile upload sessions", () => {
  let prisma: PrismaService;
  let storage: FakeObjectStorage;
  let kiosks: KioskService;
  let uploads: KioskCustomerUploadService;
  let controller: KioskCustomerUploadDeviceController;
  let userIds: string[];
  let pairingSessionIds: string[];
  let deviceIds: string[];

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
  });

  beforeEach(() => {
    storage = new FakeObjectStorage();
    kiosks = new KioskService(prisma, new JwtService(), kioskConfig);
    uploads = new KioskCustomerUploadService(
      prisma,
      storage as unknown as ObjectStorageService,
      kioskConfig,
    );
    controller = new KioskCustomerUploadDeviceController(kiosks, uploads);
    userIds = [];
    pairingSessionIds = [];
    deviceIds = [];
  });

  afterEach(async () => {
    await cleanup();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("allows only an ACTIVE authenticated kiosk device to create a customer upload session", async () => {
    const credentials = await pairedCredentials("active-upload");
    const created = await controller.create(`Bearer ${credentials.accessToken}`);

    expect(created.status).toBe(KioskCustomerUploadSessionStatus.WAITING);
    expect(created.publicUploadUrl).toMatch(
      /^https:\/\/try\.selfx\.test\/upload\/[A-Za-z0-9_-]+$/,
    );

    await kiosks.revokeDevice(userIds[0]!, credentials.device.id);
    await expectApiCode(
      controller.create(`Bearer ${credentials.accessToken}`),
      KIOSK_ERROR_CODES.deviceRevoked,
    );
  });

  it("stores a protected capability digest, not the plaintext QR token, with exact 300 second expiry", async () => {
    const credentials = await pairedCredentials("digest-upload");
    const created = await controller.create(`Bearer ${credentials.accessToken}`);
    const capability = created.publicUploadUrl.split("/").pop()!;
    expect(capability.length).toBeGreaterThan(32);

    const stored = await prisma.kioskCustomerUploadSession.findUniqueOrThrow({
      where: { id: created.sessionId },
    });
    expect(stored.capabilityDigest).not.toBe(capability);
    expect(
      Date.parse(created.expiresAt) - Date.parse(created.serverTime),
    ).toBe(300_000);
  });

  it("persists and returns the purpose for garment upload sessions", async () => {
    const credentials = await pairedCredentials("garment-purpose-upload");
    const created = await controller.create(
      `Bearer ${credentials.accessToken}`,
      "GARMENT",
    );

    expect(created.purpose).toBe(KioskCustomerUploadPurpose.GARMENT);

    const stored = await prisma.kioskCustomerUploadSession.findUniqueOrThrow({
      where: { id: created.sessionId },
    });
    expect(stored.purpose).toBe(KioskCustomerUploadPurpose.GARMENT);

    const publicStatus = await uploads.publicStatus(
      created.publicUploadUrl.split("/").pop()!,
      "127.0.4.30",
    );
    expect(publicStatus.purpose).toBe(KioskCustomerUploadPurpose.GARMENT);
  });

  it("does not consume a ready garment upload as a model upload", async () => {
    const { sessionId, device } = await createUploadSession(
      "purpose-mismatch",
      KioskCustomerUploadPurpose.GARMENT,
    );
    await prisma.kioskCustomerUploadSession.update({
      where: { id: sessionId },
      data: {
        status: KioskCustomerUploadSessionStatus.READY,
        assetKey: `customer-uploads/${sessionId}/garment-original.png`,
        contentType: "image/png",
        sizeBytes: tinyPng.length,
        width: 1,
        height: 1,
        readyAt: new Date(),
      },
    });

    await expectApiCode(
      uploads.consumeForDevice(
        device,
        sessionId,
        KioskCustomerUploadPurpose.MODEL,
      ),
      KIOSK_ERROR_CODES.customerUploadPurposeMismatch,
    );
  });

  it("rejects expired capabilities for upload intent", async () => {
    const { capability, sessionId } = await createUploadSession("expired");
    await prisma.kioskCustomerUploadSession.update({
      where: { id: sessionId },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    await expectApiCode(
      uploads.createUploadIntent(
        capability,
        { contentType: "image/png", sizeBytes: tinyPng.length },
        "127.0.4.1",
      ),
      KIOSK_ERROR_CODES.customerUploadExpired,
    );
  });

  it("creates a signed upload URL for only the server-generated object key", async () => {
    const { capability, sessionId } = await createUploadSession("intent");

    const intent = await uploads.createUploadIntent(
      capability,
      { contentType: "image/png", sizeBytes: tinyPng.length },
      "127.0.4.2",
    );

    expect(intent.uploadUrl).toContain(
      `/customer-uploads/${sessionId}/person-original.png`,
    );
    expect(intent.headers).toEqual({ "Content-Type": "image/png" });
    expect(storage.lastUploadKey).toBe(
      `customer-uploads/${sessionId}/person-original.png`,
    );
  });

  it("rejects oversized and unsupported upload intents before signing storage access", async () => {
    const { capability } = await createUploadSession("oversized");

    await expectApiCode(
      uploads.createUploadIntent(
        capability,
        {
          contentType: "image/png",
          sizeBytes: KIOSK_CUSTOMER_UPLOAD_MAX_IMAGE_BYTES + 1,
        },
        "127.0.4.3",
      ),
      KIOSK_ERROR_CODES.customerUploadRejected,
    );

    await expectApiCode(
      uploads.createUploadIntent(
        capability,
        { contentType: "text/plain", sizeBytes: 10 },
        "127.0.4.4",
      ),
      KIOSK_ERROR_CODES.customerUploadRejected,
    );
  });

  it("validates the stored object before READY and returns a short-lived read URL", async () => {
    const { capability, sessionId, device } = await createUploadSession("ready");
    await uploads.createUploadIntent(
      capability,
      { contentType: "image/png", sizeBytes: tinyPng.length },
      "127.0.4.5",
    );
    storage.put(`customer-uploads/${sessionId}/person-original.png`, {
      contentType: "image/png",
      body: tinyPng,
    });

    const complete = await uploads.completeUpload(capability, "127.0.4.6");
    expect(complete.status).toBe(KioskCustomerUploadSessionStatus.READY);

    const status = await uploads.getForDevice(device, sessionId);
    expect(status.photo?.readUrl).toContain(
      `/customer-uploads/${sessionId}/person-original.png`,
    );
    expect(status.photo?.width).toBe(1);
    expect(status.photo?.height).toBe(1);
    expect(status.photo?.sizeBytes).toBe(tinyPng.length);
  });

  it("rejects corrupt stored objects and never marks them READY", async () => {
    const { capability, sessionId } = await createUploadSession("corrupt");
    await uploads.createUploadIntent(
      capability,
      { contentType: "image/png", sizeBytes: tinyPng.length },
      "127.0.4.7",
    );
    storage.put(`customer-uploads/${sessionId}/person-original.png`, {
      contentType: "image/png",
      body: Buffer.from("not-an-image"),
    });

    const complete = await uploads.completeUpload(capability, "127.0.4.8");
    expect(complete.status).toBe(KioskCustomerUploadSessionStatus.REJECTED);
    const stored = await prisma.kioskCustomerUploadSession.findUniqueOrThrow({
      where: { id: sessionId },
    });
    expect(stored.readyAt).toBeNull();
    expect(stored.rejectionCode).toBeTruthy();
  });

  it("does not allow a cancelled upload session to become READY", async () => {
    const { capability, sessionId, device } = await createUploadSession("cancel");
    await uploads.createUploadIntent(
      capability,
      { contentType: "image/png", sizeBytes: tinyPng.length },
      "127.0.4.9",
    );
    await uploads.cancelForDevice(device, sessionId);

    await expectApiCode(
      uploads.completeUpload(capability, "127.0.4.10"),
      KIOSK_ERROR_CODES.customerUploadNotReady,
    );
  });

  async function createUploadSession(
    label: string,
    purpose: KioskCustomerUploadPurpose = KioskCustomerUploadPurpose.MODEL,
  ) {
    const credentials = await pairedCredentials(label);
    const created = await controller.create(
      `Bearer ${credentials.accessToken}`,
      purpose,
    );
    const capability = created.publicUploadUrl.split("/").pop()!;
    return {
      capability,
      sessionId: created.sessionId,
      device: { id: credentials.device.id },
    };
  }

  async function pairedCredentials(label: string) {
    const admin = await createUser(label);
    await prisma.platformRoleAssignment.create({
      data: {
        id: createSelfxId(),
        userId: admin.id,
        role: PlatformRole.SELFX_SUPER_ADMIN,
        status: PlatformRoleAssignmentStatus.ACTIVE,
      },
    });
    const pairing = await kiosks.createPairingSession({}, `127.0.5.${userIds.length}`);
    pairingSessionIds.push(pairing.pairingSessionId);
    const device = await kiosks.pairKiosk(admin.id, {
      pairingCode: pairing.pairingCode,
      displayName: "Upload Kiosk",
      assignmentScope: KioskAssignmentScope.PLATFORM,
    });
    deviceIds.push(device.id);
    const status = await kiosks.getPairingStatus(
      pairing.pairingSessionId,
      pairing.provisioningSecret,
    );
    return kiosks.exchangeProvisioningGrant({
      pairingSessionId: pairing.pairingSessionId,
      provisioningSecret: pairing.provisioningSecret,
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

  async function cleanup() {
    await prisma.kioskCustomerUploadSession.deleteMany({
      where: { kioskDeviceId: { in: deviceIds } },
    });
    await prisma.kioskDeviceSession.deleteMany({
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

class FakeObjectStorage {
  readonly objects = new Map<string, { contentType: string; body: Buffer }>();
  lastUploadKey: string | null = null;

  createUploadUrl(input: {
    key: string;
    contentType: string;
    expiresInSeconds: number;
  }): string {
    this.lastUploadKey = input.key;
    return `https://storage.selfx.test/${input.key}?put=1&ttl=${input.expiresInSeconds}`;
  }

  createReadUrl(input: { key: string; expiresInSeconds: number }): string {
    return `https://storage.selfx.test/${input.key}?get=1&ttl=${input.expiresInSeconds}`;
  }

  async headObject(key: string) {
    const object = this.objects.get(key);
    if (!object) {
      throw new Error("missing object");
    }
    return {
      contentType: object.contentType,
      sizeBytes: object.body.length,
    };
  }

  async readObject(key: string): Promise<Buffer> {
    const object = this.objects.get(key);
    if (!object) {
      throw new Error("missing object");
    }
    return object.body;
  }

  async deleteObject(key: string): Promise<void> {
    this.objects.delete(key);
  }

  put(key: string, object: { contentType: string; body: Buffer }): void {
    this.objects.set(key, object);
  }
}
