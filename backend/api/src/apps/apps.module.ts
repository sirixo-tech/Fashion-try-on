import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { DatabaseModule } from "../database/database.module.js";
import { RbacModule } from "../rbac/rbac.module.js";
import { PlatformAuthorizationService } from "../platform/platform-authorization.service.js";
import { StoreImpersonationService } from "../stores/store-impersonation.service.js";
import { ObjectStorageService } from "../storage/object-storage.js";
import { ApkValidator } from "./apk-validator.js";
import { AppReleasesService } from "./app-releases.service.js";
import {
  AppReleasesController,
  StoreAppDownloadsController,
} from "./app-releases.controller.js";
@Module({
  imports: [AuthModule, DatabaseModule, RbacModule],
  controllers: [AppReleasesController, StoreAppDownloadsController],
  providers: [
    PlatformAuthorizationService,
    StoreImpersonationService,
    ObjectStorageService,
    ApkValidator,
    AppReleasesService,
  ],
})
export class AppsModule {}
