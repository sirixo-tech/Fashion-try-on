import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
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
import { SelfxUuidParamPipe } from "../common/uuid-param.pipe.js";
import {
  PLATFORM_PERMISSIONS,
  type PlatformPermission,
} from "../platform/platform-permissions.js";
import { PlatformAuthorizationService } from "../platform/platform-authorization.service.js";
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
    return this.rbac.listPermissions();
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
    return this.rbac.effectivePermissions(user.id, storeId);
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
    return this.rbac.replaceUserRoles(user.id, storeId, membershipId, dto);
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
