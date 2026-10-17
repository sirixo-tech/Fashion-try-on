import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module.js";
import { MailCrypto } from "./mail-crypto.js";
import { MailSettingsService } from "./mail-settings.service.js";
import { SmtpSender } from "./smtp-sender.js";
import { MailOutboxService } from "./mail-outbox.service.js";

@Module({
  imports: [DatabaseModule],
  providers: [MailCrypto, MailSettingsService, SmtpSender, MailOutboxService],
  exports: [MailCrypto, MailSettingsService, MailOutboxService],
})
export class MailModule {}
