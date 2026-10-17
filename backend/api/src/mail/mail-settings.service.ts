import { HttpStatus, Injectable } from "@nestjs/common";
import { createSelfxId } from "@selfx/database";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../database/prisma.service.js";
import { ApiErrorException } from "../common/api-error.exception.js";
import { MailCrypto, type MailEnvelope } from "./mail-crypto.js";
import { type SaveMailSettingsDto } from "./mail.dto.js";
import {
  type SmtpAccount,
  SmtpSender,
  MailDeliveryError,
} from "./smtp-sender.js";

const key = "platform.mail";
export interface StoredMailSettings {
  version: number;
  enabled: boolean;
  host: string;
  port: number;
  security: "TLS" | "STARTTLS";
  credentials: MailEnvelope | null;
  fromEmail: string;
  fromName: string;
  replyTo?: string;
  lastTest: { status: "ACCEPTED" | "FAILED"; at: string; code?: string } | null;
}
const defaults: StoredMailSettings = {
  version: 0,
  enabled: false,
  host: "",
  port: 587,
  security: "STARTTLS",
  credentials: null,
  fromEmail: "",
  fromName: "SelfX",
  lastTest: null,
};
export function mailError(
  code: string,
  message: string,
  status = HttpStatus.SERVICE_UNAVAILABLE,
): never {
  throw new ApiErrorException(status, code, message);
}

@Injectable()
export class MailSettingsService {
  constructor(
    private readonly db: PrismaService,
    private readonly crypto: MailCrypto,
    private readonly sender: SmtpSender,
  ) {}
  async stored(
    tx: Prisma.TransactionClient = this.db,
  ): Promise<StoredMailSettings> {
    const row = await tx.platformSetting.findUnique({ where: { key } });
    return row ? (row.value as unknown as StoredMailSettings) : { ...defaults };
  }
  private safe(value: StoredMailSettings) {
    let username = "",
      keyReady = this.crypto.ready();
    if (value.credentials) {
      try {
        username = this.crypto.decrypt<{ username: string }>(
          value.credentials,
        ).username;
      } catch {
        keyReady = false;
      }
    }
    return {
      version: value.version,
      enabled: value.enabled,
      host: value.host,
      port: value.port,
      security: value.security,
      username,
      fromEmail: value.fromEmail,
      fromName: value.fromName,
      replyTo: value.replyTo ?? "",
      hasPassword: Boolean(value.credentials),
      keyReady,
      configured: Boolean(value.host && value.credentials && value.fromEmail),
      lastTest: value.lastTest,
    };
  }
  async get() {
    return this.safe(await this.stored());
  }
  async save(actorId: string, input: SaveMailSettingsDto) {
    if (!this.crypto.ready())
      mailError(
        "MAIL_KEY_UNAVAILABLE",
        "The API mail encryption key is not configured.",
      );
    return this.db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(721104, 1)`;
      const current = await this.stored(tx);
      if (current.version !== input.version)
        mailError(
          "MAIL_SETTINGS_CONFLICT",
          "Mail settings changed. Refresh before saving.",
          HttpStatus.CONFLICT,
        );
      let password = input.password;
      if (!password && current.credentials) {
        try {
          password = this.crypto.decrypt<{ password: string }>(
            current.credentials,
          ).password;
        } catch {
          mailError(
            "MAIL_KEY_UNAVAILABLE",
            "Saved credentials cannot be decrypted. Restore the original encryption key.",
          );
        }
      }
      if (!password)
        mailError(
          "MAIL_PASSWORD_REQUIRED",
          "Enter the SMTP password for the initial configuration.",
          HttpStatus.BAD_REQUEST,
        );
      const next: StoredMailSettings = {
        version: current.version + 1,
        enabled: input.enabled,
        host: input.host.trim().toLowerCase(),
        port: input.port,
        security: input.security,
        credentials: this.crypto.encrypt({
          username: input.username.trim(),
          password,
        }),
        fromEmail: input.fromEmail.trim(),
        fromName: input.fromName.trim(),
        ...(input.replyTo ? { replyTo: input.replyTo.trim() } : {}),
        lastTest: null,
      };
      await tx.platformSetting.upsert({
        where: { key },
        create: { key, value: next as unknown as Prisma.InputJsonValue },
        update: { value: next as unknown as Prisma.InputJsonValue },
      });
      await tx.auditLog.create({
        data: {
          id: createSelfxId(),
          actorUserId: actorId,
          action: "PLATFORM_MAIL_SETTINGS_UPDATED",
          resourceType: "platform_mail_settings",
          metadata: {
            version: next.version,
            enabled: next.enabled,
            credentialsReplaced: Boolean(input.password),
          },
        },
      });
      return this.safe(next);
    });
  }
  async account(
    allowDisabled = false,
  ): Promise<{ account: SmtpAccount; version: number }> {
    const settings = await this.stored();
    if (
      (!allowDisabled && !settings.enabled) ||
      !settings.credentials ||
      !settings.host
    )
      mailError("MAIL_UNAVAILABLE", "Email delivery is not available.");
    try {
      const credentials = this.crypto.decrypt<{
        username: string;
        password: string;
      }>(settings.credentials);
      return {
        version: settings.version,
        account: {
          host: settings.host,
          port: settings.port,
          security: settings.security,
          fromEmail: settings.fromEmail,
          fromName: settings.fromName,
          replyTo: settings.replyTo,
          ...credentials,
        },
      };
    } catch {
      mailError(
        "MAIL_KEY_UNAVAILABLE",
        "The API cannot decrypt saved mail credentials.",
      );
    }
  }
  async test(actorId: string, recipient: string, version: number) {
    const { account, version: currentVersion } = await this.account(true);
    if (version !== currentVersion)
      mailError(
        "MAIL_SETTINGS_CONFLICT",
        "Refresh and test the current saved settings.",
        HttpStatus.CONFLICT,
      );
    await this.db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(721104, 2)`;
      const recent = await tx.auditLog.count({
        where: {
          action: "PLATFORM_MAIL_TEST_STARTED",
          createdAt: { gte: new Date(Date.now() - 60_000) },
        },
      });
      if (recent >= 3)
        mailError(
          "MAIL_TEST_RATE_LIMITED",
          "Wait a minute before sending another test email.",
          HttpStatus.TOO_MANY_REQUESTS,
        );
      await tx.auditLog.create({
        data: {
          id: createSelfxId(),
          actorUserId: actorId,
          action: "PLATFORM_MAIL_TEST_STARTED",
          resourceType: "platform_mail_settings",
          metadata: { version },
        },
      });
    });
    let failure: string | undefined;
    try {
      await this.sender.send(account, {
        to: recipient,
        subject: "SelfX test email",
        text: "This test email confirms that your saved SelfX SMTP configuration was accepted by the mail server.",
      });
    } catch (error) {
      failure =
        error instanceof MailDeliveryError
          ? error.code
          : "SMTP_DELIVERY_FAILED";
    }
    await this.db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(721104, 1)`;
      const current = await this.stored(tx);
      if (current.version === version) {
        current.lastTest = {
          status: failure ? "FAILED" : "ACCEPTED",
          at: new Date().toISOString(),
          ...(failure ? { code: failure } : {}),
        };
        await tx.platformSetting.update({
          where: { key },
          data: { value: current as unknown as Prisma.InputJsonValue },
        });
      }
      await tx.auditLog.create({
        data: {
          id: createSelfxId(),
          actorUserId: actorId,
          action: failure
            ? "PLATFORM_MAIL_TEST_FAILED"
            : "PLATFORM_MAIL_TEST_ACCEPTED",
          resourceType: "platform_mail_settings",
          metadata: { version, ...(failure ? { code: failure } : {}) },
        },
      });
    });
    if (failure)
      mailError(
        failure,
        "The test email could not be sent. Check SMTP credentials, security mode and provider access.",
        HttpStatus.BAD_GATEWAY,
      );
    return {
      accepted: true,
      message:
        "SMTP accepted the test email. Check the recipient inbox and spam folder.",
    };
  }
}
