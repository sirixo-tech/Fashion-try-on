import { Controller, Get, Header, Query, Req } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import type { FastifyRequest } from "fastify";
import { AuthService } from "../auth/auth.service.js";
import { PlatformAuthorizationService } from "../platform/platform-authorization.service.js";
import { PLATFORM_PERMISSIONS } from "../platform/platform-permissions.js";
import {
  CustomerMetricsQuery,
  CustomerMetricsService,
} from "./customer-metrics.service.js";

@ApiTags("Mobile customer analytics")
@ApiBearerAuth()
@Controller("api/v1/admin/mobile-dashboard")
export class CustomerMetricsController {
  constructor(
    private readonly auth: AuthService,
    private readonly platform: PlatformAuthorizationService,
    private readonly metrics: CustomerMetricsService,
  ) {}

  @Get("summary")
  @Header("Cache-Control", "no-store")
  async summary(
    @Req() request: FastifyRequest,
    @Query() query: CustomerMetricsQuery,
  ) {
    const user = await this.auth.requireAccessUser(
      request.headers.authorization,
    );
    await this.platform.requirePermission(
      user.id,
      PLATFORM_PERMISSIONS.usageView,
    );
    return this.metrics.summary(query);
  }
}
