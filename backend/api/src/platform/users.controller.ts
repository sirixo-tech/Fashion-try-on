import {
  Body,
  Delete,
  Controller,
  Get,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { type FastifyRequest } from "fastify";
import { AuthService } from "../auth/auth.service.js";
import { ApiErrorException } from "../common/api-error.exception.js";
import { SelfxUuidParamPipe } from "../common/uuid-param.pipe.js";
import { PlatformAuthorizationService } from "./platform-authorization.service.js";
import { PLATFORM_PERMISSIONS } from "./platform-permissions.js";
import {
  AssignFirstOwnerDto,
  StoreAdminEmailDto,
  CreateStoreAdminDto,
  DeleteUserDto,
  UpdateUserDto,
  UsersQueryDto,
} from "./dto/users.dto.js";
import { UsersService } from "./users.service.js";
import { UserDeletionService } from "./user-deletion.service.js";

@ApiTags("Users")
@ApiBearerAuth()
@Controller("api/v1/admin/users")
export class UsersController {
  constructor(
    private readonly auth: AuthService,
    private readonly authorization: PlatformAuthorizationService,
    private readonly users: UsersService,
    private readonly deletion: UserDeletionService,
  ) {}
  private async reader(request: FastifyRequest) {
    const user = await this.auth.requireAccessUser(
      request.headers.authorization,
    );
    const codes = [
      PLATFORM_PERMISSIONS.permissionsView,
      PLATFORM_PERMISSIONS.platformUsersManage,
      PLATFORM_PERMISSIONS.permissionsManage,
    ];
    for (const code of codes)
      if (await this.authorization.hasPermission(user.id, code)) return user;
    throw new ApiErrorException(
      HttpStatus.FORBIDDEN,
      "PLATFORM_PERMISSION_DENIED",
      "You cannot view Users.",
    );
  }
  private async editor(request: FastifyRequest) {
    const user = await this.auth.requireAccessUser(
      request.headers.authorization,
    );
    if (!(await this.authorization.isSuperadmin(user.id)))
      throw new ApiErrorException(
        HttpStatus.FORBIDDEN,
        "PLATFORM_PERMISSION_DENIED",
        "Only SelfX Superadmins can edit accounts.",
      );
    return user;
  }
  @Get() async list(
    @Req() request: FastifyRequest,
    @Query() query: UsersQueryDto,
  ) {
    await this.reader(request);
    return this.users.list(query);
  }
  @Get("stores") async stores(
    @Req() request: FastifyRequest,
    @Query() query: UsersQueryDto,
  ) {
    await this.reader(request);
    return this.users.stores(query);
  }
  @Get("deletion-history") async history(
    @Req() request: FastifyRequest,
    @Query() query: UsersQueryDto,
  ) {
    await this.reader(request);
    return this.users.deletionHistory(query);
  }
  @Post("store-admin") async createStoreAdmin(
    @Req() request: FastifyRequest,
    @Body() input: CreateStoreAdminDto,
  ) {
    const actor = await this.editor(request);
    return this.users.createStoreAdmin(actor.id, input);
  }
  @Get(":userId") async get(
    @Req() request: FastifyRequest,
    @Param("userId", SelfxUuidParamPipe) id: string,
  ) {
    await this.reader(request);
    return this.users.get(id);
  }
  @Patch(":userId") async update(
    @Req() request: FastifyRequest,
    @Param("userId", SelfxUuidParamPipe) id: string,
    @Body() input: UpdateUserDto,
  ) {
    const actor = await this.editor(request);
    return this.users.update(actor.id, id, input);
  }
  @Delete(":userId") async deleteUser(
    @Req() request: FastifyRequest,
    @Param("userId", SelfxUuidParamPipe) id: string,
    @Body() input: DeleteUserDto,
  ) {
    const actor = await this.editor(request);
    return this.deletion.deleteAccount(actor.id, id, input);
  }
  @Post(":userId/first-store-owner") async assignFirstOwner(
    @Req() request: FastifyRequest,
    @Param("userId", SelfxUuidParamPipe) id: string,
    @Body() input: AssignFirstOwnerDto,
  ) {
    const actor = await this.editor(request);
    return this.users.assignFirstOwner(actor.id, id, input);
  }
  @Post(":userId/store-admin") async assignStoreAdmin(
    @Req() request: FastifyRequest,
    @Param("userId", SelfxUuidParamPipe) id: string,
    @Body() input: AssignFirstOwnerDto,
  ) {
    const actor = await this.editor(request);
    return this.users.assignStoreAdmin(actor.id, id, input);
  }
  @Patch(":userId/store-admin-email") async updateStoreAdminEmail(
    @Req() request: FastifyRequest,
    @Param("userId", SelfxUuidParamPipe) id: string,
    @Body() input: StoreAdminEmailDto,
  ) {
    const actor = await this.editor(request);
    return this.users.updateStoreAdminEmail(actor.id, id, input);
  }
}
