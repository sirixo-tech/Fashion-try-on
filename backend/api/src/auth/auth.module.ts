import { Module } from "@nestjs/common";
import { MailModule } from "../mail/mail.module.js";
import { MailAutomationService } from "../mail/mail-automation.service.js";
import { PasswordRecoveryService } from "./password-recovery.service.js";
import { PasswordRecoveryController } from "./password-recovery.controller.js";
import { JwtService } from "@nestjs/jwt";

import { DatabaseModule } from "../database/database.module.js";
import { PrismaService } from "../database/prisma.service.js";
import { AuthController } from "./auth.controller.js";
import { AUTH_CONFIG, AUTH_REPOSITORY } from "./auth.constants.js";
import { loadAuthConfig } from "./auth.config.js";
import { PrismaAuthRepository } from "./auth.repository.js";
import { AuthService } from "./auth.service.js";
import { BrowserSecurityService } from "./browser-security.service.js";
import { PasswordService } from "./password.service.js";
import { AuthRateLimiterService } from "./rate-limiter.service.js";
import { RefreshTokenService } from "./refresh-token.service.js";
import { GoogleAuthController } from "./google-auth.controller.js";
import { GoogleAuthService } from "./google-auth.service.js";
import { GoogleIdentityClient } from "./google-identity.client.js";
import { RegionalSettingsController } from "../account/regional-settings.controller.js";

@Module({
  imports: [DatabaseModule, MailModule],
  controllers: [
    AuthController,
    PasswordRecoveryController,
    GoogleAuthController,
    RegionalSettingsController,
  ],
  providers: [
    PasswordRecoveryService,
    JwtService,
    PasswordService,
    RefreshTokenService,
    AuthRateLimiterService,
    BrowserSecurityService,
    AuthService,
    GoogleAuthService,
    GoogleIdentityClient,
    {
      provide: AUTH_CONFIG,
      useFactory: () => loadAuthConfig(),
    },
    {
      provide: AUTH_REPOSITORY,
      useFactory: (prisma: PrismaService, mail: MailAutomationService) =>
        new PrismaAuthRepository(prisma, mail),
      inject: [PrismaService, MailAutomationService],
    },
  ],
  exports: [AuthService, PasswordService],
})
export class AuthModule {}
