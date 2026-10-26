import "reflect-metadata";
import { randomBytes } from "node:crypto";
import {
  beforeAll,
  beforeEach,
  afterAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { PrismaClient } from "@prisma/client";
import { createSelfxId } from "@selfx/database";
import { PrismaService } from "../database/prisma.service.js";
import { MailCrypto } from "../mail/mail-crypto.js";
import {
  CustomerNotificationsService,
  recordCustomerLookNotification,
} from "./customer-notifications.service.js";
import { CustomerPushSender } from "./customer-push.sender.js";
import { AppReleasesService } from "../apps/app-releases.service.js";

const url = process.env.CUSTOMER_SERVICES_TEST_DATABASE_URL;
if (
  url &&
  (!["localhost", "127.0.0.1"].includes(new URL(url).hostname) ||
    new URL(url).pathname !== "/customer_mobile_test")
)
  throw new Error(
    "Use only the disposable localhost customer_mobile_test database.",
  );
describe.skipIf(!url)(
  "Customer services with local PostgreSQL and simulated push/storage",
  () => {
    const db = new PrismaClient({
      datasourceUrl:
        url ?? "postgresql://unused@localhost/customer_mobile_test",
    });
    const crypto = new MailCrypto();
    const sender = {
      configuration: vi.fn().mockReturnValue({ projectId: "fake-project" }),
      send: vi.fn<CustomerPushSender["send"]>(),
    };
    const service = new CustomerNotificationsService(
      db as PrismaService,
      crypto,
      sender as unknown as CustomerPushSender,
    );
    let customerId: string, otherId: string, sessionId: string;
    const opaqueRegistration = "synthetic-registration-fid-123";
    beforeAll(async () => {
      vi.stubEnv("SELFX_CUSTOMER_AUTH_ENABLED", "true");
      vi.stubEnv(
        "SELFX_MAIL_ENCRYPTION_KEY",
        randomBytes(32).toString("base64"),
      );
      vi.stubEnv("SELFX_MAIL_ENCRYPTION_KEY_VERSION", "v1");
      vi.stubEnv("SELFX_MAIL_PREVIOUS_ENCRYPTION_KEYS", "{}");
      await db.$connect();
    });
    beforeEach(async () => {
      await db.$executeRawUnsafe(
        "TRUNCATE TABLE customers, organizations, pricing_plans, app_releases CASCADE",
      );
      customerId = createSelfxId();
      otherId = createSelfxId();
      sessionId = createSelfxId();
      await db.customer.createMany({
        data: [customerId, otherId].map((id) => ({
          id,
          displayName: "Synthetic customer",
          status: "ACTIVE",
          termsVersion: "test",
          termsAcceptedAt: new Date(),
          notifications: true,
        })),
      });
      await db.customerSession.create({
        data: {
          id: sessionId,
          customerId,
          familyId: sessionId,
          tokenHash: "a".repeat(64),
          expiresAt: new Date(Date.now() + 86400000),
        },
      });
      sender.send.mockReset().mockResolvedValue("SENT");
      sender.configuration.mockReturnValue({ projectId: "fake-project" });
    });
    afterAll(async () => {
      service.onModuleDestroy();
      await db.$disconnect();
      vi.unstubAllEnvs();
    });
    async function register() {
      await service.register(customerId, sessionId, {
        installationId: createSelfxId(),
        token: opaqueRegistration,
        platform: "ANDROID",
      });
    }
    async function event() {
      const runId = createSelfxId();
      await db.$transaction((tx) =>
        recordCustomerLookNotification(
          tx,
          customerId,
          runId,
          new Date(Date.now() + 86400000),
        ),
      );
      return await db.customerNotification.findFirstOrThrow({
        where: { runId },
      });
    }
    it("keeps inbox events working with push disabled and never exposes another account", async () => {
      sender.configuration.mockReturnValue(null as never);
      const notification = await event();
      expect(service.ready()).toBe(false);
      expect((await service.list(customerId)).data[0]?.runId).toBe(
        notification.runId,
      );
      expect((await service.list(otherId)).data).toEqual([]);
      await expect(service.read(otherId, notification.id)).rejects.toThrow();
      await expect(
        service.register(customerId, sessionId, {
          installationId: createSelfxId(),
          token: opaqueRegistration,
          platform: "ANDROID",
        }),
      ).rejects.toThrow();
    });
    it("encrypts FIDs at rest, scopes registration to a live owned session and deduplicates delivery", async () => {
      await expect(
        service.register(otherId, sessionId, {
          installationId: createSelfxId(),
          token: opaqueRegistration,
          platform: "ANDROID",
        }),
      ).rejects.toThrow();
      await register();
      const notification = await event();
      await db.$transaction((tx) =>
        recordCustomerLookNotification(
          tx,
          customerId,
          notification.runId,
          notification.expiresAt,
        ),
      );
      expect(await db.customerNotification.count()).toBe(1);
      expect(await db.customerPushDelivery.count()).toBe(1);
      expect(
        JSON.stringify(await db.customerPushDevice.findMany()),
      ).not.toContain(opaqueRegistration);
      expect(JSON.stringify(await service.list(customerId))).not.toMatch(
        /tokenCipher|tokenHash|synthetic-registration/,
      );
      await service.process();
      await service.process();
      expect(sender.send).toHaveBeenCalledTimes(1);
    });
    it("stops device alerts when the session is revoked or the preference is disabled", async () => {
      await register();
      await event();
      await db.customerSession.update({
        where: { id: sessionId },
        data: { revokedAt: new Date() },
      });
      await service.process();
      expect(sender.send).not.toHaveBeenCalled();
      expect(await db.customerPushDevice.count()).toBe(0);
      expect((await service.list(customerId)).data).toHaveLength(1);
    });
    it("retries transient failures and removes invalid registrations without losing the inbox", async () => {
      await register();
      await event();
      sender.send
        .mockResolvedValueOnce("RETRY")
        .mockResolvedValueOnce("UNREGISTERED");
      await service.process();
      expect((await db.customerPushDelivery.findFirstOrThrow()).state).toBe(
        "PENDING",
      );
      await db.customerPushDelivery.updateMany({
        data: { availableAt: new Date(0) },
      });
      await service.process();
      expect(await db.customerPushDevice.count()).toBe(0);
      expect((await service.list(customerId)).data).toHaveLength(1);
    });
    it("expires notifications and delivery records with the saved result", async () => {
      await register();
      const notification = await event();
      await db.customerNotification.update({
        where: { id: notification.id },
        data: { expiresAt: new Date(0) },
      });
      await service.process();
      expect(await db.customerNotification.count()).toBe(0);
      expect(await db.customerPushDelivery.count()).toBe(0);
      expect(sender.send).not.toHaveBeenCalled();
    });
    it("keeps kiosk/customer recommendations separate and selects only compatible published customer releases", async () => {
      const data = (
        packageName: string,
        versionCode: number,
        architecture = "ARM64",
        status: "DRAFT" | "PUBLISHED" = "PUBLISHED",
      ) => ({
        id: createSelfxId(),
        packageName,
        versionName: "1.0",
        versionCode,
        architecture,
        minSdk: 24,
        sha256: randomBytes(32).toString("hex"),
        signerSha256: "a".repeat(64),
        objectKey: createSelfxId(),
        filename: "app.apk",
        sizeBytes: 1000,
        status,
        recommended: status === "PUBLISHED",
      });
      await db.appRelease.create({ data: data("com.selfx.kiosk", 10) });
      const release = await db.appRelease.create({
        data: data("com.selfx.selfx_customer", 4),
      });
      await db.appRelease.create({
        data: data("com.selfx.selfx_customer", 5, "ARM64", "DRAFT"),
      });
      await db.appRelease.create({
        data: data("com.selfx.selfx_customer", 6, "X86_64"),
      });
      const releases = new AppReleasesService(
        db as PrismaService,
        { createReadUrl: () => "https://private.invalid/apk" } as never,
        {} as never,
      );
      expect((await releases.customerUpdate(3, "ARM64", 35)).update?.id).toBe(
        release.id,
      );
      expect((await releases.customerUpdate(4, "ARM64", 35)).update).toBeNull();
      expect((await releases.customerUpdate(3, "ARM64", 23)).update).toBeNull();
      await expect(releases.download(release.id, true)).rejects.toThrow();
      expect(
        (await releases.download(release.id, true, "CUSTOMER")).url,
      ).toContain("https://");
      expect(
        (await releases.list(true)).data.every(
          (item) => item.packageName === "com.selfx.kiosk",
        ),
      ).toBe(true);
    });
  },
);
