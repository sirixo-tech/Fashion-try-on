import "reflect-metadata";
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
import { MailCrypto } from "./mail-crypto.js";
import { MailSettingsService } from "./mail-settings.service.js";
import { MailAutomationService } from "./mail-automation.service.js";
import { MailOutboxService } from "./mail-outbox.service.js";
import { MailDeliveryError } from "./smtp-sender.js";
import { AdminStoresService } from "../stores/admin-stores.service.js";
import { StoreRbacService } from "../rbac/store-rbac.service.js";
import { StorePurgeService } from "../stores/store-purge.service.js";
import { PrismaAuthRepository } from "../auth/auth.repository.js";
import { OrganizationApplicationsService } from "../organizations/organization-applications.service.js";
import { PlatformAuthorizationService } from "../platform/platform-authorization.service.js";
import { EntitlementsService } from "../entitlements/entitlements.service.js";

const url = process.env.MAIL_AUTOMATION_TEST_DATABASE_URL;
if (
  url &&
  (!["127.0.0.1", "localhost"].includes(new URL(url).hostname) ||
    new URL(url).pathname !== "/mail_automation_test")
)
  throw new Error(
    "Dedicated localhost mail_automation_test database required.",
  );
describe.skipIf(!url)(
  "Automatic mail — real PostgreSQL, simulated SMTP",
  () => {
    const db = new PrismaClient({
      datasourceUrl: url ?? "postgresql://unused@localhost/unused_test",
    });
    const prisma = db as PrismaService,
      crypto = new MailCrypto(),
      sender = { send: vi.fn().mockResolvedValue(undefined) };
    const settings = new MailSettingsService(prisma, crypto, sender as never);
    const mail = new MailAutomationService(prisma, crypto, settings);
    const outbox = new MailOutboxService(
      prisma,
      crypto,
      settings,
      sender as never,
    );
    const admin = new AdminStoresService(
      prisma,
      {} as never,
      new StoreRbacService(prisma),
      {} as never,
      undefined,
      undefined,
      undefined,
      mail,
    );
    let actor: string;
    const smtp = {
      editConfirmed: true,
      version: 0,
      enabled: true,
      host: "smtp.example.com",
      port: 587,
      security: "STARTTLS" as const,
      username: "smtp-user",
      password: "smtp-private",
      fromEmail: "mail@selfx.example",
      fromName: "SelfX",
    };
    const clean = () =>
      db.$executeRawUnsafe(
        "TRUNCATE organizations,users,mail_jobs,platform_settings,audit_logs CASCADE",
      );
    beforeAll(async () => {
      vi.stubEnv(
        "SELFX_MAIL_ENCRYPTION_KEY",
        Buffer.alloc(32, 9).toString("base64"),
      );
      vi.stubEnv("SELFX_MAIL_ENCRYPTION_KEY_VERSION", "mail_test");
      vi.stubEnv("SELFX_MAIL_PREVIOUS_ENCRYPTION_KEYS", "{}");
      await db.$connect();
    });
    beforeEach(async () => {
      await clean();
      sender.send.mockReset().mockResolvedValue(undefined);
      actor = createSelfxId();
      await db.user.create({
        data: {
          id: actor,
          email: "admin@example.com",
          passwordHash: "fixture",
        },
      });
      await db.platformRoleAssignment.create({
        data: { id: createSelfxId(), userId: actor, role: "SELFX_SUPER_ADMIN" },
      });
      await settings.save(actor, smtp);
    });
    afterAll(async () => {
      await clean();
      await db.$disconnect();
      vi.unstubAllEnvs();
    });
    async function store() {
      return admin.createStore({
        name: "Example Store",
        slug: createSelfxId(),
        contactEmail: "contact@example.com",
      });
    }
    it("requires explicit SMTP confirmation and never reveals saved credentials", async () => {
      await expect(
        settings.save(actor, { ...smtp, version: 1, editConfirmed: false }),
      ).rejects.toMatchObject({
        response: { error: { code: "MAIL_EDIT_CONFIRMATION_REQUIRED" } },
      });
      expect(JSON.stringify(await settings.get())).not.toContain(smtp.password);
    });
    it("captures Store creation and real status changes atomically and avoids duplicate no-op updates", async () => {
      const s = await store();
      await admin.deactivateStore(s.id);
      await admin.deactivateStore(s.id);
      await admin.activateStore(s.id);
      await admin.archiveStore(s.id);
      expect(
        (await db.mailJob.findMany({ orderBy: { createdAt: "asc" } })).map(
          (job) => job.templateCode,
        ),
      ).toEqual([
        "STORE_CREATED",
        "STORE_SUSPENDED",
        "STORE_REACTIVATED",
        "STORE_ARCHIVED",
      ]);
      await expect(
        db.$transaction(async (tx) => {
          await mail.storeEvent(tx, "STORE_APPROVED", s.id, "rollback");
          throw new Error("rollback");
        }),
      ).rejects.toThrow("rollback");
      expect(
        await db.mailJob.count({ where: { templateCode: "STORE_APPROVED" } }),
      ).toBe(0);
    });
    it("encrypts snapshots, deduplicates recipients/events and keeps queued messages unchanged after template edits", async () => {
      const s = await store();
      await db.mailJob.deleteMany();
      await db.$transaction(async (tx) => {
        await mail.notify(
          tx,
          "STORE_APPROVED",
          "same-event",
          ["customer@example.com", "CUSTOMER@example.com"],
          { storeName: "Original" },
        );
        await mail.notify(
          tx,
          "STORE_APPROVED",
          "same-event",
          ["customer@example.com"],
          { storeName: "Repeated" },
        );
      });
      await mail.saveTemplate(actor, "STORE_APPROVED", {
        version: 0,
        subject: "New {{storeName}}",
        body: "Updated message for {{storeName}}",
      });
      expect(await db.mailJob.count()).toBe(1);
      const job = await db.mailJob.findFirstOrThrow();
      expect(JSON.stringify(job.payload)).not.toContain("customer@example.com");
      expect(JSON.stringify(job.payload)).not.toContain("Original");
      await outbox.processNext();
      expect(sender.send.mock.calls[0]![1].subject).toBe(
        "Original application approved",
      );
      const history = await mail.history();
      expect(history[0]).toMatchObject({
        status: "SENT",
        recipientMask: "c***@example.com",
      });
      expect(history[0]).not.toHaveProperty("payload");
      expect((await db.mailJob.findFirstOrThrow()).payload).toBeNull();
      expect(s.id).toBeTruthy();
    });
    it("rejects unsupported variables, malformed headers and stale template versions", async () => {
      await expect(
        mail.saveTemplate(actor, "STORE_CREATED", {
          version: 0,
          subject: "{{password}}",
          body: "Body",
        }),
      ).rejects.toThrow();
      await mail.saveTemplate(actor, "STORE_CREATED", {
        version: 0,
        subject: "{{storeName}}",
        body: "Saved {{status}}",
      });
      await expect(
        mail.saveTemplate(actor, "STORE_CREATED", {
          version: 0,
          subject: "Stale",
          body: "Body",
        }),
      ).rejects.toThrow();
    });
    it("records disabled notifications as skipped without SMTP or plaintext content", async () => {
      await settings.save(actor, { ...smtp, version: 1, enabled: false });
      await store();
      await outbox.processNext();
      expect(sender.send).not.toHaveBeenCalled();
      expect(await db.mailJob.findFirst()).toMatchObject({
        status: "SKIPPED",
        payload: null,
      });
    });
    it("retries delivery with a stable message ID and records final SMTP acceptance", async () => {
      await store();
      sender.send.mockRejectedValueOnce(new MailDeliveryError("SMTP_TIMEOUT"));
      await outbox.processNext();
      expect(await db.mailJob.findFirst()).toMatchObject({
        status: "PENDING",
        attempts: 1,
        failureCode: "SMTP_TIMEOUT",
      });
      await db.mailJob.updateMany({ data: { availableAt: new Date(0) } });
      await outbox.processNext();
      expect(sender.send.mock.calls[0]![1].messageId).toBe(
        sender.send.mock.calls[1]![1].messageId,
      );
      expect(await db.mailJob.findFirst()).toMatchObject({
        status: "SENT",
        attempts: 2,
      });
    });
    it("queues custom mail once, rejects stale configuration and limits new sends", async () => {
      const input = {
        version: 1,
        recipient: "recipient@example.com",
        subject: "Hello",
        body: "Message",
        idempotencyKey: createSelfxId(),
      };
      const first = await mail.custom(actor, input);
      expect((await mail.custom(actor, input)).id).toBe(first.id);
      expect(await db.mailJob.count()).toBe(1);
      await expect(
        mail.custom(actor, {
          ...input,
          version: 0,
          idempotencyKey: createSelfxId(),
        }),
      ).rejects.toThrow();
      for (let i = 0; i < 2; i++)
        await mail.custom(actor, { ...input, idempotencyKey: createSelfxId() });
      await expect(
        mail.custom(actor, { ...input, idempotencyKey: createSelfxId() }),
      ).rejects.toThrow();
      expect(sender.send).not.toHaveBeenCalled();
    });
    it("retains a deletion message after the Store and its members are removed", async () => {
      const s = await store();
      await db.mailJob.deleteMany();
      const purge = new StorePurgeService(
        prisma,
        { deleteObject: vi.fn().mockResolvedValue(undefined) } as never,
        mail,
      );
      const archived = await db.organization.update({
        where: { id: s.id },
        data: { status: "ARCHIVED" },
      });
      await purge.purge(actor, s.id, {
        confirmName: s.name,
        updatedAt: archived.updatedAt.toISOString(),
      });
      expect(
        await db.organization.findUnique({ where: { id: s.id } }),
      ).toBeNull();
      expect(await db.mailJob.findFirst()).toMatchObject({
        templateCode: "STORE_DELETED",
        status: "PENDING",
      });
      await outbox.processNext();
      expect(sender.send.mock.calls[0]![1].text).toContain(
        "permanently deleted",
      );
    });
    it("queues welcome mail for self-service signup without changing password recovery", async () => {
      const repository = new PrismaAuthRepository(prisma, mail);
      await repository.createSelfServeSignup({
        email: "newowner@example.com",
        passwordHash: "fixture",
        displayName: "Owner",
      });
      expect(
        await db.mailJob.count({ where: { templateCode: "STORE_CREATED" } }),
      ).toBe(1);
    });
    it("renders paid totals only after verification and limits receipts to the order's Store", async () => {
      const s = await store();
      await admin.createStore({
        name: "Other Store",
        slug: createSelfxId(),
        contactEmail: "other-store@example.com",
      });
      await db.mailJob.deleteMany();
      const order = await db.shoppingOrder.create({
        data: {
          id: createSelfxId(),
          reference: `SX${createSelfxId().replaceAll("-", "").slice(0, 20)}`,
          organizationId: s.id,
          kioskDeviceId: createSelfxId(),
          sourceCartId: createSelfxId(),
          currency: "INR",
          taxMode: "EXCLUSIVE",
          subtotalCents: 10000,
          taxCents: 500,
          totalCents: 10500,
          expiresAt: new Date(Date.now() + 300000),
        },
      });
      await db.$transaction((tx) => mail.purchase(tx, order.id, false));
      expect(await db.mailJob.count()).toBe(0);
      await db.shoppingOrder.update({
        where: { id: order.id },
        data: {
          status: "PAID",
          paidAt: new Date(),
          stockAllocatedAt: new Date(),
        },
      });
      await db.$transaction(async (tx) => {
        await mail.purchase(tx, order.id, false);
        await mail.purchase(tx, order.id, false);
      });
      expect(await db.mailJob.count()).toBe(1);
      await outbox.processNext();
      expect(sender.send.mock.calls[0]![1]).toMatchObject({
        to: "contact@example.com",
      });
      expect(sender.send.mock.calls[0]![1].text).toContain("INR 105.00");
      expect(sender.send.mock.calls[0]![1].text).toContain("Tax: INR 5.00");
    });
    it("notifies only completed application review transitions", async () => {
      const service = new OrganizationApplicationsService(
        prisma,
        new PlatformAuthorizationService(prisma),
        new EntitlementsService(prisma),
        mail,
      );
      const application = await service.createDraft(actor, {
        organizationName: "Pending",
        slug: createSelfxId(),
      });
      await service.submitApplicantApplication(actor, application.id);
      await service.startReview(actor, application.id);
      expect(
        await db.mailJob.count({ where: { templateCode: "STORE_APPROVED" } }),
      ).toBe(0);
      await service.approve(actor, application.id);
      expect(
        await db.mailJob.count({ where: { templateCode: "STORE_APPROVED" } }),
      ).toBe(1);
    });
  },
);
