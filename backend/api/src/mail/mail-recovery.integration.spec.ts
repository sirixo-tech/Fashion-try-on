import "reflect-metadata";
import { randomBytes } from "node:crypto";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { PrismaClient } from "@prisma/client";
import { JwtService } from "@nestjs/jwt";
import { createSelfxId } from "@selfx/database";
import { PrismaService } from "../database/prisma.service.js";
import { MailCrypto } from "./mail-crypto.js";
import { MailSettingsService } from "./mail-settings.service.js";
import { MailOutboxService } from "./mail-outbox.service.js";
import { SmtpSender, MailDeliveryError } from "./smtp-sender.js";
import {
  PasswordRecoveryService,
  recoveryResponse,
} from "../auth/password-recovery.service.js";
import { PasswordService } from "../auth/password.service.js";
import { AuthService } from "../auth/auth.service.js";
import { PrismaAuthRepository } from "../auth/auth.repository.js";
import { RefreshTokenService } from "../auth/refresh-token.service.js";
import { AuthRateLimiterService } from "../auth/rate-limiter.service.js";
import { type AuthConfig } from "../auth/auth.config.js";

const url = process.env.MAIL_RECOVERY_TEST_DATABASE_URL;
if (
  url &&
  (!["127.0.0.1", "localhost"].includes(new URL(url).hostname) ||
    !new URL(url).pathname.endsWith("_test"))
)
  throw new Error("Disposable localhost test database required.");
const config: AuthConfig = {
  nodeEnv: "test",
  jwtAccessSecret: "mail_test_access_abcdefghijklmnopqrstuvwxyz",
  accessTokenTtlSeconds: 900,
  refreshTokenPepper: "mail_test_pepper_abcdefghijklmnopqrstuvwxyz",
  refreshSessionTtlSeconds: 3600,
  refreshCookieName: "mail_test_refresh",
  cookieSecure: false,
  cookieSameSite: "lax",
  corsAllowedOrigins: ["https://selfx.example"],
  loginRateLimitMax: 100,
  loginRateLimitWindowMs: 60_000,
  refreshRateLimitMax: 100,
  refreshRateLimitWindowMs: 60_000,
};
describe.skipIf(!url)(
  "Platform SMTP and password recovery — PostgreSQL, simulated SMTP",
  () => {
    const db = new PrismaClient({
      datasourceUrl: url ?? "postgresql://unused@localhost/unused_test",
    });
    const prisma = db as PrismaService,
      crypto = new MailCrypto(),
      passwords = new PasswordService();
    const sender = { send: vi.fn<SmtpSender["send"]>() };
    let settings: MailSettingsService,
      outbox: MailOutboxService,
      recovery: PasswordRecoveryService,
      auth: AuthService;
    let adminId: string, ownerId: string, otherId: string, storeId: string;
    const ids: string[] = [],
      stores: string[] = [];
    const input = {
      version: 0,
      enabled: true,
      host: "smtp.example.com",
      port: 587,
      security: "STARTTLS" as const,
      username: "smtp-user",
      password: "private-smtp-password",
      fromEmail: "accounts@selfx.example",
      fromName: "SelfX",
    };
    const metadata = {
      ipAddress: "127.0.0.1",
      userAgent: "test",
      origin: "https://selfx.example",
    };
    async function cleanup() {
      await db.mailJob.deleteMany();
      await db.passwordResetToken.deleteMany();
      await db.passwordRecoveryRateBucket.deleteMany();
      await db.platformSetting.deleteMany({ where: { key: "platform.mail" } });
      await db.auditLog.deleteMany({ where: { actorUserId: { in: ids } } });
      await db.userSession.deleteMany({ where: { userId: { in: ids } } });
      await db.platformRoleAssignment.deleteMany({
        where: { userId: { in: ids } },
      });
      await db.organizationMembership.deleteMany({
        where: { userId: { in: ids } },
      });
      await db.organization.deleteMany({ where: { id: { in: stores } } });
      await db.user.deleteMany({ where: { id: { in: ids } } });
    }
    beforeAll(async () => {
      vi.stubEnv(
        "SELFX_MAIL_ENCRYPTION_KEY",
        randomBytes(32).toString("base64"),
      );
      vi.stubEnv("SELFX_MAIL_ENCRYPTION_KEY_VERSION", "v1");
      vi.stubEnv("SELFX_MAIL_PREVIOUS_ENCRYPTION_KEYS", "{}");
      vi.stubEnv("SELFX_PUBLIC_WEB_BASE_URL", "https://selfx.example");
      await db.$connect();
    });
    beforeEach(async () => {
      await cleanup();
      sender.send.mockReset();
      sender.send.mockResolvedValue();
      adminId = createSelfxId();
      ownerId = createSelfxId();
      otherId = createSelfxId();
      storeId = createSelfxId();
      ids.push(adminId, ownerId, otherId);
      stores.push(storeId);
      const passwordHash = await passwords.hashPassword("OldPassword123!");
      await db.user.createMany({
        data: [
          { id: adminId, email: "admin@mail.invalid", passwordHash },
          { id: ownerId, email: "owner@mail.invalid", passwordHash },
          { id: otherId, email: "other@mail.invalid", passwordHash },
        ],
      });
      await db.platformRoleAssignment.create({
        data: {
          id: createSelfxId(),
          userId: adminId,
          role: "SELFX_SUPER_ADMIN",
        },
      });
      await db.organization.create({
        data: {
          id: storeId,
          name: "Mail Store",
          slug: storeId,
          status: "ACTIVE",
        },
      });
      await db.organizationMembership.create({
        data: {
          id: createSelfxId(),
          userId: ownerId,
          orgId: storeId,
          role: "ORGANIZATION_OWNER",
          storeScopeMode: "ALL_STORES",
        },
      });
      settings = new MailSettingsService(
        prisma,
        crypto,
        sender as unknown as SmtpSender,
      );
      outbox = new MailOutboxService(
        prisma,
        crypto,
        settings,
        sender as unknown as SmtpSender,
      );
      recovery = new PasswordRecoveryService(
        prisma,
        crypto,
        outbox,
        settings,
        passwords,
        config,
      );
      recovery.onModuleInit();
      auth = new AuthService(
        new PrismaAuthRepository(prisma),
        config,
        passwords,
        new RefreshTokenService(config),
        new JwtService(),
        new AuthRateLimiterService(config),
      );
      await settings.save(adminId, input);
    });
    afterAll(async () => {
      await cleanup();
      await db.$disconnect();
      vi.unstubAllEnvs();
    });
    async function getLink(email = "owner@mail.invalid", ip = "request-ip") {
      await recovery.request(email, ip);
      await outbox.processNext();
      const text = sender.send.mock.calls.at(-1)![1].text;
      const token = text.match(/#token=([a-f0-9]{64})/)?.[1];
      if (!token) throw new Error("Fixture reset link missing");
      return token;
    }
    it("encrypts credentials, preserves a blank password, rejects stale edits and never exposes secrets in reads/audits", async () => {
      const safe = await settings.get();
      expect(safe).toMatchObject({
        username: "smtp-user",
        hasPassword: true,
        keyReady: true,
        version: 1,
      });
      expect(JSON.stringify(safe)).not.toContain(input.password);
      const stored = JSON.stringify(
        (
          await db.platformSetting.findUniqueOrThrow({
            where: { key: "platform.mail" },
          })
        ).value,
      );
      expect(stored).not.toContain(input.password);
      expect(stored).not.toContain(input.username);
      await settings.save(adminId, {
        ...input,
        version: 1,
        password: "",
        fromName: "New name",
      });
      expect((await settings.account()).account.password).toBe(input.password);
      await expect(
        settings.save(adminId, { ...input, version: 1 }),
      ).rejects.toThrow();
      expect(JSON.stringify(await db.auditLog.findMany())).not.toContain(
        input.password,
      );
    });
    it("reports SMTP acceptance separately from configuration and stores safe failure status", async () => {
      expect((await settings.get()).lastTest).toBeNull();
      await settings.test(adminId, "recipient@example.com", 1);
      expect((await settings.get()).lastTest?.status).toBe("ACCEPTED");
      sender.send.mockRejectedValueOnce(
        new MailDeliveryError("SMTP_AUTH_FAILED"),
      );
      await expect(
        settings.test(adminId, "recipient@example.com", 1),
      ).rejects.toThrow();
      expect((await settings.get()).lastTest).toMatchObject({
        status: "FAILED",
        code: "SMTP_AUTH_FAILED",
      });
      expect(JSON.stringify(await db.auditLog.findMany())).not.toContain(
        "recipient@example.com",
      );
    });
    it("gives identical HTTP results for known, unknown and disabled users without sending synchronously", async () => {
      await db.user.update({
        where: { id: otherId },
        data: { status: "DISABLED" },
      });
      for (const email of [
        "owner@mail.invalid",
        "missing@mail.invalid",
        "other@mail.invalid",
      ])
        expect(await recovery.request(email, "same-ip")).toEqual(
          recoveryResponse,
        );
      expect(sender.send).not.toHaveBeenCalled();
      const jobs = await db.mailJob.findMany();
      expect(jobs).toHaveLength(3);
      expect(JSON.stringify(jobs)).not.toContain("owner@mail.invalid");
      for (let i = 0; i < 3; i++) await outbox.processNext();
      expect(sender.send).toHaveBeenCalledTimes(1);
      expect(
        (await db.mailJob.findMany()).every((job) => job.payload === null),
      ).toBe(true);
      expect(await db.passwordResetToken.count()).toBe(1);
    });
    it("resets one account atomically, invalidates old access/refresh tokens and preserves Store ownership and other users", async () => {
      const old = await auth.login(
        "owner@mail.invalid",
        "OldPassword123!",
        metadata,
      );
      const other = await auth.login(
        "other@mail.invalid",
        "OldPassword123!",
        metadata,
      );
      const token = await getLink();
      const membership = await db.organizationMembership.findMany({
        where: { userId: ownerId },
      });
      expect(
        await recovery.reset(token, "NewPassword123!", "reset-ip"),
      ).toHaveProperty("message");
      await expect(
        auth.requireAccessUser(`Bearer ${old.accessToken}`),
      ).rejects.toThrow();
      await expect(auth.refresh(old.refreshToken, metadata)).rejects.toThrow();
      await expect(
        auth.login("owner@mail.invalid", "OldPassword123!", metadata),
      ).rejects.toThrow();
      const updated = await auth.login(
        "owner@mail.invalid",
        "NewPassword123!",
        metadata,
      );
      expect(
        (await auth.requireAccessUser(`Bearer ${updated.accessToken}`)).id,
      ).toBe(ownerId);
      expect(
        (await auth.requireAccessUser(`Bearer ${other.accessToken}`)).id,
      ).toBe(otherId);
      expect(
        await db.organizationMembership.findMany({
          where: { userId: ownerId },
        }),
      ).toEqual(membership);
      expect(
        await db.platformRoleAssignment.count({
          where: { userId: adminId, status: "ACTIVE" },
        }),
      ).toBe(1);
      await expect(
        recovery.reset(token, "AnotherPassword123!", "reset-ip"),
      ).rejects.toThrow();
      const audit = await db.auditLog.findFirstOrThrow({
        where: { action: "AUTH_PASSWORD_RESET_COMPLETED" },
      });
      expect(JSON.stringify(audit)).not.toContain(token);
      await outbox.processNext();
      expect(sender.send.mock.calls.at(-1)![1].subject).toBe(
        "Your SelfX password was changed",
      );
    });
    it("allows only one winner for concurrent resets, invalidates sibling links and stale queued requests", async () => {
      const first = await getLink(),
        sibling = await getLink();
      await recovery.request("owner@mail.invalid", "request-ip");
      const results = await Promise.allSettled([
        recovery.reset(first, "NewPassword123!", "reset-ip"),
        recovery.reset(first, "OtherPassword123!", "reset-ip"),
      ]);
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      await expect(
        recovery.reset(sibling, "ThirdPassword123!", "reset-ip"),
      ).rejects.toThrow();
      const before = sender.send.mock.calls.length;
      await outbox.processNext(); // A reset request queued before the password change is discarded.
      expect(sender.send.mock.calls.length).toBe(before);
    });
    it("rejects expired and wrong links without changing the password", async () => {
      const token = await getLink();
      await db.passwordResetToken.updateMany({
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      await expect(
        recovery.reset(token, "NewPassword123!", "reset-ip"),
      ).rejects.toThrow();
      await expect(
        recovery.reset("a".repeat(64), "NewPassword123!", "reset-ip"),
      ).rejects.toThrow();
      expect(
        (await auth.login("owner@mail.invalid", "OldPassword123!", metadata))
          .user.id,
      ).toBe(ownerId);
    });
    it("retries the same encrypted link after SMTP failure and claims work only once across concurrent workers", async () => {
      sender.send.mockRejectedValueOnce(new MailDeliveryError("SMTP_TIMEOUT"));
      await recovery.request("owner@mail.invalid", "request-ip");
      await Promise.all([outbox.processNext(), outbox.processNext()]);
      expect(sender.send).toHaveBeenCalledTimes(1);
      const first = sender.send.mock.calls[0]![1].text;
      expect(await db.passwordResetToken.count()).toBe(1);
      await db.mailJob.updateMany({
        where: { status: "PENDING" },
        data: { availableAt: new Date(Date.now() - 1000) },
      });
      await outbox.processNext();
      expect(sender.send.mock.calls[1]![1].text).toBe(first);
      expect(await db.passwordResetToken.count()).toBe(1);
      expect((await db.mailJob.findFirstOrThrow()).payload).toBeNull();
    });
    it("applies shared database-backed per-address and IP limits", async () => {
      for (let i = 0; i < 5; i++)
        expect(await recovery.request("missing@mail.invalid", "ip-a")).toEqual(
          recoveryResponse,
        );
      expect(await db.mailJob.count()).toBe(3);
      for (let i = 0; i < 5; i++)
        await recovery.request(`missing${i}@mail.invalid`, "ip-a");
      await expect(
        recovery.request("another@mail.invalid", "ip-a"),
      ).rejects.toThrow();
      expect(
        JSON.stringify(await db.passwordRecoveryRateBucket.findMany()),
      ).not.toContain("missing");
    });
    it("keeps recovery unavailable when outgoing email is disabled and allows explicit test sends", async () => {
      await settings.save(adminId, { ...input, version: 1, enabled: false });
      await expect(
        recovery.request("owner@mail.invalid", "request-ip"),
      ).rejects.toThrow();
      expect(await db.mailJob.count()).toBe(0);
      await settings.test(adminId, "recipient@example.com", 2);
      expect(sender.send).toHaveBeenCalledOnce();
    });
    it("rejects a refresh session created with stale credentials even after normal session revocation", async () => {
      await recovery.reset(await getLink(), "NewPassword123!", "reset-ip");
      const id = createSelfxId(),
        refresh = new RefreshTokenService(config),
        token = refresh.create(id);
      await db.userSession.create({
        data: {
          id,
          userId: ownerId,
          credentialsVersion: 0,
          refreshTokenHash: refresh.digest(token),
          expiresAt: new Date(Date.now() + 60_000),
        },
      });
      await expect(auth.refresh(token, metadata)).rejects.toThrow();
    });
    it("cleans expired sensitive payloads and reset tokens within the bounded retention window", async () => {
      await recovery.request("owner@mail.invalid", "request-ip");
      await db.mailJob.updateMany({
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      await outbox.cleanup();
      expect((await db.mailJob.findFirstOrThrow()).payload).toBeNull();
      expect(sender.send).not.toHaveBeenCalled();
    });
  },
);
