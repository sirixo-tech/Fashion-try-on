import { Controller, HttpCode, HttpStatus, Post, Req } from "@nestjs/common";
import {
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import { type FastifyRequest } from "fastify";

import {
  ShopifyWebhookService,
  type ShopifyWebhookRequest,
  type ShopifyWebhookResponse,
} from "./shopify-webhook.service.js";

@ApiTags("Integrations")
@Controller("api/v1/integrations/shopify")
export class ShopifyWebhookController {
  constructor(private readonly webhooks: ShopifyWebhookService) {}

  @Post("webhooks")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Receive signed Shopify catalog webhooks" })
  @ApiHeader({ name: "X-Shopify-Hmac-Sha256", required: true })
  @ApiHeader({ name: "X-Shopify-Topic", required: true })
  @ApiHeader({ name: "X-Shopify-Shop-Domain", required: true })
  @ApiHeader({ name: "X-Shopify-Webhook-Id", required: true })
  @ApiHeader({ name: "X-Shopify-Triggered-At", required: true })
  @ApiOkResponse({ description: "Webhook accepted" })
  handle(
    @Req() request: FastifyRequest & { rawBody?: Buffer },
  ): Promise<ShopifyWebhookResponse> {
    return this.webhooks.handle(request as ShopifyWebhookRequest);
  }
}
