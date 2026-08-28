import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Req,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import { type FastifyRequest } from "fastify";

import { AuthService } from "../auth/auth.service.js";
import { SelfxUuidParamPipe } from "../common/uuid-param.pipe.js";
import {
  PLATFORM_PERMISSIONS,
  type PlatformPermission,
} from "./platform-permissions.js";
import { PlatformAuthorizationService } from "./platform-authorization.service.js";
import { AccessControlService } from "./access-control.service.js";
import {
  AccessPermissionDto,
  AddPlatformUserDto,
  AssignPlatformRolesDto,
  CreatePlatformRoleDto,
  CurrentPlatformAccessDto,
  PlatformRoleDto,
  PlatformUserDto,
  ReplacePermissionCodesDto,
  StorePermissionGrantDto,
  UpdatePlatformRoleDto,
} from "./dto/access-control.dto.js";

@ApiTags("Platform Access Control")
@ApiBearerAuth()
@Controller("api/v1/admin/access")
export class AccessControlController {
  constructor(
    private readonly auth: AuthService,
    private readonly platformAuthorization: PlatformAuthorizationService,
    private readonly accessControl: AccessControlService,
  ) {}

  @Get("me")
  @ApiOperation({ summary: "Resolve current user's Platform access" })
  @ApiOkResponse({ type: CurrentPlatformAccessDto })
  async currentAccess(
    @Req() request: FastifyRequest,
  ): Promise<CurrentPlatformAccessDto> {
    const user = await this.auth.requireAccessUser(
      request.headers.authorization,
    );
    const [isSuperadmin, permissions] = await Promise.all([
      this.platformAuthorization.isSuperadmin(user.id),
      this.platformAuthorization.allPlatformPermissionsForUser(user.id),
    ]);
    return { isSuperadmin, permissions };
  }

  @Get("permissions")
  @ApiOperation({ summary: "List the global SelfX permission registry" })
  @ApiOkResponse({ type: [AccessPermissionDto] })
  async listPermissions(
    @Req() request: FastifyRequest,
  ): Promise<{ data: AccessPermissionDto[] }> {
    const user = await this.auth.requireAccessUser(
      request.headers.authorization,
    );
    await this.requireAnyPlatformPermissionForUser(user.id, [
      PLATFORM_PERMISSIONS.permissionsView,
      PLATFORM_PERMISSIONS.platformRolesManage,
      PLATFORM_PERMISSIONS.storeRolesView,
      PLATFORM_PERMISSIONS.storeRolesManage,
      PLATFORM_PERMISSIONS.permissionsManage,
    ]);
    return this.accessControl.listPermissions();
  }

  @Get("roles")
  @ApiOperation({ summary: "List global SelfX Platform roles" })
  @ApiOkResponse({ type: [PlatformRoleDto] })
  async listRoles(
    @Req() request: FastifyRequest,
  ): Promise<{ data: PlatformRoleDto[] }> {
    await this.requireAnyPlatformPermission(request, [
      PLATFORM_PERMISSIONS.permissionsView,
      PLATFORM_PERMISSIONS.platformRolesManage,
      PLATFORM_PERMISSIONS.platformUsersManage,
      PLATFORM_PERMISSIONS.permissionsManage,
    ]);
    return this.accessControl.listPlatformRoles();
  }

  @Post("roles")
  @ApiOperation({ summary: "Create a global SelfX Platform role" })
  @ApiCreatedResponse({ type: PlatformRoleDto })
  async createRole(
    @Req() request: FastifyRequest,
    @Body() dto: CreatePlatformRoleDto,
  ): Promise<PlatformRoleDto> {
    const user = await this.requireAnyPlatformPermission(request, [
      PLATFORM_PERMISSIONS.platformRolesManage,
      PLATFORM_PERMISSIONS.permissionsManage,
    ]);
    return this.accessControl.createPlatformRole(user.id, dto);
  }

  @Patch("roles/:roleId")
  @ApiOperation({ summary: "Update a global SelfX Platform role" })
  @ApiOkResponse({ type: PlatformRoleDto })
  async updateRole(
    @Req() request: FastifyRequest,
    @Param("roleId", SelfxUuidParamPipe) roleId: string,
    @Body() dto: UpdatePlatformRoleDto,
  ): Promise<PlatformRoleDto> {
    const user = await this.requireAnyPlatformPermission(request, [
      PLATFORM_PERMISSIONS.platformRolesManage,
      PLATFORM_PERMISSIONS.permissionsManage,
    ]);
    return this.accessControl.updatePlatformRole(user.id, roleId, dto);
  }

  @Put("roles/:roleId/permissions")
  @ApiOperation({ summary: "Replace permissions on a Platform role" })
  @ApiOkResponse({ type: PlatformRoleDto })
  async replaceRolePermissions(
    @Req() request: FastifyRequest,
    @Param("roleId", SelfxUuidParamPipe) roleId: string,
    @Body() dto: ReplacePermissionCodesDto,
  ): Promise<PlatformRoleDto> {
    const user = await this.requireAnyPlatformPermission(request, [
      PLATFORM_PERMISSIONS.platformRolesManage,
      PLATFORM_PERMISSIONS.permissionsManage,
    ]);
    return this.accessControl.replacePlatformRolePermissions(
      user.id,
      roleId,
      dto,
    );
  }

  @Get("users")
  @ApiOperation({ summary: "List SelfX users and Platform role assignments" })
  @ApiOkResponse({ type: [PlatformUserDto] })
  async listUsers(
    @Req() request: FastifyRequest,
  ): Promise<{ data: PlatformUserDto[] }> {
    await this.requireAnyPlatformPermission(request, [
      PLATFORM_PERMISSIONS.permissionsView,
      PLATFORM_PERMISSIONS.platformUsersManage,
      PLATFORM_PERMISSIONS.permissionsManage,
    ]);
    return this.accessControl.listPlatformUsers();
  }

  @Post("users")
  @ApiOperation({ summary: "Add an existing SelfX user to Platform roles" })
  @ApiCreatedResponse({ type: PlatformUserDto })
  async addUser(
    @Req() request: FastifyRequest,
    @Body() dto: AddPlatformUserDto,
  ): Promise<PlatformUserDto> {
    const user = await this.requireAnyPlatformPermission(request, [
      PLATFORM_PERMISSIONS.platformUsersManage,
      PLATFORM_PERMISSIONS.permissionsManage,
    ]);
    return this.accessControl.addPlatformUser(user.id, dto);
  }

  @Put("users/:userId/roles")
  @ApiOperation({ summary: "Replace Platform role assignments for a user" })
  @ApiOkResponse({ type: PlatformUserDto })
  async replaceUserRoles(
    @Req() request: FastifyRequest,
    @Param("userId", SelfxUuidParamPipe) userId: string,
    @Body() dto: AssignPlatformRolesDto,
  ): Promise<PlatformUserDto> {
    const user = await this.requireAnyPlatformPermission(request, [
      PLATFORM_PERMISSIONS.platformUsersManage,
      PLATFORM_PERMISSIONS.permissionsManage,
    ]);
    return this.accessControl.replaceUserPlatformRoles(user.id, userId, dto);
  }

  @Get("stores/:storeId/permission-grants")
  @ApiOperation({ summary: "List a Store permission ceiling" })
  @ApiOkResponse({ type: [StorePermissionGrantDto] })
  async listStorePermissionGrants(
    @Req() request: FastifyRequest,
    @Param("storeId", SelfxUuidParamPipe) storeId: string,
  ): Promise<{ data: StorePermissionGrantDto[] }> {
    await this.requireAnyPlatformPermission(request, [
      PLATFORM_PERMISSIONS.permissionsView,
      PLATFORM_PERMISSIONS.storeRolesView,
      PLATFORM_PERMISSIONS.storeRolesManage,
      PLATFORM_PERMISSIONS.permissionsManage,
    ]);
    return this.accessControl.listStorePermissionGrants(storeId);
  }

  @Put("stores/:storeId/permission-grants")
  @ApiOperation({ summary: "Replace a Store permission ceiling" })
  @ApiOkResponse({ type: [StorePermissionGrantDto] })
  async replaceStorePermissionGrants(
    @Req() request: FastifyRequest,
    @Param("storeId", SelfxUuidParamPipe) storeId: string,
    @Body() dto: ReplacePermissionCodesDto,
  ): Promise<{ data: StorePermissionGrantDto[] }> {
    const user = await this.requireAnyPlatformPermission(request, [
      PLATFORM_PERMISSIONS.storeRolesManage,
      PLATFORM_PERMISSIONS.permissionsManage,
    ]);
    return this.accessControl.replaceStorePermissionGrants(
      user.id,
      storeId,
      dto,
    );
  }

  private async requireAnyPlatformPermission(
    request: FastifyRequest,
    permissions: readonly PlatformPermission[],
  ) {
    const user = await this.auth.requireAccessUser(
      request.headers.authorization,
    );
    await this.requireAnyPlatformPermissionForUser(user.id, permissions);
    return user;
  }

  private async requireAnyPlatformPermissionForUser(
    userId: string,
    permissions: readonly PlatformPermission[],
  ): Promise<void> {
    const fallbackPermission = permissions[0];
    if (!fallbackPermission) {
      throw new Error("At least one Platform permission is required.");
    }
    for (const permission of permissions) {
      if (await this.platformAuthorization.hasPermission(userId, permission)) {
        return;
      }
    }
    await this.platformAuthorization.requirePermission(
      userId,
      fallbackPermission,
    );
  }
}
