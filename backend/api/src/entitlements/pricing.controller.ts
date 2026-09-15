import { Controller, Get, Req } from "@nestjs/common";
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
import { PricingPlanListResponseDto } from "./dto/pricing-plan.dto.js";
import { PlanFeatureListResponseDto } from "./dto/plan-feature.dto.js";
import { PricingFeaturesService } from "./pricing-features.service.js";
import { PricingControlService } from "./pricing-control.service.js";

@ApiTags("Pricing")
@ApiBearerAuth()
@Controller("api/v1/pricing/plans")
export class PricingController {
  constructor(
    private readonly auth: AuthService,
    private readonly pricing: PricingControlService,
    private readonly pricingFeatures: PricingFeaturesService,
  ) {}

  @Get("available")
  @ApiOperation({ summary: "List active pricing plans available to Stores" })
  @ApiOkResponse({ type: PricingPlanListResponseDto })
  @ApiResponse({ status: 401, type: ApiErrorResponseDto })
  async listAvailable(
    @Req() request: FastifyRequest,
  ): Promise<PricingPlanListResponseDto> {
    await this.auth.requireAccessUser(request.headers.authorization);
    return { data: await this.pricing.listAvailablePlans() };
  }

  @Get("features")
  @ApiOperation({ summary: "List pricing feature labels" })
  @ApiOkResponse({ type: PlanFeatureListResponseDto })
  @ApiResponse({ status: 401, type: ApiErrorResponseDto })
  async listFeatures(
    @Req() request: FastifyRequest,
  ): Promise<PlanFeatureListResponseDto> {
    await this.auth.requireAccessUser(request.headers.authorization);
    return { data: await this.pricingFeatures.listFeatures() };
  }
}
