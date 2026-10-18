import { Module } from "@nestjs/common";
import { MailModule } from "../mail/mail.module.js";
import { MailSettingsController } from "../mail/mail-settings.controller.js";
import { UsersController } from "../platform/users.controller.js";
import { UsersService } from "../platform/users.service.js";
import { UserDeletionService } from "../platform/user-deletion.service.js";
import { StoreUserDeletionController } from "../platform/store-user-deletion.controller.js";

import { AuthModule } from "../auth/auth.module.js";
import { DatabaseModule } from "../database/database.module.js";
import { EntitlementsModule } from "../entitlements/entitlements.module.js";
import { AccessControlController } from "../platform/access-control.controller.js";
import { AccessControlService } from "../platform/access-control.service.js";
import { LoginPageSettingsService } from "../platform/login-page-settings.service.js";
import { MediaUploadSettingsService } from "../platform/media-upload-settings.service.js";
import { PlatformSettingsController } from "../platform/platform-settings.controller.js";
import { PlatformAuthorizationService } from "../platform/platform-authorization.service.js";
import { StoreImpersonationService } from "../stores/store-impersonation.service.js";
import { TryOnModule } from "../try-on/try-on.module.js";
import { StoreRbacController } from "./store-rbac.controller.js";
import { StoreRbacService } from "./store-rbac.service.js";

@Module({
  imports: [
    AuthModule,
    DatabaseModule,
    EntitlementsModule,
    TryOnModule,
    MailModule,
  ],
  controllers: [
    StoreUserDeletionController,
    UsersController,
    MailSettingsController,
    StoreRbacController,
    AccessControlController,
    PlatformSettingsController,
  ],
  providers: [
    UserDeletionService,
    UsersService,
    StoreRbacService,
    AccessControlService,
    LoginPageSettingsService,
    MediaUploadSettingsService,
    PlatformAuthorizationService,
    StoreImpersonationService,
  ],
  exports: [StoreRbacService, UserDeletionService],
})
export class RbacModule {}
