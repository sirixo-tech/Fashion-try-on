import { Body, Controller, Get, Headers, Param, Post, Req } from "@nestjs/common";
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { type FastifyRequest } from "fastify";
import { AuthService } from "../auth/auth.service.js";
import { PLATFORM_PERMISSIONS } from "../platform/platform-permissions.js";
import { PlatformAuthorizationService } from "../platform/platform-authorization.service.js";
import { STORE_PERMISSION_CODES } from "../rbac/store-permissions.js";
import { StoreRbacService } from "../rbac/store-rbac.service.js";
import {
  ApproveWooCommerceLinkSessionDto,
  CreateWooCommerceLinkSessionDto,
  WooCommerceLinkCreatedDto,
  WooCommerceLinkDetailsDto,
  WooCommerceLinkRedeemedDto,
} from "./dto/woocommerce-link.dto.js";
import { WooCommerceLinkService } from "./woocommerce-link.service.js";

@ApiTags("WooCommerce Linking")
@Controller("api/v1/public/integrations/woocommerce/link-sessions")
export class WooCommerceLinkController {
  constructor(private readonly links: WooCommerceLinkService) {}

  @Post()
  @ApiCreatedResponse({ type: WooCommerceLinkCreatedDto })
  create(@Body() dto: CreateWooCommerceLinkSessionDto) {
    return this.links.create(dto);
  }

  @Post(":linkToken/redeem")
  @ApiOkResponse({ type: WooCommerceLinkRedeemedDto })
  redeem(
    @Param("linkToken") linkToken: string,
    @Headers("x-selfx-woocommerce-redeem-secret") redeemSecret: string,
  ) {
    return this.links.redeem(linkToken, redeemSecret);
  }
}

@ApiTags("WooCommerce Linking")
@ApiBearerAuth()
@Controller("api/v1/admin/integrations/woocommerce/link-sessions")
export class AdminWooCommerceLinkController {
  constructor(
    private readonly auth: AuthService,
    private readonly platform: PlatformAuthorizationService,
    private readonly rbac: StoreRbacService,
    private readonly links: WooCommerceLinkService,
  ) {}

  @Get(":linkToken")
  @ApiOkResponse({ type: WooCommerceLinkDetailsDto })
  async describe(@Req() request: FastifyRequest, @Param("linkToken") linkToken: string) {
    await this.auth.requireAccessUser(request.headers.authorization);
    return this.links.describe(linkToken);
  }

  @Post(":linkToken/approve")
  @ApiOkResponse({ type: WooCommerceLinkDetailsDto })
  async approve(
    @Req() request: FastifyRequest,
    @Param("linkToken") linkToken: string,
    @Body() dto: ApproveWooCommerceLinkSessionDto,
  ) {
    const user = await this.auth.requireAccessUser(request.headers.authorization);
    if (!(await this.platform.hasPermission(user.id, PLATFORM_PERMISSIONS.integrationsManage)))
      await this.rbac.requireStorePermission(user.id, dto.storeId, STORE_PERMISSION_CODES.integrationsManage);
    return this.links.approve(user.id, linkToken, dto.storeId);
  }
}
