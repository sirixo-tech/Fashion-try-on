import { createHash } from "node:crypto";
import { HttpStatus, Injectable } from "@nestjs/common";
import { Prisma, type Organization } from "@prisma/client";
import { createSelfxId } from "@selfx/database";
import { isEmail } from "class-validator";
import { PrismaService } from "../database/prisma.service.js";
import { MailCrypto } from "./mail-crypto.js";
import { MailSettingsService, mailError } from "./mail-settings.service.js";
import {
  MAIL_TEMPLATE_DEFAULTS,
  MAIL_PREVIEW_VALUES,
  renderMail,
  type MailTemplateCode,
} from "./mail-templates.js";
import type { SaveMailTemplateDto, SendCustomEmailDto } from "./mail.dto.js";

const templateKey = (code: string) => `mail.template.${code}`;
const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");
type SavedTemplate = { version: number; subject: string; body: string };
@Injectable()
export class MailAutomationService {
  constructor(
    private readonly db: PrismaService,
    private readonly crypto: MailCrypto,
    private readonly settings: MailSettingsService,
  ) {}
  async assertNoImpersonation(actorId: string) {
    if (
      await this.db.impersonationSession.findFirst({
        where: {
          actorUserId: actorId,
          status: "ACTIVE",
          endedAt: null,
          expiresAt: { gt: new Date() },
        },
        select: { id: true },
      })
    )
      mailError(
        "PLATFORM_PERMISSION_DENIED",
        "Mail Settings are unavailable during Store impersonation.",
        403,
      );
  }
  async templates(tx: Prisma.TransactionClient = this.db) {
    const rows = await tx.platformSetting.findMany({
      where: { key: { startsWith: "mail.template." } },
    });
    return MAIL_TEMPLATE_DEFAULTS.map((definition) => {
      const saved = rows.find((row) => row.key === templateKey(definition.code))
        ?.value as SavedTemplate | undefined;
      const subject = saved?.subject ?? definition.subject,
        body = saved?.body ?? definition.body;
      return {
        ...definition,
        subject,
        body,
        version: saved?.version ?? 0,
        defaultSubject: definition.subject,
        defaultBody: definition.body,
        preview: renderMail(subject, body, MAIL_PREVIEW_VALUES),
        previewValues: MAIL_PREVIEW_VALUES,
      };
    });
  }
  async saveTemplate(
    actorId: string,
    code: string,
    input: SaveMailTemplateDto,
  ) {
    const definition = MAIL_TEMPLATE_DEFAULTS.find(
      (item) => item.code === code,
    );
    if (!definition)
      mailError("MAIL_TEMPLATE_NOT_FOUND", "Template was not found.", 404);
    const tokens = [
      ...`${input.subject}\n${input.body}`.matchAll(/{{\s*(\w+)\s*}}/g),
    ].map((m) => m[1]!);
    const remaining = `${input.subject}\n${input.body}`.replace(
      /{{\s*(\w+)\s*}}/g,
      "",
    );
    if (
      tokens.some(
        (token) => !(definition.variables as readonly string[]).includes(token),
      ) ||
      /{{|}}/.test(remaining)
    )
      mailError(
        "MAIL_TEMPLATE_VARIABLE_INVALID",
        "Use only the available template variables.",
        400,
      );
    return this.db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(721104, 3)`;
      const key = templateKey(code),
        current = await tx.platformSetting.findUnique({ where: { key } });
      if (
        ((current?.value as SavedTemplate | undefined)?.version ?? 0) !==
        input.version
      )
        mailError(
          "MAIL_TEMPLATE_CONFLICT",
          "Template changed. Refresh before saving.",
          409,
        );
      const value = {
        version: input.version + 1,
        subject: input.subject.trim(),
        body: input.body.trim(),
      };
      await tx.platformSetting.upsert({
        where: { key },
        create: { key, value },
        update: { value },
      });
      await tx.auditLog.create({
        data: {
          id: createSelfxId(),
          actorUserId: actorId,
          action: "MAIL_TEMPLATE_UPDATED",
          resourceType: "mail_template",
          metadata: { code, version: value.version },
        },
      });
      return this.templates(tx);
    });
  }
  async history() {
    return this.db.mailJob.findMany({
      where: { templateCode: { not: null } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 50,
      select: {
        id: true,
        templateCode: true,
        recipientMask: true,
        status: true,
        attempts: true,
        failureCode: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }
  async custom(actorId: string, input: SendCustomEmailDto) {
    // Delivery respects the saved enabled configuration, never unsaved form values.
    const current = await this.settings.account();
    if (current.version !== input.version)
      mailError(
        "MAIL_SETTINGS_CONFLICT",
        "Mail settings changed. Refresh before sending.",
        409,
      );
    return this.db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(721104, 4)`;
      const eventKey = digest(`custom:${actorId}:${input.idempotencyKey}`);
      const previous = await tx.mailJob.findUnique({ where: { eventKey } });
      if (previous)
        return {
          queued: true,
          id: previous.id,
          message: "Email already queued. Check delivery history.",
        };
      const recent = await tx.auditLog.count({
        where: {
          action: "CUSTOM_MAIL_QUEUED",
          createdAt: { gte: new Date(Date.now() - 60000) },
        },
      });
      if (recent >= 3)
        mailError(
          "MAIL_SEND_RATE_LIMITED",
          "Wait a minute before sending another email.",
          HttpStatus.TOO_MANY_REQUESTS,
        );
      const job = await this.queue(
        tx,
        "CUSTOM_MESSAGE",
        eventKey,
        input.recipient,
        { subject: input.subject.trim(), text: input.body.trim() },
      );
      await tx.auditLog.create({
        data: {
          id: createSelfxId(),
          actorUserId: actorId,
          action: "CUSTOM_MAIL_QUEUED",
          resourceType: "mail_job",
          resourceId: job.id,
        },
      });
      return {
        queued: true,
        id: job.id,
        message: "Email queued. Check delivery history for SMTP acceptance.",
      };
    });
  }
  private async queue(
    tx: Prisma.TransactionClient,
    code: string,
    eventKey: string,
    to: string,
    message: { subject: string; text: string },
  ) {
    const config = await this.settings.stored(tx);
    const ready =
      config.enabled &&
      config.host &&
      config.credentials &&
      this.crypto.ready();
    const [local, domain] = to.split("@");
    return tx.mailJob.upsert({
      where: { eventKey },
      update: {},
      create: {
        id: createSelfxId(),
        eventKey,
        templateCode: code,
        recipientMask: `${local?.slice(0, 1)}***@${domain}`,
        kind: "MESSAGE",
        status: ready ? "PENDING" : "SKIPPED",
        failureCode: ready ? null : "MAIL_DISABLED_OR_UNAVAILABLE",
        payload: ready
          ? (this.crypto.encrypt({
              to,
              ...message,
            }) as unknown as Prisma.InputJsonValue)
          : Prisma.DbNull,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });
  }
  async notify(
    tx: Prisma.TransactionClient,
    code: MailTemplateCode,
    event: string,
    recipients: string[],
    values: Record<string, string>,
  ) {
    const template = (await this.templates(tx)).find(
      (item) => item.code === code,
    )!;
    for (const to of [
      ...new Set(recipients.map((email) => email.trim().toLowerCase())),
    ]
      .filter((email) => isEmail(email))
      .slice(0, 50)) {
      await this.queue(
        tx,
        code,
        digest(`${code}:${event}:${to}`),
        to,
        renderMail(template.subject, template.body, values),
      );
    }
  }
  async storeEvent(
    tx: Prisma.TransactionClient,
    code: MailTemplateCode,
    storeId: string,
    event: string,
    extraRecipients: string[] = [],
    snapshot?: Pick<Organization, "id" | "name" | "status" | "settings">,
  ) {
    const store =
      snapshot ??
      (await tx.organization.findUniqueOrThrow({ where: { id: storeId } }));
    const members = await tx.organizationMembership.findMany({
      where: {
        orgId: storeId,
        deletedAt: null,
        status: { in: ["ACTIVE", "PENDING_ACTIVATION"] },
        OR: [
          {
            role: {
              in: ["ORGANIZATION_OWNER", "ORGANIZATION_ADMIN", "STORE_OWNER"],
            },
          },
          {
            roleAssignments: {
              some: { role: { isActive: true, systemCode: "store-admin" } },
            },
          },
        ],
        user: { deletedAt: null, status: "ACTIVE" },
      },
      select: { user: { select: { email: true } } },
    });
    const settings = store.settings as {
      storeProfile?: { contactEmail?: string };
      contactEmail?: string;
    } | null;
    await this.notify(
      tx,
      code,
      event,
      [
        ...members.map((m) => m.user.email),
        ...extraRecipients,
        settings?.storeProfile?.contactEmail ?? settings?.contactEmail ?? "",
      ],
      { storeName: store.name, status: store.status },
    );
  }
  async purchase(
    tx: Prisma.TransactionClient,
    orderId: string,
    review: boolean,
  ) {
    const order = await tx.shoppingOrder.findUniqueOrThrow({
      where: { id: orderId },
      include: { items: true, organization: true },
    });
    if (!order.paidAt) return;
    const members = await tx.organizationMembership.findMany({
      where: {
        orgId: order.organizationId,
        status: "ACTIVE",
        deletedAt: null,
        user: { status: "ACTIVE", deletedAt: null },
        OR: [
          {
            role: {
              in: ["ORGANIZATION_OWNER", "ORGANIZATION_ADMIN", "STORE_OWNER"],
            },
          },
          {
            roleAssignments: {
              some: { role: { isActive: true, systemCode: "store-admin" } },
            },
          },
        ],
      },
      select: { user: { select: { email: true } } },
    });
    const settings = order.organization.settings as {
      storeProfile?: { contactEmail?: string };
      contactEmail?: string;
    } | null;
    const money = (cents: number) =>
      `${order.currency} ${(cents / 100).toFixed(2)}`;
    const recipients = [
      ...members.map((m) => m.user.email),
      settings?.storeProfile?.contactEmail ?? settings?.contactEmail ?? "",
    ];
    await this.notify(
      tx,
      review ? "PURCHASE_REVIEW" : "PURCHASE_RECEIPT",
      order.id,
      recipients,
      {
        storeName: order.organization.name,
        orderReference: order.reference,
        total: money(order.totalCents),
        subtotal: money(order.subtotalCents),
        tax: money(order.taxCents),
        items: order.items
          .slice(0, 100)
          .map(
            (item) =>
              `${item.quantity} × ${item.productName} (${[item.size, item.color].filter(Boolean).join(" / ") || "Standard"}) — ${money(item.totalCents)}`,
          )
          .join("\n"),
      },
    );
  }
}
