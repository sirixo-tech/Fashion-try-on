import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module.js";
import { DatabaseModule } from "../database/database.module.js";
import { PlatformAuthorizationService } from "../platform/platform-authorization.service.js";
import { StoreRbacService } from "../rbac/store-rbac.service.js";
import { UsageEventService } from "./usage-event.service.js";
import { UsageSummaryController } from "./usage-summary.controller.js";
import { UsageSummaryService } from "./usage-summary.service.js";

@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [UsageSummaryController],
  providers: [
    UsageEventService,
    UsageSummaryService,
    PlatformAuthorizationService,
    StoreRbacService,
  ],
  exports: [UsageEventService, UsageSummaryService],
})
export class UsageModule {}
