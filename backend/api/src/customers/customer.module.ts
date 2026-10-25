import { Module } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { DatabaseModule } from "../database/database.module.js";
import { MailModule } from "../mail/mail.module.js";
import { PasswordService } from "../auth/password.service.js";
import { CustomerAuthController } from "./customer-auth.controller.js";
import { CustomerAuthService } from "./customer-auth.service.js";
import { CustomerIdentityClient } from "./customer-identity.client.js";
import { AuthModule } from "../auth/auth.module.js";
import { PlatformAuthorizationService } from "../platform/platform-authorization.service.js";
import { CustomerMetricsController } from "./customer-metrics.controller.js";
import { CustomerMetricsService } from "./customer-metrics.service.js";
@Module({
  imports: [DatabaseModule, MailModule, AuthModule],
  controllers: [CustomerAuthController, CustomerMetricsController],
  providers: [
    CustomerAuthService,
    CustomerIdentityClient,
    CustomerMetricsService,
    PlatformAuthorizationService,
    PasswordService,
    JwtService,
  ],
  exports: [CustomerAuthService],
})
export class CustomerModule {}
