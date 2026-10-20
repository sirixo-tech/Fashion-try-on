import { createHash, createHmac, randomBytes } from "node:crypto";
import {
  HttpStatus,
  Inject,
  Injectable,
  type OnModuleInit,
} from "@nestjs/common";
import { Prisma, type MailJob } from "@prisma/client";
import { createSelfxId } from "@selfx/database";
import { PrismaService } from "../database/prisma.service.js";
import { MailCrypto, type MailEnvelope } from "../mail/mail-crypto.js";
import { MailOutboxService } from "../mail/mail-outbox.service.js";
import {
  MailSettingsService,
  mailError,
} from "../mail/mail-settings.service.js";
import { AUTH_CONFIG } from "./auth.constants.js";
import { type AuthConfig } from "./auth.config.js";
import { PasswordService } from "./password.service.js";

const ttl = 15 * 60_000;
export const recoveryResponse = {
  message:
    "If an eligible account exists, password reset instructions will be sent to its email address.",
};
export function resetTokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}
export function recoveryWebOrigin(env: NodeJS.ProcessEnv = process.env) {
  const raw = env.SELFX_PUBLIC_WEB_BASE_URL ?? env.SELFX_WEB_BASE_URL;
  if (!raw) throw new Error("RECOVERY_WEB_URL_UNAVAILABLE");
  const url = new URL(raw);
  if (
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    (url.protocol !== "https:" &&
      !(
        env.NODE_ENV !== "production" &&
        url.protocol === "http:" &&
        ["localhost", "127.0.0.1"].includes(url.hostname)
      ))
  )
    throw new Error("RECOVERY_WEB_URL_INVALID");
  return url.origin;
}

@Injectable()
export class PasswordRecoveryService implements OnModuleInit {
  constructor(
    private readonly db: PrismaService,
    private readonly crypto: MailCrypto,
    private readonly outbox: MailOutboxService,
    private readonly mail: MailSettingsService,
    private readonly passwords: PasswordService,
    @Inject(AUTH_CONFIG) private readonly config: AuthConfig,
  ) {}
  onModuleInit() {
    this.outbox.prepareReset = (job) => this.prepare(job);
  }
  private async rate(scope: string, value: string, maximum: number) {
    const key = createHmac("sha256", this.config.refreshTokenPepper)
      .update(`password-recovery:${scope}:${value}`)
      .digest("hex");
    const expiresAt = new Date(Date.now() + ttl);
    const rows = await this.db.$queryRaw<Array<{ count: number }>>`
      INSERT INTO password_recovery_rate_buckets (key, count, expires_at) VALUES (${key}, 1, ${expiresAt})
      ON CONFLICT (key) DO UPDATE SET count = CASE WHEN password_recovery_rate_buckets.expires_at <= NOW() THEN 1 ELSE password_recovery_rate_buckets.count + 1 END,
      expires_at = CASE WHEN password_recovery_rate_buckets.expires_at <= NOW() THEN EXCLUDED.expires_at ELSE password_recovery_rate_buckets.expires_at END RETURNING count
    `;
    return rows[0]!.count <= maximum;
  }
  async request(address: string, ip: string) {
    if (!(await this.rate("request-ip", ip, 10)))
      mailError(
        "AUTH_RATE_LIMITED",
        "Too many requests. Try again later.",
        HttpStatus.TOO_MANY_REQUESTS,
      );
    const email = address.trim().toLowerCase();
    if (!(await this.rate("request-email", email, 3))) return recoveryResponse;
    try {
      recoveryWebOrigin();
      await this.mail.account();
    } catch {
      mailError(
        "PASSWORD_RECOVERY_UNAVAILABLE",
        "Password recovery is temporarily unavailable. Contact SelfX support.",
      );
    }
    // All addresses enqueue the same encrypted work; HTTP timing does not depend
    // on account existence or on an SMTP connection. The worker resolves identity.
    await this.outbox.enqueue(
      "RESET_REQUEST",
      { email },
      new Date(Date.now() + ttl),
    );
    return recoveryResponse;
  }
  private async prepare(job: MailJob): Promise<MailJob | null> {
    const { email } = this.crypto.decrypt<{ email: string }>(
      job.payload as unknown as MailEnvelope,
    );
    return this.db.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<
        Array<{ id: string }>
      >`SELECT id FROM users WHERE email = ${email} FOR UPDATE`;
      if (!rows.length) return null;
      const user = await tx.user.findUniqueOrThrow({
        where: { id: rows[0]!.id },
      });
      if (
        user.status !== "ACTIVE" ||
        !user.passwordHash ||
        user.createdAt > job.createdAt ||
        (user.passwordChangedAt && user.passwordChangedAt >= job.createdAt)
      )
        return null;
      if (job.expiresAt <= new Date()) return null;
      const token = randomBytes(32).toString("hex"),
        id = createSelfxId();
      await tx.passwordResetToken.create({
        data: {
          id,
          userId: user.id,
          tokenHash: resetTokenHash(token),
          credentialsVersion: user.credentialsVersion,
          expiresAt: job.expiresAt,
        },
      });
      // Fragment keeps the bearer token out of HTTP access logs and Referer headers.
      const link = `${recoveryWebOrigin()}/reset-password#token=${token}`;
      const payload = this.crypto.encrypt({
        to: user.email,
        subject: "Reset your SelfX password",
        text: `A password reset was requested for your SelfX account.\n\nOpen this link to choose a new password:\n${link}\n\nThis link expires 15 minutes after the request and can be used once. If you did not request this, ignore this email. Your password has not changed.`,
        resetTokenId: id,
      });
      const updated = await tx.mailJob.updateMany({
        where: { id: job.id, status: "PROCESSING", leaseUntil: job.leaseUntil },
        data: {
          kind: "MESSAGE",
          payload: payload as unknown as Prisma.InputJsonValue,
        },
      });
      if (updated.count !== 1) throw new Error("MAIL_LEASE_LOST");
      return tx.mailJob.findUniqueOrThrow({ where: { id: job.id } });
    });
  }
  async reset(token: string, password: string, ip: string) {
    if (!(await this.rate("reset-ip", ip, 20)))
      mailError(
        "AUTH_RATE_LIMITED",
        "Too many attempts. Try again later.",
        HttpStatus.TOO_MANY_REQUESTS,
      );
    const tokenHash = resetTokenHash(token);
    const candidate = await this.db.passwordResetToken.findUnique({
      where: { tokenHash },
    });
    const invalid = () =>
      mailError(
        "PASSWORD_RESET_LINK_INVALID",
        "This reset link is invalid or expired. Request a new link.",
        HttpStatus.BAD_REQUEST,
      );
    if (!candidate || candidate.usedAt || candidate.expiresAt <= new Date())
      invalid();
    const passwordHash = await this.passwords.hashPassword(password);
    await this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${candidate!.userId}::uuid FOR UPDATE`;
      const user = await tx.user.findUnique({
        where: { id: candidate!.userId },
      });
      const current = await tx.passwordResetToken.findUnique({
        where: { tokenHash },
      });
      const now = new Date();
      if (
        !user ||
        user.status !== "ACTIVE" ||
        !current ||
        current.usedAt ||
        current.expiresAt <= now ||
        user.credentialsVersion !== current.credentialsVersion
      )
        invalid();
      await tx.user.update({
        where: { id: user!.id },
        data: {
          passwordHash,
          passwordChangedAt: now,
          credentialsVersion: { increment: 1 },
        },
      });
      await tx.passwordResetToken.updateMany({
        where: { userId: user!.id, usedAt: null },
        data: { usedAt: now },
      });
      await tx.userSession.updateMany({
        where: { userId: user!.id, revokedAt: null },
        data: { revokedAt: now },
      });
      await tx.impersonationSession.updateMany({
        where: { actorUserId: user!.id, status: "ACTIVE" },
        data: { status: "ENDED", endedAt: now },
      });
      await tx.auditLog.create({
        data: {
          id: createSelfxId(),
          actorUserId: user!.id,
          action: "AUTH_PASSWORD_RESET_COMPLETED",
          resourceType: "user",
          resourceId: user!.id,
          metadata: { recoveryMethod: "EMAIL_LINK" },
        },
      });
      await this.outbox.enqueue(
        "MESSAGE",
        {
          to: user!.email,
          subject: "Your SelfX password was changed",
          text: "Your SelfX password was reset successfully. Existing login sessions have been invalidated. If you did not make this change, contact SelfX support immediately.",
        },
        new Date(Date.now() + 24 * 60 * 60_000),
        tx,
      );
    });
    return {
      message: "Your password has been reset. Sign in with your new password.",
    };
  }
}
