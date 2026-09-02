import { Controller, Get, Query, Req } from "@nestjs/common";
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
import { PLATFORM_PERMISSIONS } from "../platform/platform-permissions.js";
import { PlatformAuthorizationService } from "../platform/platform-authorization.service.js";
import { STORE_PERMISSION_CODES } from "../rbac/store-permissions.js";
import { StoreRbacService } from "../rbac/store-rbac.service.js";
import {
  UsageSummaryQueryDto,
  UsageSummaryResponseDto,
} from "./dto/usage-summary.dto.js";
import { UsageSummaryService } from "./usage-summary.service.js";

@ApiTags("Usage")
@ApiBearerAuth()
@Controller("api/v1/admin/usage")
export class UsageSummaryController {
  constructor(
    private readonly auth: AuthService,
    private readonly platformAuthorization: PlatformAuthorizationService,
    private readonly rbac: StoreRbacService,
    private readonly usage: UsageSummaryService,
  ) {}

  @Get("summary")
  @ApiOperation({ summary: "Read privacy-safe usage and analytics rollups" })
  @ApiOkResponse({ type: UsageSummaryResponseDto })
  @ApiResponse({ status: 401, type: ApiErrorResponseDto })
  @ApiResponse({ status: 403, type: ApiErrorResponseDto })
  async summary(
    @Req() request: FastifyRequest,
    @Query() query: UsageSummaryQueryDto,
  ): Promise<UsageSummaryResponseDto> {
    const user = await this.auth.requireAccessUser(
      request.headers.authorization,
    );
    if (
      await this.platformAuthorization.hasPermission(
        user.id,
        PLATFORM_PERMISSIONS.usageView,
      )
    ) {
      return this.usage.summary(query);
    }
    if (query.storeId) {
      await this.rbac.requireStorePermission(
        user.id,
        query.storeId,
        STORE_PERMISSION_CODES.analyticsView,
      );
      return this.usage.summary(query);
    }
    await this.platformAuthorization.requirePermission(
      user.id,
      PLATFORM_PERMISSIONS.usageView,
    );
    return this.usage.summary(query);
  }
}
