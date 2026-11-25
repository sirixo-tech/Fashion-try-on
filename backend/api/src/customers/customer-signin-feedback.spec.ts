import "reflect-metadata";
import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { JwtService } from "@nestjs/jwt";
import type { PrismaService } from "../database/prisma.service.js";
import type { PasswordService } from "../auth/password.service.js";
import type { MailSettingsService } from "../mail/mail-settings.service.js";
import type { MailOutboxService } from "../mail/mail-outbox.service.js";
import type { MailCrypto } from "../mail/mail-crypto.js";
import type { CustomerIdentityClient } from "./customer-identity.client.js";
import type { CustomerPhoneClient } from "./customer-phone.client.js";
import { CustomerAuthService } from "./customer-auth.service.js";

describe("Customer sign-in account feedback", () => {
  const account = {
    id: randomUUID(),
    email: "customer@example.test",
    displayName: "Customer",
    status: "ACTIVE",
    securityVersion: 0,
    language: "en",
    notifications: false,
    termsVersion: "2026-10-26",
    termsAcceptedAt: new Date(),
    createdAt: new Date(),
    phoneNumber: "+919876543210",
    phoneVerifiedAt: new Date(),
  };
  const identity = {
    customerId: account.id,
    passwordHash: "stored-hash",
    customer: account,
  };
  const db = {
    $transaction: vi.fn(),
    $queryRaw: vi.fn(),
    customer: {
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      update: vi.fn(),
    },
    customerIdentity: { findUnique: vi.fn(), findMany: vi.fn() },
    customerSession: { create: vi.fn() },
  };
  const passwords = { hashPassword: vi.fn(), verifyPassword: vi.fn() };
  const jwt = { signAsync: vi.fn() };
  const phone = { ready: vi.fn(), verify: vi.fn() };
  let auth: CustomerAuthService;
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("SELFX_CUSTOMER_AUTH_ENABLED", "true");
    vi.stubEnv(
      "SELFX_CUSTOMER_JWT_SECRET",
      "signin-test-secret-unique-to-customers-20261125",
    );
    db.$queryRaw.mockResolvedValue([{ count: 1 }]);
    db.$transaction.mockImplementation(async (work) => work(db));
    db.customerIdentity.findUnique.mockResolvedValue(null);
    db.customerIdentity.findMany.mockResolvedValue([]);
    db.customer.findUnique.mockResolvedValue(null);
    db.customer.findUniqueOrThrow.mockResolvedValue(account);
    db.customerSession.create.mockResolvedValue({ id: randomUUID() });
    passwords.hashPassword.mockResolvedValue("dummy-hash");
    passwords.verifyPassword.mockResolvedValue(false);
    jwt.signAsync.mockResolvedValue("access-token");
    phone.ready.mockReturnValue(true);
    phone.verify.mockResolvedValue({
      subject: "firebase-owner",
      phoneNumber: account.phoneNumber,
    });
    auth = new CustomerAuthService(
      db as unknown as PrismaService,
      passwords as unknown as PasswordService,
      jwt as unknown as JwtService,
      {} as CustomerIdentityClient,
      {} as MailSettingsService,
      {} as MailOutboxService,
      {} as MailCrypto,
      phone as unknown as CustomerPhoneClient,
    );
  });
  afterEach(() => vi.unstubAllEnvs());

  async function rejectedLogin(
    code: string,
    status: number,
    input = account.email,
  ) {
    await expect(
      auth.login(input, "incorrect", "127.0.0.1"),
    ).rejects.toMatchObject({
      status,
      response: { error: { code } },
    });
    expect(passwords.verifyPassword).toHaveBeenCalled();
    expect(db.customerSession.create).not.toHaveBeenCalled();
  }
  it("reports an unknown customer email and still verifies the dummy hash", async () => {
    await rejectedLogin(
      "CUSTOMER_ACCOUNT_NOT_FOUND",
      404,
      "  UNKNOWN@EXAMPLE.TEST  ",
    );
    expect(db.customer.findUnique).toHaveBeenCalledWith({
      where: { email: "unknown@example.test" },
    });
    expect(passwords.verifyPassword).toHaveBeenCalledWith(
      "dummy-hash",
      "incorrect",
    );
    expect(db.$queryRaw).toHaveBeenCalledTimes(2);
  });
  it.each([true, false])(
    "reports a deleted account as missing regardless of password validity (%s)",
    async (valid) => {
      db.customerIdentity.findUnique.mockResolvedValue({
        ...identity,
        customer: { ...account, status: "DELETED" },
      });
      passwords.verifyPassword.mockResolvedValue(valid);
      await rejectedLogin("CUSTOMER_ACCOUNT_NOT_FOUND", 404);
    },
  );
  it("separates an incorrect password on an existing account", async () => {
    db.customerIdentity.findUnique.mockResolvedValue(identity);
    await expect(
      auth.login(account.email, "incorrect", "127.0.0.1"),
    ).rejects.toMatchObject({
      status: 401,
      response: {
        error: {
          code: "CUSTOMER_INVALID_CREDENTIALS",
          message: "Incorrect password. Try again or reset your password.",
        },
      },
    });
    expect(db.customerSession.create).not.toHaveBeenCalled();
  });
  it.each([true, false])(
    "keeps suspended accounts unavailable regardless of password validity (%s)",
    async (valid) => {
      db.customerIdentity.findUnique.mockResolvedValue({
        ...identity,
        customer: { ...account, status: "SUSPENDED" },
      });
      passwords.verifyPassword.mockResolvedValue(valid);
      await rejectedLogin("CUSTOMER_ACCOUNT_UNAVAILABLE", 403);
    },
  );
  it.each([
    ["GOOGLE", "Google"],
    ["APPLE", "Apple"],
  ])(
    "directs a provider-only %s account to its existing sign-in method",
    async (provider, name) => {
      db.customer.findUnique.mockResolvedValue(account);
      db.customerIdentity.findMany.mockResolvedValue([{ provider }]);
      await expect(
        auth.login(account.email, "anything", "127.0.0.1"),
      ).rejects.toMatchObject({
        status: 409,
        response: {
          error: {
            code: "CUSTOMER_PASSWORD_NOT_SET",
            message: `Sign in with ${name} for this account, or reset your password.`,
          },
        },
      });
      expect(db.customerIdentity.findMany).toHaveBeenCalledWith({
        where: { customerId: account.id },
        select: { provider: true },
      });
      expect(db.customerSession.create).not.toHaveBeenCalled();
    },
  );
  it("gives method/recovery guidance when a known account has no password or OAuth identity", async () => {
    db.customer.findUnique.mockResolvedValue(account);
    await rejectedLogin("CUSTOMER_PASSWORD_NOT_SET", 409);
  });
  it("never guesses among ambiguous legacy phone aliases", async () => {
    db.customerIdentity.findMany.mockResolvedValue([
      identity,
      { ...identity, customerId: randomUUID() },
    ]);
    await rejectedLogin(
      "CUSTOMER_EMAIL_SIGN_IN_REQUIRED",
      409,
      account.phoneNumber,
    );
  });
  it("does not claim an unlinked phone means the customer has no email account", async () => {
    await rejectedLogin("CUSTOMER_PHONE_NOT_LINKED", 409, account.phoneNumber);
  });
  it("retains normal session creation for a verified password", async () => {
    db.customerIdentity.findUnique.mockResolvedValue(identity);
    passwords.verifyPassword.mockResolvedValue(true);
    expect(
      await auth.login(account.email, "correct", "127.0.0.1"),
    ).toHaveProperty("accessToken", "access-token");
    expect(db.customerSession.create).toHaveBeenCalledTimes(1);
    expect(db.customerSession.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ customerId: account.id }),
      }),
    );
  });
  it("retains the existing rate-limit rejection before account lookup", async () => {
    db.$queryRaw.mockResolvedValue([{ count: 31 }]);
    await expect(
      auth.login(account.email, "incorrect", "127.0.0.1"),
    ).rejects.toMatchObject({ status: 429 });
    expect(db.customerIdentity.findUnique).not.toHaveBeenCalled();
    expect(db.customerSession.create).not.toHaveBeenCalled();
  });
  it.each(["SUSPENDED", "PENDING_VERIFICATION"])(
    "keeps %s phone accounts blocked with explicit availability feedback",
    async (status) => {
      db.customerIdentity.findUnique.mockResolvedValue({
        customer: { ...account, status },
      });
      await expect(
        auth.phoneLogin("firebase-token", "127.0.0.1", undefined, true),
      ).rejects.toMatchObject({
        status: 403,
        response: { error: { code: "CUSTOMER_ACCOUNT_UNAVAILABLE" } },
      });
      expect(db.customer.update).not.toHaveBeenCalled();
      expect(db.customerSession.create).not.toHaveBeenCalled();
    },
  );
  it("keeps deleted phone identities unlinked and never creates a session", async () => {
    db.customerIdentity.findUnique.mockResolvedValue({
      customer: { ...account, status: "DELETED" },
    });
    await expect(
      auth.phoneLogin("firebase-token", "127.0.0.1", undefined, true),
    ).rejects.toMatchObject({
      status: 409,
      response: { error: { code: "CUSTOMER_PHONE_NOT_LINKED" } },
    });
    expect(db.customerSession.create).not.toHaveBeenCalled();
  });
  it("does not disclose account status for invalid Firebase proof", async () => {
    phone.verify.mockRejectedValue(new Error("invalid proof"));
    await expect(
      auth.phoneLogin("invalid", "127.0.0.1", undefined, true),
    ).rejects.toMatchObject({
      status: 400,
      response: { error: { code: "CUSTOMER_PHONE_INVALID" } },
    });
    expect(db.customerIdentity.findUnique).not.toHaveBeenCalled();
  });
});
