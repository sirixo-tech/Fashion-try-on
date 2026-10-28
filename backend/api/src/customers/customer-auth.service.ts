import { createHash, createHmac, randomBytes, randomInt } from "node:crypto";
import {
  Injectable,
  Optional,
  type OnModuleInit,
  type OnModuleDestroy,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import {
  Prisma,
  type Customer,
  type CustomerActionPurpose,
  type MailJob,
} from "@prisma/client";
import { createSelfxId } from "@selfx/database";
import { PasswordService } from "../auth/password.service.js";
import { PrismaService } from "../database/prisma.service.js";
import { MailCrypto, type MailEnvelope } from "../mail/mail-crypto.js";
import { MailOutboxService } from "../mail/mail-outbox.service.js";
import { MailSettingsService } from "../mail/mail-settings.service.js";
import {
  customerConfig,
  customerError,
  CUSTOMER_TERMS_VERSION,
} from "./customer.config.js";
import { CustomerIdentityClient } from "./customer-identity.client.js";
import { CUSTOMER_LANGUAGES } from "./customer-languages.js";
import { CustomerPhoneClient } from "./customer-phone.client.js";
import { ApiErrorException } from "../common/api-error.exception.js";
import {
  type CustomerDeleteDto,
  type CustomerOAuthDto,
  type CustomerSignupDto,
  type CustomerProfileDto,
  type CustomerOAuthLinkDto,
} from "./customer.dto.js";

const audience = "selfx-customer";
const codeTtl = 10 * 60000;
const genericEmail = {
  message:
    "If this address is eligible, an email with a 6-digit code will arrive shortly. Check your spam folder too.",
  resendAfterSeconds: 60,
};
const tokenSecret = () => randomBytes(32).toString("base64url");
const normalize = (email: string) => email.trim().toLowerCase();
const unauthorized = (): never =>
  customerError("CUSTOMER_UNAUTHORIZED", "Please sign in again.", 401);
type AccessClaims = {
  sub: string;
  sid: string;
  ver: number;
  typ: "customer_access";
};

@Injectable()
export class CustomerAuthService implements OnModuleInit, OnModuleDestroy {
  readonly config = customerConfig();
  private cleanupTimer?: ReturnType<typeof setInterval>;
  private dummyHash?: Promise<string>;
  constructor(
    private readonly db: PrismaService,
    private readonly passwords: PasswordService,
    private readonly jwt: JwtService,
    private readonly identities: CustomerIdentityClient,
    private readonly mail: MailSettingsService,
    private readonly outbox: MailOutboxService,
    private readonly crypto: MailCrypto,
    @Optional() private readonly phone?: CustomerPhoneClient,
  ) {}
  onModuleInit() {
    this.outbox.prepareCustomerAuth = (job) => this.prepareMail(job);
    if (this.config.enabled) {
      this.cleanupTimer = setInterval(
        () => void this.cleanup().catch(() => {}),
        3600000,
      );
      this.cleanupTimer.unref();
    }
  }
  onModuleDestroy() {
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);
  }
  assertEnabled() {
    if (!this.config.enabled)
      customerError(
        "CUSTOMER_AUTH_UNAVAILABLE",
        "Customer accounts are not available yet.",
        503,
      );
  }
  capabilities() {
    return {
      enabled: this.config.enabled,
      providers: {
        google: this.config.enabled && this.config.googleClientIds.length > 0,
        apple: this.config.enabled && this.config.appleClientIds.length > 0,
        phone: this.config.enabled && (this.phone?.ready() ?? false),
        emailCode: this.config.enabled,
      },
      termsVersion: CUSTOMER_TERMS_VERSION,
      languages: CUSTOMER_LANGUAGES,
      resultRetentionDays: 30,
      codeLength: 6,
      features: {
        tryOn: false,
        plans: false,
        storeQr: false,
        referrals: false,
      },
    };
  }
  private digest(scope: string, value: string) {
    return createHmac("sha256", this.config.secret)
      .update(`customer:${scope}:${value}`)
      .digest("hex");
  }
  async rate(
    scope: string,
    value: string,
    maximum: number,
    windowMs = 15 * 60000,
  ) {
    this.assertEnabled();
    const key = this.digest(`rate:${scope}`, value),
      expires = new Date(Date.now() + windowMs);
    const rows = await this.db.$queryRaw<Array<{ count: number }>>`
      INSERT INTO password_recovery_rate_buckets (key, count, expires_at) VALUES (${key}, 1, ${expires})
      ON CONFLICT (key) DO UPDATE SET count = CASE WHEN password_recovery_rate_buckets.expires_at <= NOW() THEN 1 ELSE password_recovery_rate_buckets.count + 1 END,
      expires_at = CASE WHEN password_recovery_rate_buckets.expires_at <= NOW() THEN EXCLUDED.expires_at ELSE password_recovery_rate_buckets.expires_at END RETURNING count`;
    return (rows[0]?.count ?? maximum + 1) <= maximum;
  }
  async limitExperience(
    scope: "upload" | "run" | "session" | "store",
    customerId: string,
    ip: string,
  ) {
    await this.limit(
      `experience-${scope}-customer`,
      customerId,
      scope === "upload" ? 40 : 20,
    );
    await this.limit(`experience-${scope}-ip`, ip, 300);
  }

  private async limit(scope: string, value: string, maximum = 20) {
    if (!(await this.rate(scope, value, maximum)))
      customerError(
        "CUSTOMER_RATE_LIMITED",
        "Too many attempts. Please try again in 15 minutes.",
        429,
      );
  }
  private async assertEmailReady() {
    if (!this.crypto.ready())
      customerError(
        "CUSTOMER_EMAIL_UNAVAILABLE",
        "Email verification is temporarily unavailable. Please try again later.",
        503,
      );
    try {
      await this.mail.account();
    } catch {
      customerError(
        "CUSTOMER_EMAIL_UNAVAILABLE",
        "Email verification is temporarily unavailable. Please try again later.",
        503,
      );
    }
  }
  private async queueEmail(
    tx: Prisma.TransactionClient,
    email: string,
    purpose: "VERIFY_EMAIL" | "RESET_PASSWORD" | "EMAIL_LOGIN",
    proofHash?: string,
  ) {
    await this.outbox.enqueue(
      "CUSTOMER_AUTH_REQUEST",
      { email, purpose, proofHash },
      new Date(Date.now() + codeTtl),
      tx,
    );
  }
  async signup(input: CustomerSignupDto, ip: string) {
    this.assertEnabled();
    await this.limit("signup-ip", ip, 10);
    await this.assertEmailReady();
    const email = normalize(input.email);
    const signupProof = tokenSecret(),
      proofHash = this.digest("signup-proof", signupProof);
    const passwordHash = await this.passwords.hashPassword(input.password);
    if (!(await this.rate("email-request", email, 3)))
      return { ...genericEmail, signupProof };
    await this.db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('selfx.customer.email'), hashtext(${email}))`;
      const existing = await tx.customer.findUnique({ where: { email } });
      if (!existing) {
        await tx.customer.create({
          data: {
            id: createSelfxId(),
            email,
            pendingPhoneNumber: input.phoneNumber ?? null,
            displayName: input.displayName.trim(),
            language: input.language ?? "en",
            termsVersion: input.termsVersion,
            termsAcceptedAt: new Date(),
            verificationProofHash: proofHash,
            identities: {
              create: {
                id: createSelfxId(),
                provider: "EMAIL_PASSWORD",
                providerSubject: email,
                email,
                passwordHash,
              },
            },
          },
        });
      }
      if (existing?.status === "PENDING_VERIFICATION") {
        await tx.customer.update({
          where: { id: existing.id },
          data: {
            verificationProofHash: proofHash,
            securityVersion: { increment: 1 },
            ...(input.language ? { language: input.language } : {}),
            displayName: input.displayName.trim(),
            termsVersion: input.termsVersion,
            pendingPhoneNumber: input.phoneNumber ?? null,
            termsAcceptedAt: new Date(),
          },
        });
        await tx.customerIdentity.updateMany({
          where: { customerId: existing.id, provider: "EMAIL_PASSWORD" },
          data: { passwordHash },
        });
      }
      await this.queueEmail(tx, email, "VERIFY_EMAIL", proofHash);
    });
    return { ...genericEmail, signupProof };
  }
  async requestCode(
    emailInput: string,
    purpose: "VERIFY_EMAIL" | "RESET_PASSWORD",
    ip: string,
    signupProof?: string,
  ) {
    await this.limit("email-ip", ip, 10);
    await this.assertEmailReady();
    const email = normalize(emailInput);
    if (
      (await this.rate("email-request", email, 3)) &&
      (await this.rate(`email-cooldown-${purpose}`, email, 1, 60000))
    )
      await this.queueEmail(
        this.db,
        email,
        purpose,
        signupProof ? this.digest("signup-proof", signupProof) : undefined,
      );
    return genericEmail;
  }
  async prepareMail(job: MailJob): Promise<MailJob | null> {
    this.assertEnabled();
    const input = this.crypto.decrypt<{
      email: string;
      purpose: "VERIFY_EMAIL" | "RESET_PASSWORD" | "EMAIL_LOGIN";
      proofHash?: string;
    }>(job.payload as unknown as MailEnvelope);
    if (
      !["VERIFY_EMAIL", "RESET_PASSWORD", "EMAIL_LOGIN"].includes(input.purpose)
    )
      return null;
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM customers WHERE email = ${input.email} FOR UPDATE`;
      const customer = await tx.customer.findUnique({
        where: { email: input.email },
      });
      const expected =
        input.purpose === "VERIFY_EMAIL" ? "PENDING_VERIFICATION" : "ACTIVE";
      if (
        !customer ||
        customer.status !== expected ||
        customer.createdAt > job.createdAt ||
        job.expiresAt <= new Date()
      )
        return null;
      if (
        input.purpose === "VERIFY_EMAIL" &&
        (!input.proofHash || customer.verificationProofHash !== input.proofHash)
      )
        return null;
      // Older leased mail jobs cannot replace a newer code.
      const newer = await tx.customerActionToken.findFirst({
        where: {
          customerId: customer.id,
          purpose: input.purpose,
          createdAt: { gt: job.createdAt },
        },
      });
      if (newer) return null;
      await tx.customerActionToken.updateMany({
        where: {
          customerId: customer.id,
          purpose: input.purpose,
          usedAt: null,
        },
        data: { usedAt: new Date() },
      });
      const code = String(randomInt(0, 1000000)).padStart(6, "0");
      const token = await tx.customerActionToken.create({
        data: {
          id: createSelfxId(),
          customerId: customer.id,
          purpose: input.purpose,
          tokenHash: this.digest(
            input.purpose,
            `${input.email}:${code}${input.purpose === "EMAIL_LOGIN" ? `:${input.proofHash}` : ""}`,
          ),
          securityVersion: customer.securityVersion,
          expiresAt: job.expiresAt,
          createdAt: job.createdAt,
        },
      });
      const action =
        input.purpose === "VERIFY_EMAIL"
          ? "Verify your email"
          : input.purpose === "EMAIL_LOGIN"
            ? "Sign in to SelfX"
            : "Reset your password";
      const message = {
        to: input.email,
        subject: `${action} · SelfX`,
        text: `Your SelfX code is ${code}.\n\nEnter it in the SelfX customer app to ${input.purpose === "VERIFY_EMAIL" ? "verify your email" : input.purpose === "EMAIL_LOGIN" ? "sign in" : "reset your password"}. It expires 10 minutes after the request and can be used once.\n\nIf you did not request this, ignore this email. Never share your code.`,
        customerTokenId: token.id,
      };
      const updated = await tx.mailJob.updateMany({
        where: { id: job.id, status: "PROCESSING", leaseUntil: job.leaseUntil },
        data: {
          kind: "MESSAGE",
          payload: this.crypto.encrypt(
            message,
          ) as unknown as Prisma.InputJsonValue,
        },
      });
      if (updated.count !== 1) throw new Error("MAIL_LEASE_LOST");
      return tx.mailJob.findUniqueOrThrow({ where: { id: job.id } });
    });
  }
  async requestEmailLogin(
    emailInput: string,
    ip: string,
    previousProof?: string,
  ) {
    await this.limit("email-login-ip", ip, 10);
    await this.assertEmailReady();
    const email = normalize(emailInput),
      loginProof = previousProof ?? tokenSecret();
    if (
      (await this.rate("email-login-request", email, 3)) &&
      (await this.rate("email-login-cooldown", email, 1, 60000))
    ) {
      await this.queueEmail(
        this.db,
        email,
        "EMAIL_LOGIN",
        this.digest("email-login-proof", loginProof),
      );
    }
    return { ...genericEmail, loginProof };
  }
  async emailLogin(
    email: string,
    code: string,
    loginProof: string,
    ip: string,
    deviceName?: string,
  ) {
    return this.consumeCode(
      normalize(email),
      code,
      "EMAIL_LOGIN",
      ip,
      (tx, customer) =>
        this.createSession(
          tx,
          customer.id,
          deviceName,
          customer.securityVersion,
        ),
      loginProof,
    );
  }
  private assertPhoneReady() {
    this.assertEnabled();
    if (!this.phone?.ready())
      customerError(
        "CUSTOMER_PHONE_UNAVAILABLE",
        "Phone sign-in is not configured yet.",
        503,
      );
  }
  private async verifiedPhone(idToken: string) {
    this.assertPhoneReady();
    try {
      return await this.phone!.verify(idToken);
    } catch {
      customerError(
        "CUSTOMER_PHONE_INVALID",
        "Phone verification expired or failed. Request a new code.",
        400,
      );
    }
  }
  async phoneRequest(phoneNumber: string, ip: string) {
    this.assertPhoneReady();
    await this.db.$transaction(async (tx) => {
      // Admission is atomic. Rejected cooldown retries consume no send budget.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('selfx.phone.ip'), hashtext(${ip}))`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('selfx.phone.number'), hashtext(${phoneNumber}))`;
      const cooldownKey = this.digest("rate:phone-cooldown-v2", phoneNumber);
      const current = await tx.passwordRecoveryRateBucket.findUnique({
        where: { key: cooldownKey },
      });
      const now = new Date();
      if (current && current.expiresAt > now) {
        throw new ApiErrorException(
          429,
          "CUSTOMER_PHONE_COOLDOWN",
          "Please wait before requesting another code.",
          Math.max(
            1,
            Math.ceil((current.expiresAt.getTime() - now.getTime()) / 1000),
          ),
        );
      }
      for (const [scope, value, maximum, windowMs] of [
        ["phone-number-hour-v2", phoneNumber, 30, 3600000],
        ["phone-ip-hour-v2", ip, 120, 3600000],
        ["phone-number-day-v2", phoneNumber, 100, 86400000],
      ] as const) {
        const key = this.digest(`rate:${scope}`, value),
          expires = new Date(now.getTime() + windowMs);
        const [bucket] = await tx.$queryRaw<
          Array<{ count: number; expiresAt: Date }>
        >`
          INSERT INTO password_recovery_rate_buckets (key, count, expires_at) VALUES (${key}, 1, ${expires})
          ON CONFLICT (key) DO UPDATE SET count = CASE WHEN password_recovery_rate_buckets.expires_at <= NOW() THEN 1 ELSE password_recovery_rate_buckets.count + 1 END,
          expires_at = CASE WHEN password_recovery_rate_buckets.expires_at <= NOW() THEN EXCLUDED.expires_at ELSE password_recovery_rate_buckets.expires_at END RETURNING count, expires_at AS "expiresAt"`;
        if (!bucket || bucket.count > maximum) {
          throw new ApiErrorException(
            429,
            "CUSTOMER_RATE_LIMITED",
            "Too many phone verification requests. Please try again later.",
            bucket
              ? Math.max(
                  1,
                  Math.ceil(
                    (bucket.expiresAt.getTime() - now.getTime()) / 1000,
                  ),
                )
              : 3600,
          );
        }
      }
      await tx.passwordRecoveryRateBucket.upsert({
        where: { key: cooldownKey },
        create: {
          key: cooldownKey,
          count: 1,
          expiresAt: new Date(now.getTime() + 10000),
        },
        update: { count: 1, expiresAt: new Date(now.getTime() + 10000) },
      });
    });
    return {
      projectId: process.env.SELFX_CUSTOMER_FIREBASE_PROJECT_ID,
      resendAfterSeconds: 10,
    };
  }
  async phoneLogin(idToken: string, ip: string, deviceName?: string) {
    await this.limit("phone-login-ip", ip, 20);
    const verified = await this.verifiedPhone(idToken);
    const identity = await this.db.customerIdentity.findUnique({
      where: {
        provider_providerSubject: {
          provider: "FIREBASE_PHONE",
          providerSubject: verified!.subject,
        },
      },
      include: { customer: true },
    });
    if (
      !identity ||
      identity.customer.phoneNumber !== verified!.phoneNumber ||
      !identity.customer.phoneVerifiedAt
    )
      customerError(
        "CUSTOMER_PHONE_NOT_LINKED",
        "This phone is not linked. Sign in with email or create an account, then verify your phone in Account settings.",
        409,
      );
    return this.newSession(
      identity!.customerId,
      deviceName,
      identity!.customer.securityVersion,
    );
  }
  async linkPhone(header: string | undefined, idToken: string, ip: string) {
    const principal = await this.requireCustomer(header);
    await this.limit("phone-link-customer", principal.customer.id, 5);
    await this.limit("phone-link-ip", ip, 20);
    const verified = await this.verifiedPhone(idToken);
    try {
      await this.db.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('selfx.customer.phone'), hashtext(${verified!.phoneNumber}))`;
        await tx.$queryRaw`SELECT id FROM customers WHERE id = ${principal.customer.id}::uuid FOR UPDATE`;
        const session = await tx.customerSession.findUnique({
          where: { id: principal.sessionId },
          include: { customer: true },
        });
        if (
          !session ||
          session.revokedAt ||
          session.expiresAt <= new Date() ||
          session.customer.status !== "ACTIVE" ||
          session.customer.securityVersion !==
            principal.customer.securityVersion
        )
          unauthorized();
        if (session!.authenticatedAt < new Date(Date.now() - 10 * 60000))
          customerError(
            "CUSTOMER_PHONE_REAUTH_REQUIRED",
            "Sign out and sign in again before changing your phone number.",
            403,
          );
        const taken = await tx.customer.findUnique({
          where: { phoneNumber: verified!.phoneNumber },
        });
        const identity = await tx.customerIdentity.findUnique({
          where: {
            provider_providerSubject: {
              provider: "FIREBASE_PHONE",
              providerSubject: verified!.subject,
            },
          },
        });
        if (
          (taken && taken.id !== principal.customer.id) ||
          (identity && identity.customerId !== principal.customer.id)
        )
          customerError(
            "CUSTOMER_PHONE_IN_USE",
            "This phone is already linked to another account.",
            409,
          );
        await tx.customerIdentity.upsert({
          where: {
            customerId_provider: {
              customerId: principal.customer.id,
              provider: "FIREBASE_PHONE",
            },
          },
          create: {
            id: createSelfxId(),
            customerId: principal.customer.id,
            provider: "FIREBASE_PHONE",
            providerSubject: verified!.subject,
            verifiedAt: new Date(),
          },
          update: {
            providerSubject: verified!.subject,
            verifiedAt: new Date(),
          },
        });
        await tx.customer.update({
          where: { id: principal.customer.id },
          data: {
            phoneNumber: verified!.phoneNumber,
            phoneVerifiedAt: new Date(),
            phoneConsentAt: new Date(),
            pendingPhoneNumber: null,
          },
        });
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      )
        customerError(
          "CUSTOMER_PHONE_IN_USE",
          "This phone is already linked to another account.",
          409,
        );
      throw error;
    }
    return this.me(header);
  }
  private async consumeCode(
    email: string,
    code: string,
    purpose: CustomerActionPurpose,
    ip: string,
    callback: (
      tx: Prisma.TransactionClient,
      customer: Customer,
    ) => Promise<unknown>,
    loginProof?: string,
  ) {
    await this.limit("code-ip", ip);
    await this.limit(`code-${purpose}`, email, 5);
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM customers WHERE email = ${email} FOR UPDATE`;
      const customer = await tx.customer.findUnique({ where: { email } });
      const token = await tx.customerActionToken.findUnique({
        where: {
          tokenHash: this.digest(
            purpose,
            `${email}:${code}${purpose === "EMAIL_LOGIN" ? `:${this.digest("email-login-proof", loginProof ?? "")}` : ""}`,
          ),
        },
      });
      if (
        !customer ||
        !token ||
        token.customerId !== customer.id ||
        token.usedAt ||
        token.expiresAt <= new Date() ||
        token.securityVersion !== customer.securityVersion ||
        customer.status !==
          (purpose === "VERIFY_EMAIL" ? "PENDING_VERIFICATION" : "ACTIVE")
      )
        customerError(
          "CUSTOMER_CODE_INVALID",
          "This code is invalid or expired. Request a new code.",
        );
      const claimed = await tx.customerActionToken.updateMany({
        where: { id: token!.id, usedAt: null, expiresAt: { gt: new Date() } },
        data: { usedAt: new Date() },
      });
      if (claimed.count !== 1)
        customerError(
          "CUSTOMER_CODE_INVALID",
          "This code is invalid or expired. Request a new code.",
        );
      return callback(tx, customer!);
    });
  }
  async verifyEmail(
    email: string,
    code: string,
    ip: string,
    signupProof: string,
  ) {
    await this.consumeCode(
      normalize(email),
      code,
      "VERIFY_EMAIL",
      ip,
      async (tx, customer) => {
        if (
          customer.verificationProofHash !==
          this.digest("signup-proof", signupProof)
        )
          customerError(
            "CUSTOMER_CODE_INVALID",
            "This code belongs to another sign-up attempt. Request a new code.",
          );
        await tx.customer.update({
          where: { id: customer.id },
          data: { status: "ACTIVE", verificationProofHash: null },
        });
        await tx.customerIdentity.updateMany({
          where: { customerId: customer.id, provider: "EMAIL_PASSWORD" },
          data: { verifiedAt: new Date() },
        });
      },
    );
    return { message: "Email verified. You can now sign in." };
  }
  async resetPassword(
    email: string,
    code: string,
    password: string,
    ip: string,
  ) {
    await this.limit("reset-ip", ip, 10);
    const passwordHash = await this.passwords.hashPassword(password);
    await this.consumeCode(
      normalize(email),
      code,
      "RESET_PASSWORD",
      ip,
      async (tx, customer) => {
        await tx.customerIdentity.upsert({
          where: {
            customerId_provider: {
              customerId: customer.id,
              provider: "EMAIL_PASSWORD",
            },
          },
          create: {
            id: createSelfxId(),
            customerId: customer.id,
            provider: "EMAIL_PASSWORD",
            providerSubject: customer.email!,
            email: customer.email,
            passwordHash,
            verifiedAt: new Date(),
          },
          update: { passwordHash, verifiedAt: new Date() },
        });
        await tx.customer.update({
          where: { id: customer.id },
          data: { securityVersion: { increment: 1 } },
        });
        await tx.customerSession.updateMany({
          where: { customerId: customer.id, revokedAt: null },
          data: { revokedAt: new Date() },
        });
        await tx.customerActionToken.updateMany({
          where: { customerId: customer.id, usedAt: null },
          data: { usedAt: new Date() },
        });
        await this.outbox.enqueue(
          "MESSAGE",
          {
            to: customer.email!,
            subject: "Your SelfX password was changed",
            text: "Your SelfX password was changed successfully. All existing customer sessions have been signed out.\n\nIf you did not make this change, use Forgot password in the SelfX customer app to secure your account and contact SelfX support.\n\nNever share your password or verification codes.",
          },
          new Date(Date.now() + 24 * 60 * 60_000),
          tx,
        );
      },
    );
    return { message: "Password updated. Sign in with your new password." };
  }
  async login(
    emailInput: string,
    password: string,
    ip: string,
    deviceName?: string,
  ) {
    const identifier = normalize(emailInput);
    await this.limit("login-ip", ip, 30);
    await this.limit("login-email", identifier, 10);
    let identity:
      | Prisma.CustomerIdentityGetPayload<{ include: { customer: true } }>
      | null
      | undefined;
    if (identifier.includes("@")) {
      identity = await this.db.customerIdentity.findUnique({
        where: {
          provider_providerSubject: {
            provider: "EMAIL_PASSWORD",
            providerSubject: identifier,
          },
        },
        include: { customer: true },
      });
    } else {
      // Verified ownership takes precedence over unverified contact aliases.
      // Ambiguous aliases require email; never guess an account or merge them.
      const owner = await this.db.customer.findUnique({
        where: { phoneNumber: identifier },
      });
      const candidates = await this.db.customerIdentity.findMany({
        where: {
          provider: "EMAIL_PASSWORD",
          customer: owner
            ? { id: owner.id }
            : { pendingPhoneNumber: identifier, status: "ACTIVE" },
        },
        include: { customer: true },
        orderBy: { id: "asc" },
        take: 2,
      });
      identity = candidates.length === 1 ? candidates[0] : null;
    }
    const email = identity?.customer.email ?? identifier;
    this.dummyHash ??= this.passwords.hashPassword(tokenSecret());
    const valid = await this.passwords.verifyPassword(
      identity?.passwordHash ?? (await this.dummyHash),
      password,
    );
    if (
      !identity ||
      !valid ||
      !["ACTIVE", "PENDING_VERIFICATION"].includes(identity.customer.status)
    )
      customerError(
        "CUSTOMER_INVALID_CREDENTIALS",
        "We couldn’t sign you in. Check your details, try Google, or create an account.",
        401,
      );
    if (identity!.customer.status === "PENDING_VERIFICATION") {
      await this.assertEmailReady();
      const signupProof = tokenSecret(),
        proofHash = this.digest("signup-proof", signupProof);
      await this.db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM customers WHERE id = ${identity!.customerId}::uuid FOR UPDATE`;
        const claimed = await tx.customer.updateMany({
          where: {
            id: identity!.customerId,
            status: "PENDING_VERIFICATION",
            securityVersion: identity!.customer.securityVersion,
          },
          data: { verificationProofHash: proofHash },
        });
        if (claimed.count !== 1) unauthorized();
        if (await this.rate("email-request", email, 3))
          await this.queueEmail(tx, email, "VERIFY_EMAIL", proofHash);
      });
      return {
        verificationRequired: true,
        signupProof,
        email,
        message: "Verify your email before signing in.",
      };
    }
    return this.newSession(
      identity!.customer.id,
      deviceName,
      identity!.customer.securityVersion,
    );
  }
  private async newSession(
    customerId: string,
    deviceName?: string,
    securityVersion?: number,
  ) {
    return this.db.$transaction((tx) =>
      this.createSession(tx, customerId, deviceName, securityVersion),
    );
  }
  private async createSession(
    tx: Prisma.TransactionClient,
    customerId: string,
    deviceName?: string,
    securityVersion?: number,
  ) {
    await tx.$queryRaw`SELECT id FROM customers WHERE id = ${customerId}::uuid FOR UPDATE`;
    const customer = await tx.customer.findUniqueOrThrow({
      where: { id: customerId },
    });
    if (
      customer.status !== "ACTIVE" ||
      (securityVersion !== undefined &&
        customer.securityVersion !== securityVersion)
    )
      unauthorized();
    const refreshToken = tokenSecret(),
      id = createSelfxId();
    const session = await tx.customerSession.create({
      data: {
        id,
        familyId: id,
        customerId,
        tokenHash: this.digest("refresh", refreshToken),
        expiresAt: new Date(Date.now() + this.config.refreshDays * 86400000),
        deviceName,
      },
    });
    await tx.customer.update({
      where: { id: customerId },
      data: { lastActiveAt: new Date() },
    });
    return this.bundle(customer, session.id, refreshToken);
  }
  private async bundle(
    customer: Customer,
    sessionId: string,
    refreshToken: string,
  ) {
    const accessToken = await this.jwt.signAsync(
      {
        sub: customer.id,
        sid: sessionId,
        ver: customer.securityVersion,
        typ: "customer_access",
      },
      {
        secret: this.config.secret,
        issuer: "selfx",
        audience,
        algorithm: "HS256",
        expiresIn: this.config.accessSeconds,
      },
    );
    return {
      accessToken,
      refreshToken,
      accessTokenExpiresAt: new Date(
        Date.now() + this.config.accessSeconds * 1000,
      ).toISOString(),
      customer: this.profile(customer),
    };
  }
  async refresh(refreshToken: string, ip: string) {
    await this.limit("refresh-ip", ip, 60);
    const result = await this.db.$transaction(async (tx) => {
      const candidate = await tx.customerSession.findUnique({
        where: { tokenHash: this.digest("refresh", refreshToken) },
      });
      if (!candidate) return null;
      await tx.$queryRaw`SELECT id FROM customers WHERE id = ${candidate.customerId}::uuid FOR UPDATE`;
      const current = await tx.customerSession.findUniqueOrThrow({
        where: { id: candidate.id },
        include: { customer: true },
      });
      if (current.revokedAt) {
        await tx.customerSession.updateMany({
          where: { familyId: current.familyId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
        return null;
      }
      if (
        current.expiresAt <= new Date() ||
        current.customer.status !== "ACTIVE"
      )
        return null;
      await tx.customerSession.update({
        where: { id: current.id },
        data: { revokedAt: new Date(), lastUsedAt: new Date() },
      });
      const next = tokenSecret(),
        id = createSelfxId();
      await tx.customerSession.create({
        data: {
          id,
          familyId: current.familyId,
          customerId: current.customerId,
          tokenHash: this.digest("refresh", next),
          expiresAt: current.expiresAt,
          deviceName: current.deviceName,
          authenticatedAt: current.authenticatedAt,
        },
      });
      await tx.customerPushDevice.updateMany({
        where: { customerId: current.customerId, sessionId: current.id },
        data: { sessionId: id },
      });
      await tx.customer.update({
        where: { id: current.customerId },
        data: { lastActiveAt: new Date() },
      });
      return this.bundle(current.customer, id, next);
    });
    if (!result) unauthorized();
    return result;
  }
  async requireCustomer(header?: string) {
    this.assertEnabled();
    if (!header?.startsWith("Bearer ") || header.length > 8192) unauthorized();
    let claims: AccessClaims;
    try {
      claims = await this.jwt.verifyAsync<AccessClaims>(header!.slice(7), {
        secret: this.config.secret,
        audience,
        issuer: "selfx",
        algorithms: ["HS256"],
      });
    } catch {
      unauthorized();
    }
    if (claims!.typ !== "customer_access" || !claims!.sub || !claims!.sid)
      unauthorized();
    const session = await this.db.customerSession.findUnique({
      where: { id: claims!.sid },
      include: { customer: true },
    });
    if (
      !session ||
      session.customerId !== claims!.sub ||
      session.revokedAt ||
      session.expiresAt <= new Date() ||
      session.customer.status !== "ACTIVE" ||
      session.customer.securityVersion !== claims!.ver
    )
      unauthorized();
    return { customer: session!.customer, sessionId: session!.id };
  }
  async logout(header: string | undefined, all = false) {
    const { customer, sessionId } = await this.requireCustomer(header);
    await this.db.$transaction(async (tx) => {
      await tx.customerSession.updateMany({
        where: {
          customerId: customer.id,
          ...(all ? {} : { id: sessionId }),
          revokedAt: null,
        },
        data: { revokedAt: new Date() },
      });
      await tx.customerPushDevice.deleteMany({
        where: { customerId: customer.id, ...(all ? {} : { sessionId }) },
      });
    });
    return { message: "Signed out." };
  }
  async appleChallenge(ip: string) {
    await this.limit("apple-challenge", ip);
    if (!this.config.appleClientIds.length)
      customerError(
        "CUSTOMER_OAUTH_UNAVAILABLE",
        "Apple sign-in is not configured.",
        503,
      );
    const nonce = tokenSecret(),
      tokenHash = createHash("sha256").update(nonce).digest("hex");
    const row = await this.db.customerActionToken.create({
      data: {
        id: createSelfxId(),
        purpose: "APPLE_NONCE",
        tokenHash,
        expiresAt: new Date(Date.now() + codeTtl),
      },
    });
    return { challengeId: row.id, nonceHash: tokenHash };
  }
  private async verifiedProvider(
    input: Pick<CustomerOAuthDto, "provider" | "idToken" | "challengeId">,
  ) {
    const challenge =
      input.provider === "APPLE" && input.challengeId
        ? await this.db.customerActionToken.findUnique({
            where: { id: input.challengeId },
          })
        : null;
    if (
      input.provider === "APPLE" &&
      (!challenge ||
        challenge.purpose !== "APPLE_NONCE" ||
        challenge.usedAt ||
        challenge.expiresAt <= new Date())
    )
      customerError(
        "CUSTOMER_OAUTH_INVALID",
        "Sign-in expired. Please try again.",
        401,
      );
    let verified: Awaited<ReturnType<CustomerIdentityClient["verify"]>>;
    try {
      verified = await this.identities.verify(
        input.provider,
        input.idToken,
        challenge?.tokenHash,
      );
    } catch {
      customerError(
        "CUSTOMER_OAUTH_INVALID",
        "Sign-in could not be verified. Please try again.",
        401,
      );
    }
    if (challenge) {
      const claimed = await this.db.customerActionToken.updateMany({
        where: {
          id: challenge.id,
          usedAt: null,
          expiresAt: { gt: new Date() },
        },
        data: { usedAt: new Date() },
      });
      if (claimed.count !== 1)
        customerError(
          "CUSTOMER_OAUTH_INVALID",
          "Sign-in expired. Please try again.",
          401,
        );
    }
    return verified!;
  }
  async oauth(input: CustomerOAuthDto, ip: string) {
    await this.limit("oauth-ip", ip, 30);
    const verified = await this.verifiedProvider(input);
    let customerId: string;
    try {
      customerId = await this.db.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('selfx.customer.identity'), hashtext(${`${input.provider}:${verified.subject}`}))`;
        const identity = await tx.customerIdentity.findUnique({
          where: {
            provider_providerSubject: {
              provider: input.provider,
              providerSubject: verified.subject,
            },
          },
        });
        if (identity) return identity.customerId;
        if (!verified.email)
          customerError(
            "CUSTOMER_OAUTH_EMAIL_REQUIRED",
            "A verified email address is required. Try email sign-up.",
          );
        const providerEmail = normalize(verified.email!);
        // Share the signup email lock, then lock the matching account before
        // checking eligibility. Concurrent signups/links cannot create duplicates.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('selfx.customer.email'), hashtext(${providerEmail}))`;
        const existing = await tx.customer.findUnique({
          where: { email: providerEmail },
        });
        if (existing) {
          await tx.$queryRaw`SELECT id FROM customers WHERE id = ${existing.id}::uuid FOR UPDATE`;
          const current = await tx.customer.findUniqueOrThrow({
            where: { id: existing.id },
            include: { identities: true },
          });
          const emailVerified = current.identities.some(
            (entry) =>
              entry.verifiedAt !== null &&
              entry.email !== null &&
              normalize(entry.email) === providerEmail,
          );
          if (current.status === "SUSPENDED" || current.status === "DELETED")
            unauthorized();
          if (
            input.provider !== "GOOGLE" ||
            verified.emailAuthoritative !== true ||
            current.status !== "ACTIVE" ||
            current.email !== providerEmail ||
            !emailVerified ||
            current.identities.some((entry) => entry.provider === "GOOGLE")
          ) {
            customerError(
              "CUSTOMER_ACCOUNT_LINK_REQUIRED",
              "Sign in with your existing account method.",
              409,
            );
          }
          await tx.customerIdentity.create({
            data: {
              id: createSelfxId(),
              customerId: current.id,
              provider: "GOOGLE",
              providerSubject: verified.subject,
              email: providerEmail,
              verifiedAt: new Date(),
            },
          });
          return current.id;
        }
        if (!input.acceptTerms || input.termsVersion !== CUSTOMER_TERMS_VERSION)
          customerError(
            "CUSTOMER_SIGNUP_REQUIRED",
            "Create an account and accept the terms to continue.",
            409,
          );
        const created = await tx.customer.create({
          data: {
            id: createSelfxId(),
            email: providerEmail,
            displayName: (
              input.displayName?.trim() ||
              verified.name ||
              "SelfX member"
            ).slice(0, 160),
            status: "ACTIVE",
            termsVersion: input.termsVersion!,
            language: input.language ?? "en",
            termsAcceptedAt: new Date(),
            identities: {
              create: {
                id: createSelfxId(),
                provider: input.provider,
                providerSubject: verified.subject,
                email: verified.email,
                verifiedAt: new Date(),
              },
            },
          },
        });
        return created.id;
      });
    } catch (caught) {
      if (
        caught instanceof Prisma.PrismaClientKnownRequestError &&
        caught.code === "P2002"
      )
        customerError(
          "CUSTOMER_ACCOUNT_LINK_REQUIRED",
          "Sign in with your existing account method.",
          409,
        );
      throw caught;
    }
    return this.newSession(customerId!, input.deviceName);
  }
  async linkOAuth(
    header: string | undefined,
    input: CustomerOAuthLinkDto,
    ip: string,
  ) {
    const principal = await this.requireCustomer(header);
    await this.limit("oauth-link-customer", principal.customer.id, 5);
    await this.limit("oauth-link-ip", ip, 20);
    const verified = await this.verifiedProvider(input);
    try {
      await this.db.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('selfx.customer.identity'), hashtext(${`${input.provider}:${verified.subject}`}))`;
        await tx.$queryRaw`SELECT id FROM customers WHERE id = ${principal.customer.id}::uuid FOR UPDATE`;
        const session = await tx.customerSession.findUnique({
          where: { id: principal.sessionId },
          include: { customer: true },
        });
        if (
          !session ||
          session.revokedAt ||
          session.expiresAt <= new Date() ||
          session.customer.status !== "ACTIVE" ||
          session.customer.securityVersion !==
            principal.customer.securityVersion
        )
          unauthorized();
        if (session!.authenticatedAt < new Date(Date.now() - 10 * 60000)) {
          customerError(
            "CUSTOMER_OAUTH_REAUTH_REQUIRED",
            "Sign out and sign in again before linking Google.",
            403,
          );
        }
        if (
          !verified.email ||
          normalize(verified.email) !== session!.customer.email
        ) {
          customerError(
            "CUSTOMER_OAUTH_EMAIL_MISMATCH",
            "Choose the Google account with the same email as your SelfX account.",
            409,
          );
        }
        const existing = await tx.customerIdentity.findFirst({
          where: {
            provider: input.provider,
            OR: [
              { providerSubject: verified.subject },
              { customerId: principal.customer.id },
            ],
          },
        });
        if (
          existing &&
          (existing.customerId !== principal.customer.id ||
            existing.providerSubject !== verified.subject)
        ) {
          customerError(
            "CUSTOMER_ACCOUNT_LINK_REQUIRED",
            "This Google account is already linked. Sign in with your existing account method.",
            409,
          );
        }
        if (!existing)
          await tx.customerIdentity.create({
            data: {
              id: createSelfxId(),
              customerId: principal.customer.id,
              provider: input.provider,
              providerSubject: verified.subject,
              email: verified.email,
              verifiedAt: new Date(),
            },
          });
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        customerError(
          "CUSTOMER_ACCOUNT_LINK_REQUIRED",
          "This Google account is already linked. Sign in with your existing account method.",
          409,
        );
      }
      throw error;
    }
    return this.me(header);
  }
  profile(customer: Customer) {
    return {
      id: customer.id,
      email: customer.email,
      emailVerified: customer.status === "ACTIVE" && Boolean(customer.email),
      phoneNumber: customer.phoneNumber,
      pendingPhoneNumber: customer.pendingPhoneNumber,
      phoneVerifiedAt: customer.phoneVerifiedAt?.toISOString() ?? null,
      displayName: customer.displayName,
      language: customer.language,
      notifications: customer.notifications,
      interests: customer.interests,
      avatarSetupComplete: Boolean(customer.avatarSetupCompletedAt),
      createdAt: customer.createdAt.toISOString(),
    };
  }
  async me(header?: string) {
    const { customer } = await this.requireCustomer(header);
    const identities = await this.db.customerIdentity.findMany({
      where: { customerId: customer.id },
      select: { provider: true },
    });
    return {
      ...this.profile(customer),
      methods: identities.map((identity) => identity.provider),
    };
  }
  async updateProfile(header: string | undefined, input: CustomerProfileDto) {
    const { customer } = await this.requireCustomer(header);
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM customers WHERE id = ${customer.id}::uuid FOR UPDATE`;
      const current = await tx.customer.findUniqueOrThrow({
        where: { id: customer.id },
      });
      if (
        current.status !== "ACTIVE" ||
        current.securityVersion !== customer.securityVersion
      )
        unauthorized();
      if (input.notifications === false)
        await tx.customerPushDevice.deleteMany({
          where: { customerId: customer.id },
        });
      return this.profile(
        await tx.customer.update({
          where: { id: customer.id },
          data: {
            ...input,
            ...(input.displayName
              ? { displayName: input.displayName.trim() }
              : {}),
          },
        }),
      );
    });
  }
  async deleteAccount(
    header: string | undefined,
    input: CustomerDeleteDto,
    ip: string,
  ) {
    await this.limit("delete-ip", ip, 10);
    const { customer } = await this.requireCustomer(header);
    let authorized = false;
    if (input.password) {
      const identity = await this.db.customerIdentity.findUnique({
        where: {
          customerId_provider: {
            customerId: customer.id,
            provider: "EMAIL_PASSWORD",
          },
        },
      });
      authorized = await this.passwords.verifyPassword(
        identity?.passwordHash ?? null,
        input.password,
      );
    } else if (input.provider && input.idToken) {
      const verified = await this.verifiedProvider({
        provider: input.provider,
        idToken: input.idToken,
        challengeId: input.challengeId,
      });
      const identity = await this.db.customerIdentity.findUnique({
        where: {
          provider_providerSubject: {
            provider: input.provider,
            providerSubject: verified.subject,
          },
        },
      });
      authorized = identity?.customerId === customer.id;
    }
    if (!authorized)
      customerError(
        "CUSTOMER_REAUTH_REQUIRED",
        "Verify your password or sign in again before deleting your account.",
        403,
      );
    await this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM customers WHERE id = ${customer.id}::uuid FOR UPDATE`;
      const current = await tx.customer.findUniqueOrThrow({
        where: { id: customer.id },
      });
      if (
        current.securityVersion !== customer.securityVersion ||
        current.status !== "ACTIVE"
      )
        unauthorized();
      await tx.customerSession.updateMany({
        where: { customerId: customer.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await tx.customerActionToken.deleteMany({
        where: { customerId: customer.id },
      });
      await tx.customerPushDevice.deleteMany({
        where: { customerId: customer.id },
      });
      await tx.customerNotification.deleteMany({
        where: { customerId: customer.id },
      });
      await tx.customerIdentity.deleteMany({
        where: { customerId: customer.id },
      });
      await tx.customer.update({
        where: { id: customer.id },
        data: {
          email: null,
          phoneNumber: null,
          pendingPhoneNumber: null,
          phoneVerifiedAt: null,
          phoneConsentAt: null,
          displayName: "Deleted account",
          interests: [],
          avatarSetupCompletedAt: null,
          status: "DELETED",
          deletedAt: new Date(),
          securityVersion: { increment: 1 },
          notifications: false,
        },
      });
    });
    return { message: "Your account has been deleted." };
  }
  async cleanup() {
    if (!this.config.enabled) return;
    const cutoff = new Date(Date.now() - 7 * 86400000);
    await this.db.customerActionToken.deleteMany({
      where: { expiresAt: { lt: cutoff } },
    });
    await this.db.customerSession.deleteMany({
      where: { expiresAt: { lt: cutoff } },
    });
  }
}
