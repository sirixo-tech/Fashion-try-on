import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  Req,
} from "@nestjs/common";
import {
  ApiBearerAuth,
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
import { UpdateOrganizationDto } from "./dto/tenant-commands.dto.js";
import {
  TenantOrganizationListResponseDto,
  TenantOrganizationResponseDto,
} from "./dto/tenant-response.dto.js";
import { TenantManagementService } from "./tenant-management.service.js";

@ApiTags("Organizations")
@ApiBearerAuth()
@Controller("api/v1/organizations")
export class OrganizationsController {
  constructor(
    private readonly auth: AuthService,
    private readonly tenants: TenantManagementService,
  ) {}

  @Get()
  @ApiOperation({ summary: "List active organizations for the current user" })
  @ApiOkResponse({ type: TenantOrganizationListResponseDto })
  @ApiResponse({ status: 401, type: ApiErrorResponseDto })
  async list(
    @Req() request: FastifyRequest,
    @Query() query: CursorPaginationQueryDto,
  ): Promise<TenantOrganizationListResponseDto> {
    const user = await this.auth.requireAccessUser(
      request.headers.authorization,
    );
    return this.tenants.listOrganizations(user.id, query);
  }

  @Get(":organizationId")
  @ApiOperation({ summary: "Get one active organization" })
  @ApiOkResponse({ type: TenantOrganizationResponseDto })
  @ApiResponse({ status: 401, type: ApiErrorResponseDto })
  @ApiResponse({ status: 403, type: ApiErrorResponseDto })
  async get(
    @Req() request: FastifyRequest,
    @Param("organizationId", SelfxUuidParamPipe) organizationId: string,
  ): Promise<TenantOrganizationResponseDto> {
    const user = await this.auth.requireAccessUser(
      request.headers.authorization,
    );
    return this.tenants.getOrganization(user.id, organizationId);
  }

  @Patch(":organizationId")
  @ApiOperation({ summary: "Update one active organization" })
  @ApiOkResponse({ type: TenantOrganizationResponseDto })
  @ApiResponse({ status: 401, type: ApiErrorResponseDto })
  @ApiResponse({ status: 403, type: ApiErrorResponseDto })
  async update(
    @Req() request: FastifyRequest,
    @Param("organizationId", SelfxUuidParamPipe) organizationId: string,
    @Body() dto: UpdateOrganizationDto,
  ): Promise<TenantOrganizationResponseDto> {
    const user = await this.auth.requireAccessUser(
      request.headers.authorization,
    );
    return this.tenants.updateOrganization(user.id, organizationId, dto);
  }
}
