import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module.js";
import { DatabaseModule } from "../database/database.module.js";
import { AccessControlController } from "../platform/access-control.controller.js";
import { AccessControlService } from "../platform/access-control.service.js";
import { LoginPageSettingsService } from "../platform/login-page-settings.service.js";
import { MediaUploadSettingsService } from "../platform/media-upload-settings.service.js";
import { PlatformSettingsController } from "../platform/platform-settings.controller.js";
import { PlatformAuthorizationService } from "../platform/platform-authorization.service.js";
import { TryOnModule } from "../try-on/try-on.module.js";
import { StoreRbacController } from "./store-rbac.controller.js";
import { StoreRbacService } from "./store-rbac.service.js";

@Module({
  imports: [AuthModule, DatabaseModule, TryOnModule],
  controllers: [
    StoreRbacController,
    AccessControlController,
    PlatformSettingsController,
  ],
  providers: [
    StoreRbacService,
    AccessControlService,
    LoginPageSettingsService,
    MediaUploadSettingsService,
    PlatformAuthorizationService,
  ],
  exports: [StoreRbacService],
})
export class RbacModule {}
