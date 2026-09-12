import { Body, Controller, Get, Param, Patch, Post, Req } from "@nestjs/common";
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
  CreatePricingPlanDto,
  PricingPlanListResponseDto,
  PricingPlanResponseDto,
  UpdatePricingPlanDto,
} from "./dto/pricing-plan.dto.js";
import { PricingControlService } from "./pricing-control.service.js";

@ApiTags("Platform Pricing")
@ApiBearerAuth()
@Controller("api/v1/admin/pricing/plans")
export class AdminPricingController {
  constructor(
    private readonly auth: AuthService,
    private readonly platformAuthorization: PlatformAuthorizationService,
    private readonly pricing: PricingControlService,
  ) {}

  @Get()
  @ApiOperation({ summary: "List SelfX pricing plans" })
  @ApiOkResponse({ type: PricingPlanListResponseDto })
  @ApiResponse({ status: 401, type: ApiErrorResponseDto })
  @ApiResponse({ status: 403, type: ApiErrorResponseDto })
  async list(@Req() request: FastifyRequest): Promise<PricingPlanListResponseDto> {
    await this.requirePermission(request, PLATFORM_PERMISSIONS.pricingView);
    return { data: await this.pricing.listPlans() };
  }

  @Post()
  @ApiOperation({ summary: "Create a SelfX pricing plan" })
  @ApiCreatedResponse({ type: PricingPlanResponseDto })
  @ApiResponse({ status: 400, type: ApiErrorResponseDto })
  @ApiResponse({ status: 401, type: ApiErrorResponseDto })
  @ApiResponse({ status: 403, type: ApiErrorResponseDto })
  @ApiResponse({ status: 409, type: ApiErrorResponseDto })
  async create(
    @Req() request: FastifyRequest,
    @Body() dto: CreatePricingPlanDto,
  ): Promise<PricingPlanResponseDto> {
    await this.requirePermission(request, PLATFORM_PERMISSIONS.pricingManage);
    return this.pricing.createPlan(dto);
  }

  @Patch(":planId")
  @ApiOperation({ summary: "Update a SelfX pricing plan" })
  @ApiOkResponse({ type: PricingPlanResponseDto })
  @ApiResponse({ status: 400, type: ApiErrorResponseDto })
  @ApiResponse({ status: 401, type: ApiErrorResponseDto })
  @ApiResponse({ status: 403, type: ApiErrorResponseDto })
  @ApiResponse({ status: 404, type: ApiErrorResponseDto })
  async update(
    @Req() request: FastifyRequest,
    @Param("planId", SelfxUuidParamPipe) planId: string,
    @Body() dto: UpdatePricingPlanDto,
  ): Promise<PricingPlanResponseDto> {
    await this.requirePermission(request, PLATFORM_PERMISSIONS.pricingManage);
    return this.pricing.updatePlan(planId, dto);
  }

  private async requirePermission(
    request: FastifyRequest,
    permission: PlatformPermission,
  ): Promise<void> {
    const user = await this.auth.requireAccessUser(
      request.headers.authorization,
    );
    await this.platformAuthorization.requirePermission(user.id, permission);
  }
}
