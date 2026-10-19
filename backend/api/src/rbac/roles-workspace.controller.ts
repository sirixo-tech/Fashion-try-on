import { Body, Controller, Get, Header, Param, Put, Req } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { FastifyRequest } from "fastify";
import { AuthService } from "../auth/auth.service.js";
import { PrismaService } from "../database/prisma.service.js";
import { AccessControlService } from "../platform/access-control.service.js";
import { SelfxUuidParamPipe } from "../common/uuid-param.pipe.js";
import { StoreImpersonationService } from "../stores/store-impersonation.service.js";
import { StoreRbacService } from "./store-rbac.service.js";
import { ReplaceStoreRolePermissionsDto } from "./dto/store-rbac.dto.js";
import { platformRoleAuthority, roleDenied } from "./role-management-policy.js";
import { GlobalStoreRolesService } from "./global-store-roles.service.js";

@ApiTags("Role management")
@ApiBearerAuth()
@Controller("api/v1/admin/roles")
export class RolesWorkspaceController {
  constructor(
    private readonly auth: AuthService,
    private readonly prisma: PrismaService,
    private readonly access: AccessControlService,
    private readonly rbac: StoreRbacService,
    private readonly impersonation: StoreImpersonationService,
  ) {}

  @Get()
  @Header("Cache-Control", "private, no-store")
  @ApiOperation({
    summary: "Review application-wide role permission definitions",
  })
  async context(@Req() request: FastifyRequest) {
    const user = await this.auth.requireAccessUser(
      request.headers.authorization,
    );
    const authority = await platformRoleAuthority(this.prisma, user.id);
    const canViewPlatform =
      !authority.impersonating &&
      (authority.isSuperadmin ||
        authority.permissions.some((p) =>
          [
            "PERMISSIONS_VIEW",
            "PERMISSIONS_MANAGE",
            "PLATFORM_ROLES_MANAGE",
            "PLATFORM_USERS_MANAGE",
          ].includes(p),
        ));
    const [roles, permissions, storeRoles] = await Promise.all([
      canViewPlatform
        ? this.access.listPlatformRoles()
        : Promise.resolve({ data: [] }),
      this.access.listPermissions(),
      new GlobalStoreRolesService(this.prisma).workspace(user.id),
    ]);
    if (!canViewPlatform && !storeRoles.roles.length)
      roleDenied("Role viewing permission is required.");
    return {
      canViewPlatform,
      canEditPlatformAdmin: !authority.impersonating && authority.isSuperadmin,
      canEditPlatformStaff:
        !authority.impersonating &&
        (authority.isSuperadmin ||
          authority.permissions.includes("PLATFORM_ROLES_MANAGE")),
      assignablePlatformCodes: canViewPlatform
        ? permissions.data
            .filter(
              (p) =>
                p.applicability === "PLATFORM_ONLY" &&
                (authority.isSuperadmin ||
                  (new Set<string>(authority.permissions).has(p.code) &&
                    !["PERMISSIONS_MANAGE", "ORGANIZATION_SUSPEND"].includes(
                      p.code,
                    ))),
            )
            .map((p) => p.code)
        : [],
      roles: roles.data,
      permissions: canViewPlatform
        ? permissions.data.filter((p) => p.applicability === "PLATFORM_ONLY")
        : [],
      storeRoles,
    };
  }

  @Put("store-roles/:systemCode/permissions")
  @ApiOperation({
    summary:
      "Replace a Store role's application-wide permissions for all Stores",
  })
  async replaceGlobalStoreRole(
    @Req() request: FastifyRequest,
    @Param("systemCode") systemCode: string,
    @Body() input: ReplaceStoreRolePermissionsDto,
  ) {
    const user = await this.auth.requireAccessUser(
      request.headers.authorization,
    );
    return new GlobalStoreRolesService(this.prisma).replace(
      user.id,
      systemCode,
      input,
    );
  }

  // Compatibility read route: membership IDs remain tenant-owned; maps are shared.
  @Get("stores/:storeId")
  @Header("Cache-Control", "private, no-store")
  async store(
    @Req() request: FastifyRequest,
    @Param("storeId", SelfxUuidParamPipe) storeId: string,
  ) {
    const user = await this.auth.requireAccessUser(
      request.headers.authorization,
    );
    await this.impersonation.resolveStoreContext(user.id, storeId);
    const policy = await this.rbac.roleManagementPolicy(user.id, storeId);
    if (!policy.canView)
      roleDenied("Store role viewing permission is required.");
    const [roles, permissions] = await Promise.all([
      this.rbac.listRoles(storeId, { pageSize: 100 }),
      this.rbac.listPermissions(storeId),
    ]);
    return {
      roles: roles.data,
      permissions: permissions.data,
      policy,
      canEditCeiling: false,
    };
  }
}
