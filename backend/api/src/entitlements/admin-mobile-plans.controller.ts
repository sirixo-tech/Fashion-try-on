import { Body, Controller, Get, Param, Patch, Post, Req } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import type { FastifyRequest } from "fastify";
import { AuthService } from "../auth/auth.service.js";
import { SelfxUuidParamPipe } from "../common/uuid-param.pipe.js";
import { PlatformAuthorizationService } from "../platform/platform-authorization.service.js";
import {
  PLATFORM_PERMISSIONS,
  type PlatformPermission,
} from "../platform/platform-permissions.js";
import {
  CreateMobilePlanDto,
  MobilePlanListResponseDto,
  MobilePlanResponseDto,
  UpdateMobilePlanDto,
} from "./dto/mobile-plan.dto.js";
import { MobilePlansService } from "./mobile-plans.service.js";

@ApiTags("Platform Mobile Plans")
@ApiBearerAuth()
@Controller("api/v1/admin/mobile-plans")
export class AdminMobilePlansController {
  constructor(
    private readonly auth: AuthService,
    private readonly authorization: PlatformAuthorizationService,
    private readonly plans: MobilePlansService,
  ) {}

  @Get()
  async list(
    @Req() request: FastifyRequest,
  ): Promise<MobilePlanListResponseDto> {
    await this.requirePermission(request, PLATFORM_PERMISSIONS.pricingView);
    return { data: await this.plans.listAll() };
  }

  @Post()
  async create(
    @Req() request: FastifyRequest,
    @Body() input: CreateMobilePlanDto,
  ): Promise<MobilePlanResponseDto> {
    const actor = await this.requirePermission(
      request,
      PLATFORM_PERMISSIONS.pricingManage,
    );
    return this.plans.create(input, actor.id);
  }

  @Patch(":planId")
  async update(
    @Req() request: FastifyRequest,
    @Param("planId", SelfxUuidParamPipe) planId: string,
    @Body() input: UpdateMobilePlanDto,
  ): Promise<MobilePlanResponseDto> {
    const actor = await this.requirePermission(
      request,
      PLATFORM_PERMISSIONS.pricingManage,
    );
    return this.plans.update(planId, input, actor.id);
  }

  private async requirePermission(
    request: FastifyRequest,
    permission: PlatformPermission,
  ) {
    const actor = await this.auth.requireAccessUser(
      request.headers.authorization,
    );
    await this.authorization.requirePermission(actor.id, permission);
    return actor;
  }
}
