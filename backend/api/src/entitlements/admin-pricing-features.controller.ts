import { Body, Controller, Get, Param, Patch, Req } from "@nestjs/common";
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
import {
  PLATFORM_PERMISSIONS,
  type PlatformPermission,
} from "../platform/platform-permissions.js";
import { PlatformAuthorizationService } from "../platform/platform-authorization.service.js";
import {
  PlanFeatureListResponseDto,
  PlanFeatureResponseDto,
  UpdatePlanFeatureDto,
} from "./dto/plan-feature.dto.js";
import { PricingFeaturesService } from "./pricing-features.service.js";

@ApiTags("Platform Pricing")
@ApiBearerAuth()
@Controller("api/v1/admin/pricing/features")
export class AdminPricingFeaturesController {
  constructor(
    private readonly auth: AuthService,
    private readonly platformAuthorization: PlatformAuthorizationService,
    private readonly pricingFeatures: PricingFeaturesService,
  ) {}

  @Get()
  @ApiOperation({ summary: "List SelfX plan features" })
  @ApiOkResponse({ type: PlanFeatureListResponseDto })
  @ApiResponse({ status: 401, type: ApiErrorResponseDto })
  @ApiResponse({ status: 403, type: ApiErrorResponseDto })
  async list(
    @Req() request: FastifyRequest,
  ): Promise<PlanFeatureListResponseDto> {
    await this.requirePermission(request, PLATFORM_PERMISSIONS.pricingView);
    return { data: await this.pricingFeatures.listFeatures() };
  }

  @Patch(":featureKey")
  @ApiOperation({ summary: "Update a SelfX plan feature label" })
  @ApiOkResponse({ type: PlanFeatureResponseDto })
  @ApiResponse({ status: 400, type: ApiErrorResponseDto })
  @ApiResponse({ status: 401, type: ApiErrorResponseDto })
  @ApiResponse({ status: 403, type: ApiErrorResponseDto })
  @ApiResponse({ status: 404, type: ApiErrorResponseDto })
  async update(
    @Req() request: FastifyRequest,
    @Param("featureKey") featureKey: string,
    @Body() dto: UpdatePlanFeatureDto,
  ): Promise<PlanFeatureResponseDto> {
    await this.requirePermission(request, PLATFORM_PERMISSIONS.pricingManage);
    return this.pricingFeatures.updateFeature(featureKey, dto);
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
