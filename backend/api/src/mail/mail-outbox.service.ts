import {
  Injectable,
  type OnModuleDestroy,
  type OnModuleInit,
} from "@nestjs/common";
import { Prisma, type MailJob } from "@prisma/client";
import { createSelfxId } from "@selfx/database";
import { PrismaService } from "../database/prisma.service.js";
import { MailCrypto, type MailEnvelope } from "./mail-crypto.js";
import { MailSettingsService } from "./mail-settings.service.js";
import {
  SmtpSender,
  MailDeliveryError,
  type EmailMessage,
} from "./smtp-sender.js";

export interface QueuedMessage extends EmailMessage {
  resetTokenId?: string;
}
@Injectable()
export class MailOutboxService implements OnModuleInit, OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>;
  private running = false;
  private stopped = false;
  prepareReset?: (job: MailJob) => Promise<MailJob | null>;
  constructor(
    private readonly db: PrismaService,
    private readonly crypto: MailCrypto,
    private readonly settings: MailSettingsService,
    private readonly sender: SmtpSender,
  ) {}
  onModuleInit() {
    this.timer = setInterval(() => {
      if (!this.running && !this.stopped) void this.drain();
    }, 2000);
    this.timer.unref();
  }
  onModuleDestroy() {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
  }
  async enqueue(
    kind: "RESET_REQUEST" | "MESSAGE",
    payload: unknown,
    expiresAt: Date,
    tx: Prisma.TransactionClient = this.db,
  ) {
    return tx.mailJob.create({
      data: {
        id: createSelfxId(),
        kind,
        payload: this.crypto.encrypt(
          payload,
        ) as unknown as Prisma.InputJsonValue,
        expiresAt,
      },
    });
  }
  private async drain() {
    this.running = true;
    try {
      await this.cleanup();
      for (let i = 0; i < 5 && !this.stopped; i++)
        if (!(await this.processNext())) break;
    } catch {
      /* Do not log transport errors, recipients, bodies or reset URLs. Retry on next tick. */
    } finally {
      this.running = false;
    }
  }
  async cleanup() {
    const now = new Date();
    await this.db.mailJob.updateMany({
      where: {
        status: "PROCESSING",
        attempts: { gte: 4 },
        leaseUntil: { lt: now },
      },
      data: {
        status: "FAILED",
        failureCode: "MAIL_RETRY_EXHAUSTED",
        payload: Prisma.DbNull,
        leaseUntil: null,
      },
    });
    await this.db.mailJob.updateMany({
      where: {
        expiresAt: { lte: now },
        status: { in: ["PENDING", "PROCESSING"] },
      },
      data: {
        status: "FAILED",
        failureCode: "MAIL_EXPIRED",
        payload: Prisma.DbNull,
        leaseUntil: null,
      },
    });
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60_000);
    await this.db.mailJob.deleteMany({
      where: {
        status: { in: ["SENT", "FAILED", "SKIPPED"] },
        updatedAt: { lt: cutoff },
      },
    });
    await this.db.passwordResetToken.deleteMany({
      where: { expiresAt: { lt: cutoff } },
    });
    await this.db.passwordRecoveryRateBucket.deleteMany({
      where: { expiresAt: { lt: now } },
    });
  }
  async processNext() {
    const lease = new Date(Date.now() + 120_000);
    const rows = await this.db.$queryRaw<MailJob[]>`
      UPDATE mail_jobs SET status = 'PROCESSING', lease_until = ${lease}, attempts = attempts + 1, updated_at = NOW()
      WHERE id = (SELECT id FROM mail_jobs WHERE expires_at > NOW() AND attempts < 4
        AND ((status = 'PENDING' AND available_at <= NOW()) OR (status = 'PROCESSING' AND lease_until < NOW()))
        ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1)
      RETURNING id, kind, status, payload, attempts, available_at AS "availableAt", lease_until AS "leaseUntil",
        expires_at AS "expiresAt", failure_code AS "failureCode", created_at AS "createdAt", updated_at AS "updatedAt"
    `;
    let job = rows[0];
    if (!job) return false;
    const id = job.id;
    const where = { id, status: "PROCESSING", leaseUntil: lease };
    try {
      if (job.kind === "RESET_REQUEST") {
        if (!this.prepareReset)
          throw new MailDeliveryError("MAIL_RECOVERY_NOT_READY");
        job = (await this.prepareReset(job)) ?? undefined;
        if (!job) {
          await this.db.mailJob.updateMany({
            where,
            data: {
              status: "SKIPPED",
              payload: Prisma.DbNull,
              leaseUntil: null,
            },
          });
          return true;
        }
      }
      if (job.kind !== "MESSAGE")
        throw new MailDeliveryError("MAIL_PAYLOAD_INVALID");
      const message = this.crypto.decrypt<QueuedMessage>(
        job.payload as unknown as MailEnvelope,
      );
      if (message.resetTokenId) {
        const token = await this.db.passwordResetToken.findUnique({
          where: { id: message.resetTokenId },
          include: {
            user: { select: { status: true, credentialsVersion: true } },
          },
        });
        if (
          !token ||
          token.usedAt ||
          token.expiresAt <= new Date() ||
          token.user.status !== "ACTIVE" ||
          token.credentialsVersion !== token.user.credentialsVersion
        ) {
          await this.db.mailJob.updateMany({
            where,
            data: {
              status: "SKIPPED",
              payload: Prisma.DbNull,
              leaseUntil: null,
            },
          });
          return true;
        }
      }
      const { account } = await this.settings.account();
      await this.sender.send(account, message);
      await this.db.mailJob.updateMany({
        where,
        data: {
          status: "SENT",
          payload: Prisma.DbNull,
          leaseUntil: null,
          failureCode: null,
        },
      });
    } catch (error) {
      const attempts = rows[0]!.attempts;
      const final = attempts >= 4;
      await this.db.mailJob.updateMany({
        where,
        data: {
          status: final ? "FAILED" : "PENDING",
          ...(final ? { payload: Prisma.DbNull } : {}),
          leaseUntil: null,
          availableAt: new Date(Date.now() + 30_000 * attempts),
          failureCode:
            error instanceof MailDeliveryError
              ? error.code
              : "MAIL_DELIVERY_UNAVAILABLE",
        },
      });
    }
    return true;
  }
}
