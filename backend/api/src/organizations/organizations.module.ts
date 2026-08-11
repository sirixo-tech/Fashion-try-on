import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module.js";
import { DatabaseModule } from "../database/database.module.js";
import { PlatformAuthorizationService } from "../platform/platform-authorization.service.js";
import { MembershipsController } from "./memberships.controller.js";
import { OrganizationApplicationsController } from "./organization-applications.controller.js";
import { OrganizationApplicationsService } from "./organization-applications.service.js";
import { OrganizationTenantGuardService } from "./organization-tenant-guard.service.js";
import { OrganizationsController } from "./organizations.controller.js";
import { PlatformOrganizationApplicationsController } from "./platform-organization-applications.controller.js";
import { StoresController } from "./stores.controller.js";
import { TenantAuthorizationService } from "./tenant-authorization.service.js";
import { TenantManagementService } from "./tenant-management.service.js";

@Module({
  imports: [AuthModule, DatabaseModule],
  controllers: [
    OrganizationApplicationsController,
    PlatformOrganizationApplicationsController,
    OrganizationsController,
    StoresController,
    MembershipsController,
  ],
  providers: [
    OrganizationApplicationsService,
    OrganizationTenantGuardService,
    TenantAuthorizationService,
    TenantManagementService,
    PlatformAuthorizationService,
  ],
  exports: [
    OrganizationTenantGuardService,
    TenantAuthorizationService,
    PlatformAuthorizationService,
  ],
})
export class OrganizationsModule {}
