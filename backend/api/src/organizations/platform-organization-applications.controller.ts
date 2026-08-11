import { Body, Controller, Get, Param, Post, Query, Req } from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import { OrganizationStatus } from "@prisma/client";
import { type FastifyRequest } from "fastify";

import { AuthService } from "../auth/auth.service.js";
import { ApiErrorResponseDto } from "../auth/dto/auth-response.dto.js";
import { CursorPaginationQueryDto } from "../common/pagination.dto.js";
import { SelfxUuidParamPipe } from "../common/uuid-param.pipe.js";
import {
  CreateActivationRequirementDto,
  RequirementDecisionDto,
} from "./dto/activation-requirement.dto.js";
import {
  OrganizationApplicationListResponseDto,
  OrganizationApplicationResponseDto,
} from "./dto/organization-application-response.dto.js";
import { ReviewNotesDto } from "./dto/platform-transition.dto.js";
import { OrganizationApplicationsService } from "./organization-applications.service.js";

class OrganizationStatusResponseDto {
  id!: string;
  status!: OrganizationStatus;
}

@ApiTags("Platform Organization Applications")
@ApiBearerAuth()
@Controller("api/v1/platform")
export class PlatformOrganizationApplicationsController {
  constructor(
    private readonly auth: AuthService,
    private readonly applications: OrganizationApplicationsService,
  ) {}

  @Get("organization-applications")
  @ApiOperation({ summary: "Platform list of organization applications" })
  @ApiOkResponse({ type: OrganizationApplicationListResponseDto })
  @ApiResponse({ status: 401, type: ApiErrorResponseDto })
  @ApiResponse({ status: 403, type: ApiErrorResponseDto })
  async listApplications(
    @Req() request: FastifyRequest,
    @Query() query: CursorPaginationQueryDto,
  ): Promise<OrganizationApplicationListResponseDto> {
    const user = await this.auth.requireAccessUser(
      request.headers.authorization,
    );
    return this.applications.listPlatformApplications(user.id, query);
  }

  @Get("organization-applications/:applicationId")
  @ApiOperation({ summary: "Platform get organization application" })
  @ApiOkResponse({ type: OrganizationApplicationResponseDto })
  @ApiResponse({ status: 401, type: ApiErrorResponseDto })
  @ApiResponse({ status: 403, type: ApiErrorResponseDto })
  @ApiResponse({ status: 404, type: ApiErrorResponseDto })
  async getApplication(
    @Req() request: FastifyRequest,
    @Param("applicationId", SelfxUuidParamPipe) applicationId: string,
  ): Promise<OrganizationApplicationResponseDto> {
    const user = await this.auth.requireAccessUser(
      request.headers.authorization,
    );
    return this.applications.getPlatformApplication(user.id, applicationId);
  }

  @Post("organization-applications/:applicationId/start-review")
  @ApiOperation({ summary: "Start organization application review" })
  @ApiOkResponse({ type: OrganizationApplicationResponseDto })
  @ApiResponse({ status: 403, type: ApiErrorResponseDto })
  @ApiResponse({ status: 409, type: ApiErrorResponseDto })
  async startReview(
    @Req() request: FastifyRequest,
    @Param("applicationId", SelfxUuidParamPipe) applicationId: string,
  ): Promise<OrganizationApplicationResponseDto> {
    const user = await this.auth.requireAccessUser(
      request.headers.authorization,
    );
    return this.applications.startReview(user.id, applicationId);
  }

  @Post("organization-applications/:applicationId/request-information")
  @ApiOperation({ summary: "Request more information for an application" })
  @ApiOkResponse({ type: OrganizationApplicationResponseDto })
  @ApiResponse({ status: 403, type: ApiErrorResponseDto })
  @ApiResponse({ status: 409, type: ApiErrorResponseDto })
  async requestInformation(
    @Req() request: FastifyRequest,
    @Param("applicationId", SelfxUuidParamPipe) applicationId: string,
    @Body() dto: ReviewNotesDto,
  ): Promise<OrganizationApplicationResponseDto> {
    const user = await this.auth.requireAccessUser(
      request.headers.authorization,
    );
    return this.applications.requestInformation(
      user.id,
      applicationId,
      dto.reviewNotes,
    );
  }

  @Post("organization-applications/:applicationId/approve")
  @ApiOperation({ summary: "Approve an organization application" })
  @ApiOkResponse({ type: OrganizationApplicationResponseDto })
  @ApiResponse({ status: 403, type: ApiErrorResponseDto })
  @ApiResponse({ status: 409, type: ApiErrorResponseDto })
  async approve(
    @Req() request: FastifyRequest,
    @Param("applicationId", SelfxUuidParamPipe) applicationId: string,
    @Body() dto: ReviewNotesDto,
  ): Promise<OrganizationApplicationResponseDto> {
    const user = await this.auth.requireAccessUser(
      request.headers.authorization,
    );
    return this.applications.approve(user.id, applicationId, dto.reviewNotes);
  }

  @Post("organization-applications/:applicationId/reject")
  @ApiOperation({ summary: "Reject an organization application" })
  @ApiOkResponse({ type: OrganizationApplicationResponseDto })
  @ApiResponse({ status: 403, type: ApiErrorResponseDto })
  @ApiResponse({ status: 409, type: ApiErrorResponseDto })
  async reject(
    @Req() request: FastifyRequest,
    @Param("applicationId", SelfxUuidParamPipe) applicationId: string,
    @Body() dto: ReviewNotesDto,
  ): Promise<OrganizationApplicationResponseDto> {
    const user = await this.auth.requireAccessUser(
      request.headers.authorization,
    );
    return this.applications.reject(user.id, applicationId, dto.reviewNotes);
  }

  @Post("organization-applications/:applicationId/activation-requirements")
  @ApiOperation({ summary: "Create a generic activation requirement" })
  @ApiCreatedResponse({ type: OrganizationApplicationResponseDto })
  @ApiResponse({ status: 403, type: ApiErrorResponseDto })
  @ApiResponse({ status: 409, type: ApiErrorResponseDto })
  async createRequirement(
    @Req() request: FastifyRequest,
    @Param("applicationId", SelfxUuidParamPipe) applicationId: string,
    @Body() dto: CreateActivationRequirementDto,
  ): Promise<OrganizationApplicationResponseDto> {
    const user = await this.auth.requireAccessUser(
      request.headers.authorization,
    );
    return this.applications.createRequirement(user.id, applicationId, dto);
  }

  @Post(
    "organization-applications/:applicationId/activation-requirements/:requirementId/satisfy",
  )
  @ApiOperation({ summary: "Manually satisfy an activation requirement" })
  @ApiOkResponse({ type: OrganizationApplicationResponseDto })
  @ApiResponse({ status: 403, type: ApiErrorResponseDto })
  @ApiResponse({ status: 404, type: ApiErrorResponseDto })
  async satisfyRequirement(
    @Req() request: FastifyRequest,
    @Param("applicationId", SelfxUuidParamPipe) applicationId: string,
    @Param("requirementId", SelfxUuidParamPipe) requirementId: string,
    @Body() dto: RequirementDecisionDto,
  ): Promise<OrganizationApplicationResponseDto> {
    const user = await this.auth.requireAccessUser(
      request.headers.authorization,
    );
    return this.applications.satisfyRequirement(
      user.id,
      applicationId,
      requirementId,
      dto.metadata,
    );
  }

  @Post(
    "organization-applications/:applicationId/activation-requirements/:requirementId/waive",
  )
  @ApiOperation({ summary: "Manually waive an activation requirement" })
  @ApiOkResponse({ type: OrganizationApplicationResponseDto })
  @ApiResponse({ status: 403, type: ApiErrorResponseDto })
  @ApiResponse({ status: 404, type: ApiErrorResponseDto })
  async waiveRequirement(
    @Req() request: FastifyRequest,
    @Param("applicationId", SelfxUuidParamPipe) applicationId: string,
    @Param("requirementId", SelfxUuidParamPipe) requirementId: string,
    @Body() dto: RequirementDecisionDto,
  ): Promise<OrganizationApplicationResponseDto> {
    const user = await this.auth.requireAccessUser(
      request.headers.authorization,
    );
    return this.applications.waiveRequirement(
      user.id,
      applicationId,
      requirementId,
      dto.metadata,
    );
  }

  @Post("organizations/:organizationId/activate")
  @ApiOperation({ summary: "Explicitly activate an approved organization" })
  @ApiOkResponse({ type: OrganizationApplicationResponseDto })
  @ApiResponse({ status: 403, type: ApiErrorResponseDto })
  @ApiResponse({ status: 409, type: ApiErrorResponseDto })
  async activateOrganization(
    @Req() request: FastifyRequest,
    @Param("organizationId", SelfxUuidParamPipe) organizationId: string,
  ): Promise<OrganizationApplicationResponseDto> {
    const user = await this.auth.requireAccessUser(
      request.headers.authorization,
    );
    return this.applications.activateOrganization(user.id, organizationId);
  }

  @Post("organizations/:organizationId/suspend")
  @ApiOperation({ summary: "Suspend an organization as a platform action" })
  @ApiOkResponse({ type: OrganizationStatusResponseDto })
  @ApiResponse({ status: 403, type: ApiErrorResponseDto })
  async suspendOrganization(
    @Req() request: FastifyRequest,
    @Param("organizationId", SelfxUuidParamPipe) organizationId: string,
  ): Promise<OrganizationStatusResponseDto> {
    const user = await this.auth.requireAccessUser(
      request.headers.authorization,
    );
    return this.applications.suspendOrganization(user.id, organizationId);
  }
}
