import { createHash } from "node:crypto";
import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { createSelfxId } from "@selfx/database";
import { PrismaService } from "../database/prisma.service.js";
import { MailCrypto, type MailEnvelope } from "../mail/mail-crypto.js";
import { ApiErrorException } from "../common/api-error.exception.js";
import { CustomerPushSender } from "./customer-push.sender.js";
import { customerNotificationCopy } from "./customer-notification-copy.js";

export async function recordCustomerLookNotification(
  tx: Prisma.TransactionClient,
  customerId: string,
  runId: string,
  expiresAt: Date,
) {
  const event = await tx.customerNotification.upsert({
    where: {
      customerId_runId_kind: { customerId, runId, kind: "TRY_ON_READY" },
    },
    update: {},
    create: {
      id: createSelfxId(),
      customerId,
      runId,
      kind: "TRY_ON_READY",
      expiresAt,
    },
  });
  const devices = await tx.customerPushDevice.findMany({
    where: {
      customerId,
      customer: { status: "ACTIVE", notifications: true },
      session: { revokedAt: null, expiresAt: { gt: new Date() } },
    },
    select: { id: true },
  });
  if (devices.length)
    await tx.customerPushDelivery.createMany({
      data: devices.map((device) => ({
        id: createSelfxId(),
        notificationId: event.id,
        deviceId: device.id,
      })),
      skipDuplicates: true,
    });
}

@Injectable()
export class CustomerNotificationsService
  implements OnModuleInit, OnModuleDestroy
{
  private timer?: ReturnType<typeof setInterval>;
  private busy = false;
  private readonly logger = new Logger(CustomerNotificationsService.name);
  constructor(
    private readonly db: PrismaService,
    private readonly crypto: MailCrypto,
    private readonly sender: CustomerPushSender,
  ) {}
  ready() {
    return (
      process.env.SELFX_CUSTOMER_AUTH_ENABLED === "true" &&
      this.crypto.ready() &&
      Boolean(this.sender.configuration())
    );
  }
  onModuleInit() {
    if (process.env.SELFX_CUSTOMER_AUTH_ENABLED !== "true") return;
    this.timer = setInterval(
      () =>
        void this.process().catch(() =>
          this.logger.warn({ event: "customer_notifications_retry" }),
        ),
      60000,
    );
    this.timer.unref();
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }
  async register(
    customerId: string,
    sessionId: string,
    input: { installationId: string; token: string; platform: string },
  ) {
    if (!this.ready())
      throw new ApiErrorException(
        503,
        "CUSTOMER_PUSH_UNAVAILABLE",
        "Phone alerts have not been configured yet. Your in-app notifications are available.",
      );
    const tokenHash = createHash("sha256").update(input.token).digest("hex");
    await this.db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${tokenHash})::bigint)`;
      const session = await tx.customerSession.findFirst({
        where: {
          id: sessionId,
          customerId,
          revokedAt: null,
          expiresAt: { gt: new Date() },
          customer: { status: "ACTIVE", notifications: true },
        },
      });
      if (!session)
        throw new ApiErrorException(
          409,
          "CUSTOMER_PUSH_PREFERENCE_REQUIRED",
          "Enable phone alerts for this account first.",
        );
      await tx.customerPushDevice.deleteMany({
        where: {
          tokenHash,
          NOT: { customerId, installationId: input.installationId },
        },
      });
      const data = {
        sessionId,
        tokenHash,
        tokenCipher: this.crypto.encrypt({
          token: input.token,
        }) as unknown as Prisma.InputJsonValue,
        platform: input.platform,
      };
      await tx.customerPushDevice.upsert({
        where: {
          customerId_installationId: {
            customerId,
            installationId: input.installationId,
          },
        },
        update: data,
        create: {
          id: createSelfxId(),
          customerId,
          installationId: input.installationId,
          ...data,
        },
      });
    });
    return { message: "Phone alerts enabled for this device." };
  }
  async unregister(customerId: string, installationId: string) {
    await this.db.customerPushDevice.deleteMany({
      where: { customerId, installationId },
    });
    return { message: "Phone alerts removed from this device." };
  }
  async list(customerId: string, cursor?: string, pageSize = 25) {
    const customer = await this.db.customer.findUnique({
      where: { id: customerId },
      select: { language: true },
    });
    const copy = customerNotificationCopy(customer?.language);
    const rows = await this.db.customerNotification.findMany({
      where: {
        customerId,
        expiresAt: { gt: new Date() },
        ...(cursor ? { id: { lt: cursor } } : {}),
      },
      orderBy: { id: "desc" },
      take: pageSize + 1,
    });
    const data = rows.slice(0, pageSize);
    const unread = await this.db.customerNotification.count({
      where: { customerId, readAt: null, expiresAt: { gt: new Date() } },
    });
    return {
      data: data.map((row) => ({
        id: row.id,
        runId: row.runId,
        title: copy.title,
        body: copy.body,
        readAt: row.readAt?.toISOString() ?? null,
        createdAt: row.createdAt.toISOString(),
      })),
      unread,
      nextCursor: rows.length > pageSize ? data.at(-1)!.id : null,
    };
  }
  async read(customerId: string, id: string) {
    const found = await this.db.customerNotification.updateMany({
      where: { id, customerId, expiresAt: { gt: new Date() } },
      data: { readAt: new Date() },
    });
    if (!found.count)
      throw new ApiErrorException(
        404,
        "CUSTOMER_NOTIFICATION_NOT_FOUND",
        "This notification is no longer available.",
      );
    return { message: "Notification read." };
  }
  async process() {
    if (this.busy) return;
    this.busy = true;
    try {
      const now = new Date();
      await this.db.customerNotification.deleteMany({
        where: {
          OR: [
            { expiresAt: { lte: now } },
            { customer: { status: "DELETED" } },
          ],
        },
      });
      await this.db.customerPushDevice.deleteMany({
        where: {
          OR: [
            { session: { revokedAt: { not: null } } },
            { session: { expiresAt: { lte: now } } },
            { customer: { status: { not: "ACTIVE" } } },
            { customer: { notifications: false } },
          ],
        },
      });
      await this.db.customerPushDelivery.updateMany({
        where: {
          state: "SENDING",
          attempts: { gte: 5 },
          leaseUntil: { lte: now },
        },
        data: { state: "FAILED", leaseUntil: null },
      });
      if (!this.ready()) return;
      const eligible = {
        attempts: { lt: 5 },
        availableAt: { lte: now },
        OR: [
          { state: "PENDING" },
          { state: "SENDING", leaseUntil: { lte: now } },
        ],
      };
      const jobs = await this.db.customerPushDelivery.findMany({
        where: eligible,
        take: 10,
        orderBy: [{ availableAt: "asc" }, { id: "asc" }],
      });
      for (const candidate of jobs) {
        const claimed = await this.db.customerPushDelivery.updateMany({
          where: { id: candidate.id, ...eligible },
          data: {
            state: "SENDING",
            attempts: { increment: 1 },
            leaseUntil: new Date(Date.now() + 120000),
          },
        });
        if (!claimed.count) continue;
        const job = await this.db.customerPushDelivery.findUnique({
          where: { id: candidate.id },
          include: {
            notification: true,
            device: { include: { customer: true, session: true } },
          },
        });
        if (!job) continue;
        const valid =
          job.device.customerId === job.notification.customerId &&
          job.device.customer.status === "ACTIVE" &&
          job.device.customer.notifications &&
          !job.device.session.revokedAt &&
          job.device.session.expiresAt > new Date() &&
          job.notification.expiresAt > new Date();
        let result: "SENT" | "UNREGISTERED" | "RETRY" | "FAILED" = "FAILED";
        if (valid) {
          try {
            const payload = this.crypto.decrypt<{ token: string }>(
              job.device.tokenCipher as unknown as MailEnvelope,
            );
            result = await this.sender.send(payload.token, {
              ...job.notification,
              language: job.device.customer.language,
            });
          } catch {
            result = "RETRY";
          }
        }
        if (result === "UNREGISTERED") {
          await this.db.customerPushDevice.deleteMany({
            where: { id: job.deviceId },
          });
          continue;
        }
        await this.db.customerPushDelivery.updateMany({
          where: { id: job.id, state: "SENDING", attempts: job.attempts },
          data: {
            state:
              result === "RETRY" && job.attempts < 5
                ? "PENDING"
                : result === "SENT"
                  ? "SENT"
                  : "FAILED",
            leaseUntil: null,
            availableAt: new Date(
              Date.now() + Math.min(3600000, 60000 * 2 ** job.attempts),
            ),
          },
        });
      }
    } finally {
      this.busy = false;
    }
  }
}
