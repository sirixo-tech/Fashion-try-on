import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from "@nestjs/common";
import { ShopifyAppServiceAuthService } from "./shopify-app-service-auth.service.js";
import { SHOPIFY_APP_SERVICE_TOKEN_HEADER } from "./shopify-link.controller.js";
import { ShopifyBillingService } from "./shopify-billing.service.js";
import {
  AcknowledgeShopifyUsageDto,
  AttachShopifyBillingDto,
  PrepareShopifyBillingDto,
  ShopifyBillingShopDto,
  VerifyShopifyBillingDto,
} from "./dto/shopify-billing.dto.js";

@Controller("api/v1/integrations/shopify/billing")
export class ShopifyBillingController {
  constructor(
    private readonly auth: ShopifyAppServiceAuthService,
    private readonly billing: ShopifyBillingService,
  ) {}
  @Post("prepare")
  prepare(
    @Headers(SHOPIFY_APP_SERVICE_TOKEN_HEADER) token: string | undefined,
    @Body() body: PrepareShopifyBillingDto,
  ) {
    this.auth.requireServiceToken(token);
    return this.billing.prepare(body);
  }
  @Get("agreements")
  list(
    @Headers(SHOPIFY_APP_SERVICE_TOKEN_HEADER) token: string | undefined,
    @Query() query: ShopifyBillingShopDto,
  ) {
    this.auth.requireServiceToken(token);
    return this.billing.list(query.shop);
  }
  @Post(":id/attach")
  attach(
    @Headers(SHOPIFY_APP_SERVICE_TOKEN_HEADER) token: string | undefined,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: AttachShopifyBillingDto,
  ) {
    this.auth.requireServiceToken(token);
    return this.billing.attach(id, body.shop, body.subscriptionId);
  }
  @Post(":id/confirm")
  confirm(
    @Headers(SHOPIFY_APP_SERVICE_TOKEN_HEADER) token: string | undefined,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: VerifyShopifyBillingDto,
  ) {
    this.auth.requireServiceToken(token);
    return this.billing.confirm(id, body);
  }
  @Get("usage")
  usage(
    @Headers(SHOPIFY_APP_SERVICE_TOKEN_HEADER) token: string | undefined,
    @Query() query: ShopifyBillingShopDto,
  ) {
    this.auth.requireServiceToken(token);
    return this.billing.pendingUsage(query.shop);
  }
  @Post("usage/:id/acknowledge")
  acknowledge(
    @Headers(SHOPIFY_APP_SERVICE_TOKEN_HEADER) token: string | undefined,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: AcknowledgeShopifyUsageDto,
  ) {
    this.auth.requireServiceToken(token);
    return this.billing.acknowledgeUsage(id, body.shop, body.usageRecordId);
  }
}
