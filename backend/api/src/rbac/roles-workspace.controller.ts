import { Controller, Get, Header, Param, Query, Req } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import type { FastifyRequest } from "fastify";
import { AuthService } from "../auth/auth.service.js";
import { PrismaService } from "../database/prisma.service.js";
import { AccessControlService } from "../platform/access-control.service.js";
import { SelfxUuidParamPipe } from "../common/uuid-param.pipe.js";
import { StoreImpersonationService } from "../stores/store-impersonation.service.js";
import { StoreRbacService } from "./store-rbac.service.js";
import { StoreRbacListQueryDto } from "./dto/store-rbac.dto.js";
import { platformRoleAuthority, roleDenied } from "./role-management-policy.js";

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
  async context(
    @Req() request: FastifyRequest,
    @Query() query: StoreRbacListQueryDto,
  ) {
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
    const globalStores =
      !authority.impersonating &&
      (authority.isSuperadmin ||
        authority.permissions.some((p) =>
          [
            "STORE_ROLES_VIEW",
            "STORE_ROLES_MANAGE",
            "PERMISSIONS_VIEW",
            "PERMISSIONS_MANAGE",
          ].includes(p),
        ));
    const impersonation = (await this.impersonation.currentSession(user.id))
      .session;
    const page = query.page ?? 1,
      pageSize = Math.min(query.pageSize ?? 25, 100);
    const where = {
      status: "ACTIVE" as const,
      ...(impersonation
        ? { id: impersonation.targetStoreId }
        : !globalStores
          ? {
              memberships: {
                some: {
                  userId: user.id,
                  status: "ACTIVE" as const,
                  deletedAt: null,
                },
              },
            }
          : {}),
      ...(query.search
        ? { name: { contains: query.search, mode: "insensitive" as const } }
        : {}),
    };
    const [roles, permissions, stores, total] = await Promise.all([
      canViewPlatform
        ? this.access.listPlatformRoles()
        : Promise.resolve({ data: [] }),
      canViewPlatform
        ? this.access.listPermissions()
        : Promise.resolve({ data: [] }),
      this.prisma.organization.findMany({
        where,
        select: { id: true, name: true },
        orderBy: [{ name: "asc" }, { id: "asc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.organization.count({ where }),
    ]);
    return {
      canViewPlatform,
      canEditPlatformAdmin: !authority.impersonating && authority.isSuperadmin,
      canEditPlatformStaff:
        !authority.impersonating &&
        (authority.isSuperadmin ||
          authority.permissions.includes("PLATFORM_ROLES_MANAGE")),
      assignablePlatformCodes: permissions.data
        .filter(
          (p) =>
            p.applicability === "PLATFORM_ONLY" &&
            (authority.isSuperadmin ||
              (new Set<string>(authority.permissions).has(p.code) &&
                !["PERMISSIONS_MANAGE", "ORGANIZATION_SUSPEND"].includes(
                  p.code,
                ))),
        )
        .map((p) => p.code),
      roles: roles.data,
      permissions: permissions.data.filter(
        (p) => p.applicability === "PLATFORM_ONLY",
      ),
      stores: { data: stores, page, total, hasMore: page * pageSize < total },
    };
  }

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
    const [roles, permissions, authority, tenant] = await Promise.all([
      this.rbac.listRoles(storeId, { pageSize: 100 }),
      this.rbac.listPermissions(storeId),
      platformRoleAuthority(this.prisma, user.id),
      this.prisma.organization.findUniqueOrThrow({
        where: { id: storeId },
        select: { updatedAt: true },
      }),
    ]);
    return {
      roles: roles.data,
      permissions: permissions.data,
      policy,
      canEditCeiling: authority.isSuperadmin && !authority.impersonating,
      ceilingUpdatedAt: tenant.updatedAt.toISOString(),
    };
  }
}
