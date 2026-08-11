import { Module } from "@nestjs/common";
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

@Module({
  imports: [DatabaseModule],
  controllers: [AuthController],
  providers: [
    JwtService,
    PasswordService,
    RefreshTokenService,
    AuthRateLimiterService,
    BrowserSecurityService,
    AuthService,
    {
      provide: AUTH_CONFIG,
      useFactory: () => loadAuthConfig(),
    },
    {
      provide: AUTH_REPOSITORY,
      useFactory: (prisma: PrismaService) => new PrismaAuthRepository(prisma),
      inject: [PrismaService],
    },
  ],
  exports: [AuthService, PasswordService],
})
export class AuthModule {}
