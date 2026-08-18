import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module.js";
import { DatabaseModule } from "../database/database.module.js";
import { AccessControlController } from "../platform/access-control.controller.js";
import { AccessControlService } from "../platform/access-control.service.js";
import { PlatformAuthorizationService } from "../platform/platform-authorization.service.js";
import { StoreRbacController } from "./store-rbac.controller.js";
import { StoreRbacService } from "./store-rbac.service.js";

@Module({
  imports: [AuthModule, DatabaseModule],
  controllers: [StoreRbacController, AccessControlController],
  providers: [
    StoreRbacService,
    AccessControlService,
    PlatformAuthorizationService,
  ],
  exports: [StoreRbacService],
})
export class RbacModule {}
