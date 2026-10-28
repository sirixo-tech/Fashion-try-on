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
import { PrismaClient, type Prisma } from "@prisma/client";
import { createSelfxId } from "@selfx/database";
import { JwtService } from "@nestjs/jwt";
import { ValidationPipe } from "@nestjs/common";
import { PasswordService } from "../auth/password.service.js";
import { PrismaService } from "../database/prisma.service.js";
import { MailCrypto } from "../mail/mail-crypto.js";
import { MailOutboxService } from "../mail/mail-outbox.service.js";
import { MailSettingsService } from "../mail/mail-settings.service.js";
import { MailDeliveryError, SmtpSender } from "../mail/smtp-sender.js";
import { CustomerAuthService } from "./customer-auth.service.js";
import { CustomerIdentityClient } from "./customer-identity.client.js";
import { CustomerPhoneClient } from "./customer-phone.client.js";
import { CUSTOMER_TERMS_VERSION } from "./customer.config.js";
import { CustomerProfileDto, CustomerSignupDto } from "./customer.dto.js";

const url = process.env.CUSTOMER_AUTH_TEST_DATABASE_URL;
if (
  url &&
  (!["localhost", "127.0.0.1"].includes(new URL(url).hostname) ||
    new URL(url).pathname !== "/customer_auth_test")
) {
  throw new Error(
    "Only the dedicated disposable localhost customer_auth_test database is allowed.",
  );
}
const password = "a-strong-customer-passphrase";
const email = "customer@selfx.invalid";
const ip = "127.0.0.1";
const signup = (address = email) => ({
  email: address,
  displayName: "Ava Customer",
  password,
  acceptTerms: true,
  termsVersion: CUSTOMER_TERMS_VERSION,
});
const bearer = (bundle: { accessToken: string }) =>
  `Bearer ${bundle.accessToken}`;
describe.skipIf(!url)(
  "Customer auth: isolated PostgreSQL and simulated email",
  () => {
    const db = new PrismaClient({
      datasourceUrl: url ?? "postgresql://unused@localhost/customer_auth_test",
    });
    const passwords = new PasswordService(),
      crypto = new MailCrypto(),
      jwt = new JwtService();
    const sender = { send: vi.fn<SmtpSender["send"]>() };
    const identities = { verify: vi.fn<CustomerIdentityClient["verify"]>() };
    const phone = {
      ready: vi.fn().mockReturnValue(true),
      verify: vi.fn().mockResolvedValue({
        subject: "firebase-one",
        phoneNumber: "+919876543210",
      }),
    };
    const settings = {
      account: vi.fn().mockResolvedValue({ host: "smtp.invalid" }),
    };
    let auth: CustomerAuthService, outbox: MailOutboxService;
    async function deliver() {
      const before = sender.send.mock.calls.length;
      for (let count = 0; count < 10 && (await outbox.processNext()); count++) {
        /* bounded simulated drain */
      }
      return sender.send.mock.calls.slice(before).map((call) => call[1]);
    }
    async function code() {
      const messages = await deliver();
      const last = messages.at(-1);
      expect(last?.to).toBe(email);
      return last!.text.match(/code is (\d{6})/)![1]!;
    }
    async function register(address = email) {
      const result = await auth.signup(signup(address), ip);
      const messages = await deliver();
      const value = messages.at(-1)!.text.match(/code is (\d{6})/)![1]!;
      await auth.verifyEmail(address, value, ip, result.signupProof);
      const resultBundle = await auth.login(address, password, ip);
      if (!("accessToken" in resultBundle))
        throw new Error("Expected verified session");
      return resultBundle;
    }
    beforeAll(async () => {
      vi.stubEnv("SELFX_CUSTOMER_AUTH_ENABLED", "true");
      vi.stubEnv(
        "SELFX_CUSTOMER_JWT_SECRET",
        "customer-tests-dedicated-secret-abcdefghijklmnopqrstuvwxyz",
      );
      vi.stubEnv("SELFX_CUSTOMER_GOOGLE_CLIENT_IDS", "test-google-client");
      vi.stubEnv("SELFX_CUSTOMER_APPLE_CLIENT_IDS", "test-apple-client");
      vi.stubEnv(
        "SELFX_MAIL_ENCRYPTION_KEY",
        randomBytes(32).toString("base64"),
      );
      vi.stubEnv("SELFX_MAIL_ENCRYPTION_KEY_VERSION", "v1");
      vi.stubEnv("SELFX_MAIL_PREVIOUS_ENCRYPTION_KEYS", "{}");
      await db.$connect();
    });
    beforeEach(async () => {
      auth?.onModuleDestroy();
      await db.mailJob.deleteMany();
      await db.customerCreditAccount.deleteMany();
      await db.customer.deleteMany();
      await db.customerActionToken.deleteMany();
      await db.passwordRecoveryRateBucket.deleteMany();
      sender.send.mockReset().mockResolvedValue();
      identities.verify
        .mockReset()
        .mockResolvedValue({ subject: "google-subject", email, name: "Ava" });
      phone.ready.mockReturnValue(true);
      phone.verify.mockReset().mockResolvedValue({
        subject: "firebase-one",
        phoneNumber: "+919876543210",
      });
      outbox = new MailOutboxService(
        db as PrismaService,
        crypto,
        settings as unknown as MailSettingsService,
        sender as unknown as SmtpSender,
      );
      auth = new CustomerAuthService(
        db as PrismaService,
        passwords,
        jwt,
        identities as unknown as CustomerIdentityClient,
        settings as unknown as MailSettingsService,
        outbox,
        crypto,
        phone as unknown as CustomerPhoneClient,
      );
      auth.onModuleInit();
    });
    afterAll(async () => {
      auth?.onModuleDestroy();
      await db.mailJob.deleteMany();
      await db.customerCreditAccount.deleteMany();
      await db.customer.deleteMany();
      await db.customerActionToken.deleteMany();
      await db.passwordRecoveryRateBucket.deleteMany();
      await db.$disconnect();
      vi.unstubAllEnvs();
    });
    it("email login requires six digits, its own request proof and single use without changing password or credits", async () => {
      const original = await register();
      const request = await auth.requestEmailLogin(email, ip);
      const value = await code();
      expect(value).toHaveLength(6);
      await expect(
        auth.emailLogin(email, value, "x".repeat(43), ip),
      ).rejects.toMatchObject({ status: 400 });
      const result = (await auth.emailLogin(
        email,
        value,
        request.loginProof,
        ip,
      )) as { accessToken: string; customer: { id: string } };
      expect(result.customer.id).toBe(original.customer.id);
      await expect(
        auth.emailLogin(email, value, request.loginProof, ip),
      ).rejects.toMatchObject({ status: 400 });
      await expect(auth.login(email, password, ip)).resolves.toHaveProperty(
        "accessToken",
      );
      expect(await db.customer.count()).toBe(1);
      expect(await db.customerCreditAccount.count()).toBe(0);
    });
    it("email login sends no code for unknown, pending or suspended accounts and has a persistent resend cooldown", async () => {
      await register();
      const known = await auth.requestEmailLogin(email, ip);
      expect(await deliver()).toHaveLength(1);
      await auth.requestEmailLogin(email, ip, known.loginProof);
      expect(await deliver()).toHaveLength(0);
      const unknown = await auth.requestEmailLogin("unknown@selfx.invalid", ip);
      expect(unknown.message).toBe(known.message);
      expect(await deliver()).toHaveLength(0);
      await auth.signup(signup("pending@selfx.invalid"), ip);
      await deliver();
      await auth.requestEmailLogin("pending@selfx.invalid", ip);
      expect(await deliver()).toHaveLength(0);
      await db.customer.update({
        where: { email },
        data: { status: "SUSPENDED" },
      });
      await db.passwordRecoveryRateBucket.deleteMany();
      await auth.requestEmailLogin(email, ip);
      expect(await deliver()).toHaveLength(0);
    });
    it("email login codes expire and cannot be used for password reset", async () => {
      await register();
      const request = await auth.requestEmailLogin(email, ip);
      const value = await code();
      await expect(
        auth.resetPassword(email, value, "new-password", ip),
      ).rejects.toMatchObject({ status: 400 });
      await db.customerActionToken.updateMany({
        where: { purpose: "EMAIL_LOGIN" },
        data: { expiresAt: new Date(Date.now() - 1) },
      });
      await expect(
        auth.emailLogin(email, value, request.loginProof, ip),
      ).rejects.toMatchObject({ status: 400 });
      expect(await db.customerSession.count()).toBe(1);
    });
    it("uses an email-verified phone/password alias without granting SMS ownership, and rejects ambiguous aliases", async () => {
      const number = "+919876543210";
      const request = await auth.signup(
        { ...signup(), phoneNumber: number },
        ip,
      );
      await expect(auth.login(number, password, ip)).rejects.toMatchObject({
        status: 401,
      });
      const value = await code();
      await auth.verifyEmail(email, value, ip, request.signupProof);
      const session = await auth.login(number, password, ip);
      expect(session).toHaveProperty("accessToken");
      expect(session).toMatchObject({ customer: { email, phoneNumber: null } });
      await expect(
        auth.login(number, "wrong-password", ip),
      ).rejects.toMatchObject({ status: 401 });
      await expect(
        auth.phoneLogin("synthetic-token", ip),
      ).rejects.toMatchObject({ status: 409 });
      const other = await register("other@selfx.invalid");
      await db.customer.update({
        where: { id: other.customer.id },
        data: { pendingPhoneNumber: number },
      });
      await expect(auth.login(number, password, ip)).rejects.toMatchObject({
        status: 401,
      });
      const first = await auth.login(email, password, ip);
      if (!("accessToken" in first)) throw Error("Expected session");
      await auth.linkPhone(bearer(first), "synthetic-token", ip);
      expect(await auth.login(number, password, ip)).toMatchObject({
        customer: { id: first.customer.id },
      });
      await db.customer.update({
        where: { id: first.customer.id },
        data: { status: "SUSPENDED" },
      });
      await expect(auth.login(number, password, ip)).rejects.toMatchObject({
        status: 401,
      });
    });
    it("links Google only after recent authenticated consent, preserves customer identity and rejects mismatches", async () => {
      const original = await register();
      const input = { provider: "GOOGLE" as const, idToken: "synthetic-token" };
      await expect(auth.linkOAuth(undefined, input, ip)).rejects.toMatchObject({
        status: 401,
      });
      identities.verify.mockResolvedValueOnce({
        subject: "wrong-google",
        email: "other@selfx.invalid",
        name: "Other",
      });
      await expect(
        auth.linkOAuth(bearer(original), input, ip),
      ).rejects.toMatchObject({ status: 409 });
      await auth.linkOAuth(bearer(original), input, ip);
      expect(await auth.oauth(input, ip)).toMatchObject({
        customer: { id: original.customer.id },
      });
      expect(await db.customer.count()).toBe(1);
      expect(await auth.me(bearer(original))).toMatchObject({
        methods: expect.arrayContaining(["EMAIL_PASSWORD", "GOOGLE"]),
      });
      await db.customerSession.updateMany({
        data: { authenticatedAt: new Date(Date.now() - 11 * 60000) },
      });
      await expect(
        auth.linkOAuth(bearer(original), input, ip),
      ).rejects.toMatchObject({ status: 403 });
    });
    it("admits phone requests every ten seconds, charges no rejected retries and serializes concurrent admissions", async () => {
      const number = "+919876543210";
      for (let i = 0; i < 4; i++)
        await auth.rate("phone-request-number", number, 3);
      expect(await auth.phoneRequest(number, ip)).toMatchObject({
        resendAfterSeconds: 10,
      });
      for (let i = 0; i < 5; i++) {
        await expect(auth.phoneRequest(number, ip)).rejects.toMatchObject({
          status: 429,
        });
      }
      const buckets = await db.passwordRecoveryRateBucket.findMany({
        where: { expiresAt: { gt: new Date(Date.now() + 16 * 60000) } },
      });
      expect(buckets.map((b) => b.count)).toEqual([1, 1, 1]);
      await db.passwordRecoveryRateBucket.updateMany({
        where: { expiresAt: { lt: new Date(Date.now() + 11000) } },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      const concurrent = await Promise.allSettled([
        auth.phoneRequest(number, ip),
        auth.phoneRequest(number, "127.0.0.2"),
      ]);
      expect(concurrent.filter((r) => r.status === "fulfilled")).toHaveLength(
        1,
      );
      expect(concurrent.filter((r) => r.status === "rejected")).toHaveLength(1);
      await db.passwordRecoveryRateBucket.updateMany({
        where: { expiresAt: { gt: new Date(Date.now() + 16 * 60000) } },
        data: { count: 120 },
      });
      await db.passwordRecoveryRateBucket.updateMany({
        where: { expiresAt: { lt: new Date(Date.now() + 11000) } },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      await expect(auth.phoneRequest(number, ip)).rejects.toMatchObject({
        status: 429,
      });
    });
    it("links a verified phone only to the authenticated account and keeps identity/history across phone login", async () => {
      const first = await register();
      await expect(
        auth.phoneLogin("synthetic-token", ip),
      ).rejects.toMatchObject({ status: 409 });
      await auth.linkPhone(bearer(first), "synthetic-token", ip);
      const linked = await auth.phoneLogin("synthetic-token", ip);
      expect(linked.customer.id).toBe(first.customer.id);
      expect(linked.customer.phoneNumber).toBe("+919876543210");
      const second = await register("other@selfx.invalid");
      await expect(
        auth.linkPhone(bearer(second), "synthetic-token", ip),
      ).rejects.toMatchObject({ status: 409 });
      expect((await auth.me(bearer(second))).phoneNumber).toBeNull();
      await db.customer.update({
        where: { id: first.customer.id },
        data: { status: "SUSPENDED" },
      });
      await expect(
        auth.phoneLogin("synthetic-token", ip),
      ).rejects.toMatchObject({ status: 401 });
    });
    it("does not extend phone-link authentication time through refresh, rejects stale/invalid proofs and fails closed without Firebase", async () => {
      const first = await register();
      await db.customerSession.updateMany({
        data: { authenticatedAt: new Date(Date.now() - 11 * 60000) },
      });
      const refreshed = await auth.refresh(first.refreshToken, ip);
      await expect(
        auth.linkPhone(bearer(refreshed!), "synthetic-token", ip),
      ).rejects.toMatchObject({ status: 403 });
      phone.verify.mockRejectedValueOnce(new Error("invalid"));
      await expect(
        auth.phoneLogin("synthetic-token", ip),
      ).rejects.toMatchObject({ status: 400 });
      phone.ready.mockReturnValue(false);
      expect(auth.capabilities().providers.phone).toBe(false);
      await expect(
        auth.phoneLogin("synthetic-token", ip),
      ).rejects.toMatchObject({ status: 503 });
      expect(
        await db.customerIdentity.count({
          where: { provider: "FIREBASE_PHONE" },
        }),
      ).toBe(0);
    });
    it("preserves signup language and keeps profile language changes isolated through refresh", async () => {
      const response = await auth.signup({ ...signup(), language: "ta" }, ip);
      const value = await code();
      await auth.verifyEmail(email, value, ip, response.signupProof);
      const first = await auth.login(email, password, ip);
      if (!("accessToken" in first)) throw new Error("Expected verified login");
      expect(await auth.me(bearer(first))).toMatchObject({ language: "ta" });
      const second = await register("second@selfx.invalid");
      await auth.updateProfile(bearer(first), { language: "ar" });
      expect(await auth.me(bearer(second))).toMatchObject({ language: "en" });
      const refreshed = await auth.refresh(first.refreshToken, ip);
      if (!refreshed) throw new Error("Expected refreshed session");
      expect(await auth.me(bearer(refreshed))).toMatchObject({
        language: "ar",
      });
    });
    it("moves phone registration through refresh and removes it on opt-out and sign-out", async () => {
      const first = await register();
      await auth.updateProfile(bearer(first), { notifications: true });
      const principal = await auth.requireCustomer(bearer(first));
      const addDevice = async (sessionId: string) =>
        db.customerPushDevice.create({
          data: {
            id: createSelfxId(),
            customerId: principal.customer.id,
            sessionId,
            installationId: createSelfxId(),
            tokenHash: "f".repeat(64),
            tokenCipher: crypto.encrypt({
              token: "synthetic-fid",
            }) as unknown as Prisma.InputJsonValue,
            platform: "ANDROID",
          },
        });
      await addDevice(principal.sessionId);
      const next = await auth.refresh(first.refreshToken, ip);
      if (!next) throw new Error("Expected refreshed customer session");
      const rotated = await auth.requireCustomer(bearer(next));
      expect(rotated.sessionId).not.toBe(principal.sessionId);
      expect((await db.customerPushDevice.findFirstOrThrow()).sessionId).toBe(
        rotated.sessionId,
      );
      await auth.updateProfile(bearer(next), { notifications: false });
      expect(await db.customerPushDevice.count()).toBe(0);
      await auth.updateProfile(bearer(next), { notifications: true });
      await addDevice(rotated.sessionId);
      await auth.logout(bearer(next));
      expect(await db.customerPushDevice.count()).toBe(0);
    });
    it("verifies signup, stores only hashed secrets and creates no merchant/staff rows", async () => {
      const staff = await db.user.count(),
        stores = await db.organization.count();
      const response = await auth.signup(signup(), ip);
      const job = await db.mailJob.findFirstOrThrow();
      expect(JSON.stringify(job.payload)).not.toContain(email);
      const value = await code();
      const token = await db.customerActionToken.findFirstOrThrow();
      expect(token.tokenHash).not.toContain(value);
      expect(
        await auth.verifyEmail(email, value, ip, response.signupProof),
      ).toHaveProperty("message");
      await expect(
        auth.verifyEmail(email, value, ip, response.signupProof),
      ).rejects.toMatchObject({ status: 400 });
      const login = await auth.login(email.toUpperCase(), password, ip);
      if (!("accessToken" in login)) throw new Error("Expected session");
      expect(await auth.me(bearer(login))).toMatchObject({
        email,
        displayName: "Ava Customer",
        methods: ["EMAIL_PASSWORD"],
      });
      expect(await db.customerSession.findFirst()).toMatchObject({
        tokenHash: expect.stringMatching(/^[0-9a-f]{64}$/),
      });
      expect(JSON.stringify(await db.customerSession.findMany())).not.toContain(
        login.refreshToken,
      );
      expect(await db.user.count()).toBe(staff);
      expect(await db.organization.count()).toBe(stores);
    });
    it("binds verification to the latest signup and password rather than a pre-registered account", async () => {
      const attacker = await auth.signup(
        { ...signup(), password: "attacker-chosen-password" },
        ip,
      );
      const oldCode = await code();
      const victim = await auth.signup(signup(), ip);
      const currentCode = await code();
      await expect(
        auth.verifyEmail(email, oldCode, ip, attacker.signupProof),
      ).rejects.toMatchObject({ status: 400 });
      await expect(
        auth.verifyEmail(email, currentCode, ip, attacker.signupProof),
      ).rejects.toMatchObject({ status: 400 });
      await auth.verifyEmail(email, currentCode, ip, victim.signupProof);
      await expect(
        auth.login(email, "attacker-chosen-password", ip),
      ).rejects.toMatchObject({ status: 401 });
      expect(await auth.login(email, password, ip)).toHaveProperty(
        "accessToken",
      );
    });
    it("does not replace an active password and returns generic email responses for unknown addresses", async () => {
      await register();
      await auth.signup(
        { ...signup(), password: "another-strong-password" },
        ip,
      );
      expect(await deliver()).toHaveLength(0);
      expect(await auth.login(email, password, ip)).toHaveProperty(
        "accessToken",
      );
      const known = await auth.requestCode(email, "RESET_PASSWORD", ip);
      const unknown = await auth.requestCode(
        "unknown@selfx.invalid",
        "RESET_PASSWORD",
        ip,
      );
      expect(known).toEqual(unknown);
      expect((await deliver()).every((message) => message.to === email)).toBe(
        true,
      );
    });
    it("rotates refresh tokens, revokes the old access session and persists family revocation on replay", async () => {
      const first = await register();
      const second = await auth.refresh(first.refreshToken, ip);
      expect(second!.refreshToken).not.toBe(first.refreshToken);
      await expect(auth.me(bearer(first))).rejects.toMatchObject({
        status: 401,
      });
      expect(await auth.me(bearer(second!))).toHaveProperty("email", email);
      await expect(auth.refresh(first.refreshToken, ip)).rejects.toMatchObject({
        status: 401,
      });
      await expect(
        auth.refresh(second!.refreshToken, ip),
      ).rejects.toMatchObject({ status: 401 });
      await expect(auth.me(bearer(second!))).rejects.toMatchObject({
        status: 401,
      });
      expect(
        await db.customerSession.count({ where: { revokedAt: null } }),
      ).toBe(0);
    });
    it("resets a password once, revokes every device and invalidates old JWTs", async () => {
      const first = await register();
      const second = await auth.login(email, password, ip);
      await auth.requestCode(email, "RESET_PASSWORD", ip);
      const value = await code();
      await auth.resetPassword(email, value, "a-new-long-passphrase", ip);
      await expect(
        auth.resetPassword(email, value, "a-different-passphrase", ip),
      ).rejects.toMatchObject({ status: 400 });
      await expect(auth.me(bearer(first))).rejects.toMatchObject({
        status: 401,
      });
      if (!("accessToken" in second)) throw new Error("Expected session");
      await expect(auth.refresh(second.refreshToken, ip)).rejects.toMatchObject(
        { status: 401 },
      );
      await expect(auth.login(email, password, ip)).rejects.toMatchObject({
        status: 401,
      });
      expect(
        await auth.login(email, "a-new-long-passphrase", ip),
      ).toHaveProperty("accessToken");
      const notifications = await deliver();
      expect(notifications).toHaveLength(1);
      expect(notifications[0]).toMatchObject({
        to: email,
        subject: "Your SelfX password was changed",
      });
      expect(notifications[0]!.text).toContain(
        "If you did not make this change",
      );
      for (const secret of [value, password, "a-new-long-passphrase"])
        expect(notifications[0]!.text).not.toContain(secret);
      expect(await deliver()).toHaveLength(0);
    });
    it("does not queue a notification for invalid codes or rolled-back password changes", async () => {
      const session = await register();
      await auth.requestCode(email, "RESET_PASSWORD", ip);
      const value = await code();
      await expect(
        auth.resetPassword(email, "invalid-code", "a-new-long-passphrase", ip),
      ).rejects.toMatchObject({ status: 400 });
      expect(await deliver()).toHaveLength(0);

      const enqueue = vi
        .spyOn(outbox, "enqueue")
        .mockRejectedValueOnce(new Error("Simulated queue failure"));
      try {
        await expect(
          auth.resetPassword(email, value, "a-new-long-passphrase", ip),
        ).rejects.toThrow("Simulated queue failure");
      } finally {
        enqueue.mockRestore();
      }
      expect(await deliver()).toHaveLength(0);
      await expect(auth.me(bearer(session))).resolves.toBeDefined();
      await expect(auth.login(email, password, ip)).resolves.toHaveProperty(
        "accessToken",
      );
      await auth.resetPassword(email, value, "a-new-long-passphrase", ip);
      expect(await deliver()).toHaveLength(1);
    });
    it("retries notification delivery without undoing a completed password reset", async () => {
      await register();
      await auth.requestCode(email, "RESET_PASSWORD", ip);
      const value = await code();
      await auth.resetPassword(email, value, "a-new-long-passphrase", ip);
      const job = await db.mailJob.findFirstOrThrow({
        where: { status: "PENDING", kind: "MESSAGE" },
      });
      const stored = JSON.stringify(job.payload);
      for (const secret of [email, value, "a-new-long-passphrase"])
        expect(stored).not.toContain(secret);
      sender.send.mockRejectedValueOnce(
        new MailDeliveryError("MAIL_DELIVERY_UNAVAILABLE"),
      );
      await outbox.processNext();
      expect(
        await db.mailJob.findUnique({ where: { id: job.id } }),
      ).toMatchObject({
        status: "PENDING",
        attempts: 1,
      });
      await expect(
        auth.login(email, "a-new-long-passphrase", ip),
      ).resolves.toHaveProperty("accessToken");
      await db.mailJob.update({
        where: { id: job.id },
        data: { availableAt: new Date(Date.now() - 1) },
      });
      expect(await deliver()).toHaveLength(1);
      expect(
        await db.mailJob.findUnique({ where: { id: job.id } }),
      ).toMatchObject({
        status: "SENT",
        attempts: 2,
        payload: null,
      });
    });
    it("rejects expired codes and durably limits guesses even across service instances", async () => {
      const response = await auth.signup(signup(), ip);
      const value = await code();
      await db.customerActionToken.updateMany({
        data: { expiresAt: new Date(Date.now() - 1) },
      });
      for (let i = 0; i < 5; i++)
        await expect(
          auth.verifyEmail(email, value, ip, response.signupProof),
        ).rejects.toMatchObject({ status: 400 });
      await expect(
        auth.verifyEmail(email, value, "127.0.0.2", response.signupProof),
      ).rejects.toMatchObject({ status: 429 });
    });
    it("uses customer JWT scope and server-side session state, and rejects suspended accounts", async () => {
      const session = await register();
      const claims = jwt.decode(session.accessToken) as Record<string, unknown>;
      for (const overrides of [{ typ: "access" }, { aud: "selfx-staff" }]) {
        const payload = { ...claims };
        delete payload.iat;
        delete payload.exp;
        const wrong = jwt.sign(
          { ...payload, ...overrides },
          { secret: auth.config.secret, expiresIn: 600 },
        );
        await expect(auth.me(`Bearer ${wrong}`)).rejects.toMatchObject({
          status: 401,
        });
      }
      await db.customer.updateMany({ data: { status: "SUSPENDED" } });
      await expect(auth.me(bearer(session))).rejects.toMatchObject({
        status: 401,
      });
      await expect(auth.login(email, password, ip)).rejects.toMatchObject({
        status: 401,
      });
    });
    it("keeps profiles isolated and requires reauthentication before deleting/anonymizing an account", async () => {
      const first = await register();
      const second = await register("second@selfx.invalid");
      await auth.updateProfile(bearer(first), {
        displayName: "Changed",
        notifications: true,
      });
      expect(await auth.me(bearer(second))).toMatchObject({
        displayName: "Ava Customer",
        notifications: false,
      });
      await expect(
        auth.deleteAccount(
          bearer(first),
          { confirmation: "DELETE", password: "incorrect-password" },
          ip,
        ),
      ).rejects.toMatchObject({ status: 403 });
      await auth.deleteAccount(
        bearer(first),
        { confirmation: "DELETE", password },
        ip,
      );
      await expect(auth.me(bearer(first))).rejects.toMatchObject({
        status: 401,
      });
      expect(
        await db.customer.findUnique({ where: { id: first.customer.id } }),
      ).toMatchObject({
        email: null,
        displayName: "Deleted account",
        status: "DELETED",
      });
      expect(
        await db.customerIdentity.count({
          where: { customerId: first.customer.id },
        }),
      ).toBe(0);
      expect(await auth.me(bearer(second))).toHaveProperty(
        "email",
        "second@selfx.invalid",
      );
    });
    it("automatically links an authoritative Google email to the verified existing account without resetting its wallet or password", async () => {
      const original = await register();
      const before = await db.customerIdentity.findFirstOrThrow({
        where: { customerId: original.customer.id, provider: "EMAIL_PASSWORD" },
      });
      await db.customerCreditAccount.create({
        data: {
          customerId: original.customer.id,
          trialCredits: 10,
          usedCredits: 4,
          reservedCredits: 1,
          trialPlanCode: "test-starter",
        },
      });
      const wallet = await db.customerCreditAccount.findUniqueOrThrow({
        where: { customerId: original.customer.id },
      });
      identities.verify.mockResolvedValue({
        subject: "trusted-google",
        email,
        name: "Different Google name",
        emailAuthoritative: true,
      });
      const input = {
        provider: "GOOGLE" as const,
        idToken: "synthetic-google-id-token",
      };
      const [first, second] = await Promise.all([
        auth.oauth(input, ip),
        auth.oauth(input, ip),
      ]);
      expect(first.customer.id).toBe(original.customer.id);
      expect(second.customer.id).toBe(original.customer.id);
      expect(first.customer.displayName).toBe("Ava Customer");
      expect(await db.customer.count()).toBe(1);
      expect(
        await db.customerIdentity.count({ where: { provider: "GOOGLE" } }),
      ).toBe(1);
      expect(
        await db.customerIdentity.findUnique({ where: { id: before.id } }),
      ).toEqual(before);
      expect(
        await db.customerCreditAccount.findUnique({
          where: { customerId: original.customer.id },
        }),
      ).toEqual(wallet);
      expect(await auth.me(bearer(original))).toMatchObject({
        id: original.customer.id,
        methods: expect.arrayContaining(["EMAIL_PASSWORD", "GOOGLE"]),
      });
      expect(await auth.login(email, password, ip)).toMatchObject({
        customer: { id: original.customer.id },
      });
    });
    it.each(["PENDING_VERIFICATION", "SUSPENDED", "DELETED"] as const)(
      "does not automatically link or activate a %s customer",
      async (status) => {
        const original = await register();
        await db.customer.update({
          where: { id: original.customer.id },
          data: { status },
        });
        identities.verify.mockResolvedValue({
          subject: "trusted-google",
          email,
          name: null,
          emailAuthoritative: true,
        });
        await expect(
          auth.oauth(
            {
              provider: "GOOGLE",
              idToken: "synthetic-google-id-token",
              acceptTerms: true,
              termsVersion: CUSTOMER_TERMS_VERSION,
            },
            ip,
          ),
        ).rejects.toMatchObject({
          status: status === "PENDING_VERIFICATION" ? 409 : 401,
        });
        expect(
          await db.customerIdentity.count({ where: { provider: "GOOGLE" } }),
        ).toBe(0);
        expect(
          (
            await db.customer.findUniqueOrThrow({
              where: { id: original.customer.id },
            })
          ).status,
        ).toBe(status);
      },
    );
    it("requires extra verification for third-party email, missing SelfX email proof and a conflicting Google subject", async () => {
      const original = await register();
      const input = {
        provider: "GOOGLE" as const,
        idToken: "synthetic-google-id-token",
        acceptTerms: true,
        termsVersion: CUSTOMER_TERMS_VERSION,
      };
      identities.verify.mockResolvedValue({
        subject: "third-party-google",
        email,
        name: null,
        emailAuthoritative: false,
      });
      await expect(auth.oauth(input, ip)).rejects.toMatchObject({
        status: 409,
      });
      identities.verify.mockResolvedValue({
        subject: "trusted-google",
        email,
        name: null,
        emailAuthoritative: true,
      });
      await db.customerIdentity.updateMany({
        where: { customerId: original.customer.id },
        data: { verifiedAt: null },
      });
      await expect(auth.oauth(input, ip)).rejects.toMatchObject({
        status: 409,
      });
      await db.customerIdentity.updateMany({
        where: { customerId: original.customer.id },
        data: { verifiedAt: new Date() },
      });
      await db.customerIdentity.create({
        data: {
          id: createSelfxId(),
          customerId: original.customer.id,
          provider: "GOOGLE",
          providerSubject: "existing-other-google",
          email,
          verifiedAt: new Date(),
        },
      });
      await expect(auth.oauth(input, ip)).rejects.toMatchObject({
        status: 409,
      });
      expect(await db.customer.count()).toBe(1);
      expect(
        await db.customerIdentity.count({ where: { provider: "GOOGLE" } }),
      ).toBe(1);
    });
    it("requires explicit new OAuth signup and extra verification for ambiguous provider matches", async () => {
      const input = {
        provider: "GOOGLE" as const,
        idToken: "synthetic-google-id-token",
      };
      await expect(auth.oauth(input, ip)).rejects.toMatchObject({
        status: 409,
      });
      const session = await auth.oauth(
        { ...input, acceptTerms: true, termsVersion: CUSTOMER_TERMS_VERSION },
        ip,
      );
      expect(await auth.me(bearer(session))).toMatchObject({
        methods: ["GOOGLE"],
      });
      expect(await auth.oauth(input, ip)).toHaveProperty("accessToken");
      identities.verify.mockResolvedValue({
        subject: "different-provider-subject",
        email,
        name: "Other",
      });
      await expect(
        auth.oauth(
          { ...input, acceptTerms: true, termsVersion: CUSTOMER_TERMS_VERSION },
          ip,
        ),
      ).rejects.toMatchObject({ status: 409 });
      expect(await db.customer.count()).toBe(1);
    });
    it("uses a short-lived, single-use Apple nonce and verifies OAuth ownership for deletion", async () => {
      const challenge = await auth.appleChallenge(ip);
      const input = {
        provider: "APPLE" as const,
        idToken: "synthetic-apple-id-token",
        challengeId: challenge.challengeId,
        acceptTerms: true,
        termsVersion: CUSTOMER_TERMS_VERSION,
      };
      identities.verify.mockResolvedValue({
        subject: "apple-subject",
        email,
        name: null,
      });
      const session = await auth.oauth(input, ip);
      expect(identities.verify).toHaveBeenCalledWith(
        "APPLE",
        input.idToken,
        challenge.nonceHash,
      );
      await expect(auth.oauth(input, ip)).rejects.toMatchObject({
        status: 401,
      });
      const next = await auth.appleChallenge(ip);
      await auth.deleteAccount(
        bearer(session),
        { confirmation: "DELETE", ...input, challengeId: next.challengeId },
        ip,
      );
      await expect(auth.me(bearer(session))).rejects.toMatchObject({
        status: 401,
      });
    });
    it("invalidates only the current session on logout and every device on logout-all", async () => {
      const first = await register();
      const second = await auth.login(email, password, ip);
      if (!("accessToken" in second)) throw new Error("Expected session");
      await auth.logout(bearer(first));
      await expect(auth.me(bearer(first))).rejects.toMatchObject({
        status: 401,
      });
      expect(await auth.me(bearer(second))).toHaveProperty("email", email);
      await auth.logout(bearer(second), true);
      await expect(auth.refresh(second.refreshToken, ip)).rejects.toMatchObject(
        { status: 401 },
      );
    });
    it("rejects client supplied roles, customer ids, tenant ids and unaccepted terms", async () => {
      const pipe = new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      });
      for (const field of ["customerId", "organizationId", "role"]) {
        await expect(
          pipe.transform(
            { displayName: "Name", [field]: "attacker" },
            { type: "body", metatype: CustomerProfileDto },
          ),
        ).rejects.toThrow();
      }
      await expect(
        pipe.transform(
          { ...signup(), acceptTerms: false },
          { type: "body", metatype: CustomerSignupDto },
        ),
      ).rejects.toThrow();
    });
  },
);
