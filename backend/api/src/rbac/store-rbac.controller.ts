import {
  Body,
  Controller,
  Delete,
  Get,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  Optional,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import { type FastifyRequest } from "fastify";

import { AuthService } from "../auth/auth.service.js";
import { ApiErrorResponseDto } from "../auth/dto/auth-response.dto.js";
import { ApiErrorException } from "../common/api-error.exception.js";
import { SelfxUuidParamPipe } from "../common/uuid-param.pipe.js";
import { EntitlementsService } from "../entitlements/entitlements.service.js";
import {
  PLATFORM_PERMISSIONS,
  type PlatformPermission,
} from "../platform/platform-permissions.js";
import { PlatformAuthorizationService } from "../platform/platform-authorization.service.js";
import { StoreImpersonationService } from "../stores/store-impersonation.service.js";
import {
  AddStoreUserDto,
  CreateStoreRoleDto,
  EffectiveStorePermissionsResponseDto,
  ReplaceStoreRolePermissionsDto,
  ReplaceStoreUserRolesDto,
  StorePermissionDto,
  StoreRbacListQueryDto,
  StoreRoleListResponseDto,
  StoreRoleResponseDto,
  StoreUserListResponseDto,
  StoreUserResponseDto,
  StoreUsersQueryDto,
  UpdateStoreRoleDto,
  UpdateStoreUserStatusDto,
} from "./dto/store-rbac.dto.js";
import {
  STORE_PERMISSION_CODES,
  type StorePermissionCode,
} from "./store-permissions.js";
import { StoreRbacService } from "./store-rbac.service.js";

@ApiTags("Store RBAC")
@ApiBearerAuth()
@Controller("api/v1/admin/stores/:storeId")
export class StoreRbacController {
  constructor(
    private readonly auth: AuthService,
    private readonly platformAuthorization: PlatformAuthorizationService,
    private readonly rbac: StoreRbacService,
    private readonly impersonation: StoreImpersonationService,
    @Optional() private readonly entitlements?: EntitlementsService,
  ) {}

  @Get("permissions")
  @ApiOperation({ summary: "List canonical Store permissions" })
  @ApiOkResponse({ type: [StorePermissionDto] })
  async permissions(
    @Req() request: FastifyRequest,
    @Param("storeId", SelfxUuidParamPipe) storeId: string,
  ): Promise<{ data: StorePermissionDto[] }> {
    await this.requirePlatformOrStorePermission(
      request,
      storeId,
      PLATFORM_PERMISSIONS.permissionsView,
      STORE_PERMISSION_CODES.rolesView,
    );
    return this.rbac.listPermissions(storeId);
  }

  @Get("effective-permissions")
  @ApiOperation({
    summary: "Resolve current user's effective Store permissions",
  })
  @ApiOkResponse({ type: EffectiveStorePermissionsResponseDto })
  async effectivePermissions(
    @Req() request: FastifyRequest,
    @Param("storeId", SelfxUuidParamPipe) storeId: string,
  ): Promise<EffectiveStorePermissionsResponseDto> {
    const user = await this.auth.requireAccessUser(
      request.headers.authorization,
    );
    await this.impersonation.resolveStoreContext(user.id, storeId);
    const permissions = await this.rbac.effectivePermissions(user.id, storeId);
    const creditSummary = await this.entitlements?.getStoreCreditSummary(
      storeId,
    );
    return {
      ...permissions,
      featureKeys: creditSummary?.subscription?.featureKeys ?? [],
      storeLocationLimit:
        creditSummary?.subscription?.pricingPlan?.storeLocationLimit ?? 0,
    };
  }

  @Get("roles")
  @ApiOperation({ summary: "List Store roles" })
  @ApiOkResponse({ type: StoreRoleListResponseDto })
  @ApiResponse({ status: 401, type: ApiErrorResponseDto })
  @ApiResponse({ status: 403, type: ApiErrorResponseDto })
  async listRoles(
    @Req() request: FastifyRequest,
    @Param("storeId", SelfxUuidParamPipe) storeId: string,
    @Query() query: StoreRbacListQueryDto,
  ): Promise<StoreRoleListResponseDto> {
    await this.requirePlatformOrStorePermission(
      request,
      storeId,
      PLATFORM_PERMISSIONS.storeRolesView,
      STORE_PERMISSION_CODES.rolesView,
    );
    await this.requireStoreTeamLocationsEntitlement(storeId);
    return this.rbac.listRoles(storeId, query);
  }

  @Post("roles")
  @ApiOperation({ summary: "Create a custom Store role" })
  @ApiCreatedResponse({ type: StoreRoleResponseDto })
  async createRole(
    @Req() request: FastifyRequest,
    @Param("storeId", SelfxUuidParamPipe) storeId: string,
    @Body() dto: CreateStoreRoleDto,
  ): Promise<StoreRoleResponseDto> {
    const user = await this.requirePlatformOrStorePermission(
      request,
      storeId,
      PLATFORM_PERMISSIONS.storeRolesManage,
      STORE_PERMISSION_CODES.rolesCreate,
    );
    await this.requireStoreTeamLocationsEntitlement(storeId);
    return this.rbac.createRole(user.id, storeId, dto);
  }

  @Patch("roles/:roleId")
  @ApiOperation({ summary: "Update a Store role" })
  @ApiOkResponse({ type: StoreRoleResponseDto })
  async updateRole(
    @Req() request: FastifyRequest,
    @Param("storeId", SelfxUuidParamPipe) storeId: string,
    @Param("roleId", SelfxUuidParamPipe) roleId: string,
    @Body() dto: UpdateStoreRoleDto,
  ): Promise<StoreRoleResponseDto> {
    const user = await this.requirePlatformOrStorePermission(
      request,
      storeId,
      PLATFORM_PERMISSIONS.storeRolesManage,
      STORE_PERMISSION_CODES.rolesUpdate,
    );
    await this.requireStoreTeamLocationsEntitlement(storeId);
    return this.rbac.updateRole(user.id, storeId, roleId, dto);
  }

  @Put("roles/:roleId/permissions")
  @ApiOperation({ summary: "Replace permissions on a custom Store role" })
  @ApiOkResponse({ type: StoreRoleResponseDto })
  async replaceRolePermissions(
    @Req() request: FastifyRequest,
    @Param("storeId", SelfxUuidParamPipe) storeId: string,
    @Param("roleId", SelfxUuidParamPipe) roleId: string,
    @Body() dto: ReplaceStoreRolePermissionsDto,
  ): Promise<StoreRoleResponseDto> {
    const user = await this.requirePlatformOrStorePermission(
      request,
      storeId,
      PLATFORM_PERMISSIONS.storeRolesManage,
      STORE_PERMISSION_CODES.rolesUpdate,
    );
    await this.requireStoreTeamLocationsEntitlement(storeId);
    return this.rbac.replaceRolePermissions(user.id, storeId, roleId, dto);
  }

  @Delete("roles/:roleId")
  @ApiOperation({ summary: "Delete an unused custom Store role" })
  @ApiOkResponse({ type: StoreRoleResponseDto })
  async deleteRole(
    @Req() request: FastifyRequest,
    @Param("storeId", SelfxUuidParamPipe) storeId: string,
    @Param("roleId", SelfxUuidParamPipe) roleId: string,
  ): Promise<StoreRoleResponseDto> {
    const user = await this.requirePlatformOrStorePermission(
      request,
      storeId,
      PLATFORM_PERMISSIONS.storeRolesManage,
      STORE_PERMISSION_CODES.rolesDelete,
    );
    await this.requireStoreTeamLocationsEntitlement(storeId);
    return this.rbac.deleteRole(user.id, storeId, roleId);
  }

  @Get("users")
  @ApiOperation({ summary: "List Store users and role assignments" })
  @ApiOkResponse({ type: StoreUserListResponseDto })
  async listUsers(
    @Req() request: FastifyRequest,
    @Param("storeId", SelfxUuidParamPipe) storeId: string,
    @Query() query: StoreUsersQueryDto,
  ): Promise<StoreUserListResponseDto> {
    await this.requirePlatformOrStorePermission(
      request,
      storeId,
      PLATFORM_PERMISSIONS.storeUsersView,
      STORE_PERMISSION_CODES.usersView,
    );
    await this.requireStoreTeamLocationsEntitlement(storeId);
    return this.rbac.listUsers(storeId, query);
  }

  @Post("users")
  @ApiOperation({ summary: "Add an existing SelfX user to a Store" })
  @ApiCreatedResponse({ type: StoreUserResponseDto })
  async addUser(
    @Req() request: FastifyRequest,
    @Param("storeId", SelfxUuidParamPipe) storeId: string,
    @Body() dto: AddStoreUserDto,
  ): Promise<StoreUserResponseDto> {
    const user = await this.requirePlatformOrStorePermission(
      request,
      storeId,
      PLATFORM_PERMISSIONS.storeUsersManage,
      STORE_PERMISSION_CODES.usersInvite,
    );
    await this.requireStoreTeamLocationsEntitlement(storeId);
    return this.rbac.addUser(user.id, storeId, dto);
  }

  @Patch("users/:membershipId/status")
  @ApiOperation({ summary: "Update Store membership status" })
  @ApiOkResponse({ type: StoreUserResponseDto })
  async updateUserStatus(
    @Req() request: FastifyRequest,
    @Param("storeId", SelfxUuidParamPipe) storeId: string,
    @Param("membershipId", SelfxUuidParamPipe) membershipId: string,
    @Body() dto: UpdateStoreUserStatusDto,
  ): Promise<StoreUserResponseDto> {
    const user = await this.requirePlatformOrStorePermission(
      request,
      storeId,
      PLATFORM_PERMISSIONS.storeUsersManage,
      STORE_PERMISSION_CODES.usersDeactivate,
    );
    await this.requireStoreTeamLocationsEntitlement(storeId);
    return this.rbac.updateUserStatus(user.id, storeId, membershipId, dto);
  }

  @Put("users/:membershipId/roles")
  @ApiOperation({ summary: "Replace role assignments for a Store membership" })
  @ApiOkResponse({ type: StoreUserResponseDto })
  async replaceUserRoles(
    @Req() request: FastifyRequest,
    @Param("storeId", SelfxUuidParamPipe) storeId: string,
    @Param("membershipId", SelfxUuidParamPipe) membershipId: string,
    @Body() dto: ReplaceStoreUserRolesDto,
  ): Promise<StoreUserResponseDto> {
    const user = await this.requirePlatformOrStorePermission(
      request,
      storeId,
      PLATFORM_PERMISSIONS.storeUsersManage,
      STORE_PERMISSION_CODES.rolesAssign,
    );
    await this.requireStoreTeamLocationsEntitlement(storeId);
    return this.rbac.replaceUserRoles(user.id, storeId, membershipId, dto);
  }

  private async requireStoreTeamLocationsEntitlement(
    storeId: string,
  ): Promise<void> {
    const creditSummary = await this.entitlements?.getStoreCreditSummary(
      storeId,
    );
    const storeLocationLimit =
      creditSummary?.subscription?.pricingPlan?.storeLocationLimit ?? 0;
    if (storeLocationLimit === null || storeLocationLimit > 0) {
      return;
    }
    throw new ApiErrorException(
      HttpStatus.PAYMENT_REQUIRED,
      "STORE_TEAM_LOCATIONS_PLAN_REQUIRED",
      "Team and location management is not included in this Store's current SelfX plan.",
    );
  }

  private async requirePlatformPermission(
    request: FastifyRequest,
    permission: PlatformPermission,
  ) {
    const user = await this.auth.requireAccessUser(
      request.headers.authorization,
    );
    await this.platformAuthorization.requirePermission(user.id, permission);
    return user;
  }

  private async requirePlatformOrStorePermission(
    request: FastifyRequest,
    storeId: string,
    platformPermission: PlatformPermission,
    storePermission: StorePermissionCode,
  ) {
    const user = await this.auth.requireAccessUser(
      request.headers.authorization,
    );
    await this.impersonation.resolveStoreContext(user.id, storeId);
    if (
      await this.platformAuthorization.hasPermission(
        user.id,
        platformPermission,
      )
    ) {
      return user;
    }
    await this.rbac.requireStorePermission(user.id, storeId, storePermission);
    return user;
  }
}
