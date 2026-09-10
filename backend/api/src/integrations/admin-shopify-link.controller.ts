import { Body, Controller, Get, Param, Post, Req } from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import { type FastifyRequest } from "fastify";

import { AuthService } from "../auth/auth.service.js";
import { PLATFORM_PERMISSIONS } from "../platform/platform-permissions.js";
import { PlatformAuthorizationService } from "../platform/platform-authorization.service.js";
import { STORE_PERMISSION_CODES } from "../rbac/store-permissions.js";
import { StoreRbacService } from "../rbac/store-rbac.service.js";
import {
  ApproveShopifyLinkSessionDto,
  ShopifyLinkSessionApprovalDto,
  ShopifyLinkSessionDetailsDto,
} from "./dto/shopify-link.dto.js";
import { ShopifyLinkService } from "./shopify-link.service.js";

@ApiTags("Shopify Linking")
@ApiBearerAuth()
@Controller("api/v1/admin/integrations/shopify/link-sessions")
export class AdminShopifyLinkController {
  constructor(
    private readonly auth: AuthService,
    private readonly platformAuthorization: PlatformAuthorizationService,
    private readonly rbac: StoreRbacService,
    private readonly links: ShopifyLinkService,
  ) {}

  @Get(":linkToken")
  @ApiOperation({ summary: "Inspect a pending Shopify link before approval" })
  @ApiOkResponse({ type: ShopifyLinkSessionDetailsDto })
  async describe(
    @Req() request: FastifyRequest,
    @Param("linkToken") linkToken: string,
  ): Promise<ShopifyLinkSessionDetailsDto> {
    await this.auth.requireAccessUser(request.headers.authorization);
    return this.links.describe(linkToken);
  }

  @Post(":linkToken/approve")
  @ApiOperation({ summary: "Approve a Shopify link for an active SelfX Store" })
  @ApiOkResponse({ type: ShopifyLinkSessionApprovalDto })
  async approve(
    @Req() request: FastifyRequest,
    @Param("linkToken") linkToken: string,
    @Body() dto: ApproveShopifyLinkSessionDto,
  ): Promise<ShopifyLinkSessionApprovalDto> {
    const user = await this.auth.requireAccessUser(
      request.headers.authorization,
    );
    if (
      !(await this.platformAuthorization.hasPermission(
        user.id,
        PLATFORM_PERMISSIONS.integrationsManage,
      ))
    ) {
      await this.rbac.requireStorePermission(
        user.id,
        dto.storeId,
        STORE_PERMISSION_CODES.integrationsManage,
      );
    }
    return this.links.approve(user.id, linkToken, dto.storeId);
  }
}
