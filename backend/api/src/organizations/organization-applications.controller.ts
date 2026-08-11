import { Body, Controller, Get, Param, Post, Query, Req } from "@nestjs/common";
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
import { CreateOrganizationApplicationDto } from "./dto/create-organization-application.dto.js";
import {
  OrganizationApplicationListResponseDto,
  OrganizationApplicationResponseDto,
} from "./dto/organization-application-response.dto.js";
import { OrganizationApplicationsService } from "./organization-applications.service.js";

@ApiTags("Organization Applications")
@ApiBearerAuth()
@Controller("api/v1/organization-applications")
export class OrganizationApplicationsController {
  constructor(
    private readonly auth: AuthService,
    private readonly applications: OrganizationApplicationsService,
  ) {}

  @Post()
  @ApiOperation({
    summary:
      "Create a draft organization application with a pending organization shell",
  })
  @ApiCreatedResponse({ type: OrganizationApplicationResponseDto })
  @ApiResponse({ status: 400, type: ApiErrorResponseDto })
  @ApiResponse({ status: 401, type: ApiErrorResponseDto })
  async create(
    @Req() request: FastifyRequest,
    @Body() dto: CreateOrganizationApplicationDto,
  ): Promise<OrganizationApplicationResponseDto> {
    const user = await this.auth.requireAccessUser(
      request.headers.authorization,
    );
    return this.applications.createDraft(user.id, dto);
  }

  @Get()
  @ApiOperation({ summary: "List current user's organization applications" })
  @ApiOkResponse({ type: OrganizationApplicationListResponseDto })
  @ApiResponse({ status: 401, type: ApiErrorResponseDto })
  async list(
    @Req() request: FastifyRequest,
    @Query() query: CursorPaginationQueryDto,
  ): Promise<OrganizationApplicationListResponseDto> {
    const user = await this.auth.requireAccessUser(
      request.headers.authorization,
    );
    return this.applications.listApplicantApplications(user.id, query);
  }

  @Get(":applicationId")
  @ApiOperation({ summary: "Get one current-user organization application" })
  @ApiOkResponse({ type: OrganizationApplicationResponseDto })
  @ApiResponse({ status: 401, type: ApiErrorResponseDto })
  @ApiResponse({ status: 404, type: ApiErrorResponseDto })
  async get(
    @Req() request: FastifyRequest,
    @Param("applicationId", SelfxUuidParamPipe) applicationId: string,
  ): Promise<OrganizationApplicationResponseDto> {
    const user = await this.auth.requireAccessUser(
      request.headers.authorization,
    );
    return this.applications.getApplicantApplication(user.id, applicationId);
  }

  @Post(":applicationId/submit")
  @ApiOperation({ summary: "Submit or resubmit an organization application" })
  @ApiOkResponse({ type: OrganizationApplicationResponseDto })
  @ApiResponse({ status: 401, type: ApiErrorResponseDto })
  @ApiResponse({ status: 404, type: ApiErrorResponseDto })
  @ApiResponse({ status: 409, type: ApiErrorResponseDto })
  async submit(
    @Req() request: FastifyRequest,
    @Param("applicationId", SelfxUuidParamPipe) applicationId: string,
  ): Promise<OrganizationApplicationResponseDto> {
    const user = await this.auth.requireAccessUser(
      request.headers.authorization,
    );
    return this.applications.submitApplicantApplication(user.id, applicationId);
  }
}
