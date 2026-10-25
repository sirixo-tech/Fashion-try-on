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
import { ValidationPipe } from "@nestjs/common";
import { PasswordService } from "../auth/password.service.js";
import { PrismaService } from "../database/prisma.service.js";
import { MailCrypto } from "../mail/mail-crypto.js";
import { MailOutboxService } from "../mail/mail-outbox.service.js";
import { MailSettingsService } from "../mail/mail-settings.service.js";
import { SmtpSender } from "../mail/smtp-sender.js";
import { CustomerAuthService } from "./customer-auth.service.js";
import { CustomerIdentityClient } from "./customer-identity.client.js";
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
      return last!.text.match(/code is (\d{8})/)![1]!;
    }
    async function register(address = email) {
      const result = await auth.signup(signup(address), ip);
      const messages = await deliver();
      const value = messages.at(-1)!.text.match(/code is (\d{8})/)![1]!;
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
      await db.customer.deleteMany();
      await db.customerActionToken.deleteMany();
      await db.passwordRecoveryRateBucket.deleteMany();
      sender.send.mockReset().mockResolvedValue();
      identities.verify
        .mockReset()
        .mockResolvedValue({ subject: "google-subject", email, name: "Ava" });
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
      );
      auth.onModuleInit();
    });
    afterAll(async () => {
      auth?.onModuleDestroy();
      await db.mailJob.deleteMany();
      await db.customer.deleteMany();
      await db.customerActionToken.deleteMany();
      await db.passwordRecoveryRateBucket.deleteMany();
      await db.$disconnect();
      vi.unstubAllEnvs();
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
    it("requires explicit OAuth signup and never merges matching provider emails automatically", async () => {
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
