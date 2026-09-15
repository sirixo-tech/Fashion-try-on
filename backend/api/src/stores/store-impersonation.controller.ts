import { Controller, Get, Param, Post, Query, Req } from "@nestjs/common";
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
import { SelfxUuidParamPipe } from "../common/uuid-param.pipe.js";
import { PlatformAuthorizationService } from "../platform/platform-authorization.service.js";
import { PLATFORM_PERMISSIONS } from "../platform/platform-permissions.js";
import {
  CurrentStoreImpersonationQueryDto,
  CurrentStoreImpersonationSessionResponseDto,
  StoreImpersonationSessionResponseDto,
} from "./dto/store-impersonation.dto.js";
import { StoreImpersonationService } from "./store-impersonation.service.js";

@ApiTags("Store Impersonation")
@ApiBearerAuth()
@Controller("api/v1/admin")
export class StoreImpersonationController {
  constructor(
    private readonly auth: AuthService,
    private readonly platformAuthorization: PlatformAuthorizationService,
    private readonly impersonation: StoreImpersonationService,
  ) {}

  @Post("stores/:storeId/impersonation/start")
  @ApiOperation({ summary: "Start a short-lived internal Store impersonation session" })
  @ApiOkResponse({ type: StoreImpersonationSessionResponseDto })
  @ApiResponse({ status: 401, type: ApiErrorResponseDto })
  @ApiResponse({ status: 403, type: ApiErrorResponseDto })
  async start(
    @Req() request: FastifyRequest,
    @Param("storeId", SelfxUuidParamPipe) storeId: string,
  ): Promise<StoreImpersonationSessionResponseDto> {
    const user = await this.requireImpersonationPermission(request);
    return this.impersonation.startSession(user.id, storeId);
  }

  @Get("impersonation/current")
  @ApiOperation({ summary: "Read the current internal Store impersonation session" })
  @ApiOkResponse({ type: CurrentStoreImpersonationSessionResponseDto })
  @ApiResponse({ status: 401, type: ApiErrorResponseDto })
  @ApiResponse({ status: 403, type: ApiErrorResponseDto })
  async current(
    @Req() request: FastifyRequest,
    @Query() query: CurrentStoreImpersonationQueryDto,
  ): Promise<CurrentStoreImpersonationSessionResponseDto> {
    const user = await this.requireImpersonationPermission(request);
    return this.impersonation.currentSession(user.id, query.sessionId);
  }

  @Post("impersonation/:sessionId/end")
  @ApiOperation({ summary: "End an internal Store impersonation session" })
  @ApiOkResponse({ type: StoreImpersonationSessionResponseDto })
  @ApiResponse({ status: 401, type: ApiErrorResponseDto })
  @ApiResponse({ status: 403, type: ApiErrorResponseDto })
  @ApiResponse({ status: 404, type: ApiErrorResponseDto })
  async end(
    @Req() request: FastifyRequest,
    @Param("sessionId", SelfxUuidParamPipe) sessionId: string,
  ): Promise<StoreImpersonationSessionResponseDto> {
    const user = await this.requireImpersonationPermission(request);
    return this.impersonation.endSession(user.id, sessionId);
  }

  private async requireImpersonationPermission(request: FastifyRequest) {
    const user = await this.auth.requireAccessUser(
      request.headers.authorization,
    );
    await this.platformAuthorization.requirePermission(
      user.id,
      PLATFORM_PERMISSIONS.storeImpersonation,
    );
    return user;
  }
}
