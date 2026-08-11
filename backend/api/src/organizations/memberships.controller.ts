import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
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
import { CursorPaginationQueryDto } from "../common/pagination.dto.js";
import { SelfxUuidParamPipe } from "../common/uuid-param.pipe.js";
import {
  CreateMembershipDto,
  UpdateMembershipDto,
} from "./dto/tenant-commands.dto.js";
import {
  MembershipListResponseDto,
  MembershipResponseDto,
} from "./dto/tenant-response.dto.js";
import { TenantManagementService } from "./tenant-management.service.js";

@ApiTags("Memberships")
@ApiBearerAuth()
@Controller("api/v1/organizations/:organizationId/memberships")
export class MembershipsController {
  constructor(
    private readonly auth: AuthService,
    private readonly tenants: TenantManagementService,
  ) {}

  @Get()
  @ApiOperation({ summary: "List memberships visible to the current user" })
  @ApiOkResponse({ type: MembershipListResponseDto })
  @ApiResponse({ status: 401, type: ApiErrorResponseDto })
  @ApiResponse({ status: 403, type: ApiErrorResponseDto })
  async list(
    @Req() request: FastifyRequest,
    @Param("organizationId", SelfxUuidParamPipe) organizationId: string,
    @Query() query: CursorPaginationQueryDto,
  ): Promise<MembershipListResponseDto> {
    const user = await this.auth.requireAccessUser(
      request.headers.authorization,
    );
    return this.tenants.listMemberships(user.id, organizationId, query);
  }

  @Post()
  @ApiOperation({ summary: "Add an existing user to an active organization" })
  @ApiCreatedResponse({ type: MembershipResponseDto })
  @ApiResponse({ status: 401, type: ApiErrorResponseDto })
  @ApiResponse({ status: 403, type: ApiErrorResponseDto })
  async create(
    @Req() request: FastifyRequest,
    @Param("organizationId", SelfxUuidParamPipe) organizationId: string,
    @Body() dto: CreateMembershipDto,
  ): Promise<MembershipResponseDto> {
    const user = await this.auth.requireAccessUser(
      request.headers.authorization,
    );
    return this.tenants.createMembership(user.id, organizationId, dto);
  }

  @Patch(":membershipId")
  @ApiOperation({ summary: "Update permitted membership role or store scope" })
  @ApiOkResponse({ type: MembershipResponseDto })
  @ApiResponse({ status: 401, type: ApiErrorResponseDto })
  @ApiResponse({ status: 403, type: ApiErrorResponseDto })
  @ApiResponse({ status: 404, type: ApiErrorResponseDto })
  async update(
    @Req() request: FastifyRequest,
    @Param("organizationId", SelfxUuidParamPipe) organizationId: string,
    @Param("membershipId", SelfxUuidParamPipe) membershipId: string,
    @Body() dto: UpdateMembershipDto,
  ): Promise<MembershipResponseDto> {
    const user = await this.auth.requireAccessUser(
      request.headers.authorization,
    );
    return this.tenants.updateMembership(
      user.id,
      organizationId,
      membershipId,
      dto,
    );
  }

  @Post(":membershipId/suspend")
  @ApiOperation({ summary: "Suspend a permitted membership" })
  @ApiOkResponse({ type: MembershipResponseDto })
  @ApiResponse({ status: 401, type: ApiErrorResponseDto })
  @ApiResponse({ status: 403, type: ApiErrorResponseDto })
  @ApiResponse({ status: 404, type: ApiErrorResponseDto })
  async suspend(
    @Req() request: FastifyRequest,
    @Param("organizationId", SelfxUuidParamPipe) organizationId: string,
    @Param("membershipId", SelfxUuidParamPipe) membershipId: string,
  ): Promise<MembershipResponseDto> {
    const user = await this.auth.requireAccessUser(
      request.headers.authorization,
    );
    return this.tenants.suspendMembership(
      user.id,
      organizationId,
      membershipId,
    );
  }

  @Post(":membershipId/reactivate")
  @ApiOperation({ summary: "Reactivate a permitted membership" })
  @ApiOkResponse({ type: MembershipResponseDto })
  @ApiResponse({ status: 401, type: ApiErrorResponseDto })
  @ApiResponse({ status: 403, type: ApiErrorResponseDto })
  @ApiResponse({ status: 404, type: ApiErrorResponseDto })
  async reactivate(
    @Req() request: FastifyRequest,
    @Param("organizationId", SelfxUuidParamPipe) organizationId: string,
    @Param("membershipId", SelfxUuidParamPipe) membershipId: string,
  ): Promise<MembershipResponseDto> {
    const user = await this.auth.requireAccessUser(
      request.headers.authorization,
    );
    return this.tenants.reactivateMembership(
      user.id,
      organizationId,
      membershipId,
    );
  }
}
