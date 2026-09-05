import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
} from "@nestjs/common";
import {
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiHeader,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiSecurity,
  ApiTags,
} from "@nestjs/swagger";
import { type FastifyReply, type FastifyRequest } from "fastify";

import {
  PublicApiCredential,
  PublicApiRateLimit,
  RequirePublicApiScopes,
} from "./public-api-key.decorators.js";
import { type PublicApiCredentialContext } from "./public-api-key-auth.service.js";
import { PublicApiMeResponseDto } from "./dto/public-api-me.dto.js";
import {
  CreatePublicApiTryOnDto,
  PublicApiTryOnRunResponseDto,
} from "./dto/public-api-try-on.dto.js";
import {
  PublicApiUsageQueryDto,
  PublicApiUsageResponseDto,
} from "./dto/public-api-usage.dto.js";
import {
  PublicApiUploadRequestDto,
  PublicApiUploadResponseDto,
} from "./dto/public-api-upload.dto.js";
import {
  CreatePublicApiWebhookEndpointDto,
  CreatePublicApiWebhookEndpointResponseDto,
  PublicApiWebhookEndpointDto,
  PublicApiWebhookEndpointListResponseDto,
  UpdatePublicApiWebhookEndpointDto,
} from "./dto/public-api-webhook.dto.js";
import { PublicApiTryOnService } from "./public-api-try-on.service.js";
import { PublicApiUsageService } from "./public-api-usage.service.js";
import { PublicApiUploadService } from "./public-api-upload.service.js";
import { PublicApiWebhookService } from "./public-api-webhook.service.js";
import { parsePublicApiUploadMultipartRequest } from "./public-api-upload.multipart.js";

@ApiTags("Public API")
@ApiSecurity("SelfXApiKey")
@Controller("api/v1/public")
export class PublicApiController {
  constructor(
    private readonly uploads: PublicApiUploadService,
    private readonly tryOns: PublicApiTryOnService,
    private readonly usage: PublicApiUsageService,
    private readonly webhooks: PublicApiWebhookService,
  ) {}

  @Get("me")
  @RequirePublicApiScopes()
  @PublicApiRateLimit("identity")
  @ApiOperation({
    summary: "Inspect the current Public API credential",
    description:
      "Validates the supplied API key and returns its Store context, environment and granted scopes.",
  })
  @ApiHeader({
    name: "x-selfx-api-key",
    required: false,
    description:
      "Preferred Public API key header. Authorization: Bearer and x-api-key are also supported.",
  })
  @ApiOkResponse({ type: PublicApiMeResponseDto })
  me(
    @PublicApiCredential() credential: PublicApiCredentialContext,
  ): PublicApiMeResponseDto {
    return {
      authenticated: true,
      keyPrefix: credential.keyPrefix,
      environment: credential.environment,
      scopes: credential.scopes,
      store: {
        id: credential.storeId,
        name: credential.storeName,
      },
      serverTime: new Date().toISOString(),
    };
  }

  @Post("uploads")
  @RequirePublicApiScopes("tryon:create")
  @PublicApiRateLimit("upload")
  @ApiOperation({
    summary:
      "Upload a person, garment or jewellery image for a Public API Try-On session",
    description:
      "Requires tryon:create. Uploads JPEG, PNG or WebP image data into a Store-scoped Try-On session. Omit sessionId on the first PERSON upload to create a session. Use GARMENT for garment Try-On inputs and JEWELLERY for jewellery Try-On inputs.",
  })
  @ApiHeader({
    name: "x-selfx-api-key",
    required: false,
    description:
      "Preferred Public API key header. Authorization: Bearer and x-api-key are also supported.",
  })
  @ApiConsumes("multipart/form-data")
  @ApiBody({ type: PublicApiUploadRequestDto })
  @ApiCreatedResponse({ type: PublicApiUploadResponseDto })
  async upload(
    @Req() request: FastifyRequest,
    @PublicApiCredential() credential: PublicApiCredentialContext,
  ): Promise<PublicApiUploadResponseDto> {
    const payload = await parsePublicApiUploadMultipartRequest(request);
    return this.uploads.uploadImage(credential, payload);
  }

  @Post("try-ons")
  @RequirePublicApiScopes("tryon:create")
  @PublicApiRateLimit("try_on_create")
  @ApiOperation({
    summary: "Create a Public API Try-On run",
    description:
      "Requires tryon:create. Creates an idempotent garment or jewellery Try-On run from previously uploaded assets. SelfX calls the AI provider server-side.",
  })
  @ApiHeader({
    name: "x-selfx-api-key",
    required: false,
    description:
      "Preferred Public API key header. Authorization: Bearer and x-api-key are also supported.",
  })
  @ApiBody({
    type: CreatePublicApiTryOnDto,
    examples: {
      uploadedAssets: {
        summary: "Uploaded person and garment assets",
        value: {
          clientRequestId: "order-1001-look-1",
          sessionId: "0198a9b3-d0bc-7000-8000-000000000101",
          personAssetId: "0198a9b3-d0bc-7000-8000-000000000201",
          garmentAssetId: "0198a9b3-d0bc-7000-8000-000000000202",
          garmentIntent: "TOP",
          category: "TOP",
          garmentPhotoType: "FLAT_LAY",
          generationProfile: "BALANCED",
          catalogSource: "SHOPIFY",
          externalProductId: "gid://shopify/Product/1001",
          externalVariantId: "gid://shopify/ProductVariant/2001",
          sku: "LINEN-BLUE-XL",
          productName: "Blue Linen Shirt",
          price: "2499.00",
          currency: "INR",
        },
      },
      jewelleryAssets: {
        summary: "Uploaded person and jewellery assets",
        value: {
          clientRequestId: "order-1001-ring-1",
          sessionId: "0198a9b3-d0bc-7000-8000-000000000101",
          personAssetId: "0198a9b3-d0bc-7000-8000-000000000201",
          tryOnVertical: "JEWELLERY",
          jewelleryAssetId: "0198a9b3-d0bc-7000-8000-000000000203",
          jewelleryType: "RING",
          catalogSource: "CUSTOM_API",
          externalProductId: "merchant-ring-1001",
          sku: "RING-GOLD-7",
          productName: "Gold Ring",
          price: "5499.00",
          currency: "INR",
        },
      },
    },
  })
  @ApiCreatedResponse({ type: PublicApiTryOnRunResponseDto })
  async createTryOn(
    @Body() body: CreatePublicApiTryOnDto,
    @PublicApiCredential() credential: PublicApiCredentialContext,
  ): Promise<PublicApiTryOnRunResponseDto> {
    return this.tryOns.createRun(credential, body);
  }

  @Get("try-ons/:runId")
  @RequirePublicApiScopes("tryon:read")
  @PublicApiRateLimit("try_on_read")
  @ApiOperation({
    summary: "Get a Public API Try-On run status",
    description:
      "Requires tryon:read. Poll until the run is COMPLETED or FAILED. Completed runs return a SelfX result download URL.",
  })
  @ApiHeader({
    name: "x-selfx-api-key",
    required: false,
    description:
      "Preferred Public API key header. Authorization: Bearer and x-api-key are also supported.",
  })
  @ApiOkResponse({ type: PublicApiTryOnRunResponseDto })
  async getTryOn(
    @Param("runId") runId: string,
    @PublicApiCredential() credential: PublicApiCredentialContext,
  ): Promise<PublicApiTryOnRunResponseDto> {
    return this.tryOns.getRun(credential, runId);
  }

  @Get("try-ons/:runId/download")
  @RequirePublicApiScopes("tryon:read")
  @PublicApiRateLimit("download")
  @ApiOperation({
    summary: "Download a completed Public API Try-On result",
    description:
      "Requires tryon:read. Streams the generated image as an attachment and records a Public API download usage event.",
  })
  @ApiHeader({
    name: "x-selfx-api-key",
    required: false,
    description:
      "Preferred Public API key header. Authorization: Bearer and x-api-key are also supported.",
  })
  @ApiOkResponse({ description: "Generated Try-On image attachment" })
  async downloadTryOn(
    @Res() reply: FastifyReply,
    @Param("runId") runId: string,
    @PublicApiCredential() credential: PublicApiCredentialContext,
  ): Promise<void> {
    const download = await this.tryOns.downloadRunResult(credential, runId);
    reply
      .status(200)
      .header("Content-Type", download.contentType)
      .header("Content-Disposition", download.contentDisposition)
      .header("Content-Length", String(download.contentLength))
      .header("Cache-Control", "private, no-store")
      .send(download.body);
  }

  @Get("usage")
  @RequirePublicApiScopes("usage:read")
  @PublicApiRateLimit("usage")
  @ApiOperation({
    summary: "Read Public API usage for the current API key",
    description:
      "Requires usage:read. Returns operational usage counts scoped to the current API key and Store. Pricing and billing calculations are intentionally separate.",
  })
  @ApiHeader({
    name: "x-selfx-api-key",
    required: false,
    description:
      "Preferred Public API key header. Authorization: Bearer and x-api-key are also supported.",
  })
  @ApiOkResponse({ type: PublicApiUsageResponseDto })
  async usageSummary(
    @Query() query: PublicApiUsageQueryDto,
    @PublicApiCredential() credential: PublicApiCredentialContext,
  ): Promise<PublicApiUsageResponseDto> {
    return this.usage.summary(credential, query);
  }

  @Get("webhooks")
  @RequirePublicApiScopes("webhooks:manage")
  @PublicApiRateLimit("webhook_manage")
  @ApiOperation({
    summary: "List Public API webhook endpoints",
    description:
      "Requires webhooks:manage. Lists webhook endpoints scoped to the current API key's Store.",
  })
  @ApiHeader({
    name: "x-selfx-api-key",
    required: false,
    description:
      "Preferred Public API key header. Authorization: Bearer and x-api-key are also supported.",
  })
  @ApiOkResponse({ type: PublicApiWebhookEndpointListResponseDto })
  async listWebhooks(
    @PublicApiCredential() credential: PublicApiCredentialContext,
  ): Promise<PublicApiWebhookEndpointListResponseDto> {
    return this.webhooks.listEndpoints(credential);
  }

  @Post("webhooks")
  @RequirePublicApiScopes("webhooks:manage")
  @PublicApiRateLimit("webhook_manage")
  @ApiOperation({
    summary: "Create a Public API webhook endpoint",
    description:
      "Requires webhooks:manage. Creates an HTTPS endpoint and returns its signing secret once.",
  })
  @ApiHeader({
    name: "x-selfx-api-key",
    required: false,
    description:
      "Preferred Public API key header. Authorization: Bearer and x-api-key are also supported.",
  })
  @ApiBody({
    type: CreatePublicApiWebhookEndpointDto,
    examples: {
      tryOnEvents: {
        summary: "Try-On completion and failure events",
        value: {
          url: "https://merchant.example.com/selfx/webhooks",
          subscribedEvents: ["try_on.completed", "try_on.failed"],
        },
      },
    },
  })
  @ApiCreatedResponse({ type: CreatePublicApiWebhookEndpointResponseDto })
  async createWebhook(
    @Body() body: CreatePublicApiWebhookEndpointDto,
    @PublicApiCredential() credential: PublicApiCredentialContext,
  ): Promise<CreatePublicApiWebhookEndpointResponseDto> {
    return this.webhooks.createEndpoint(credential, body);
  }

  @Patch("webhooks/:endpointId")
  @RequirePublicApiScopes("webhooks:manage")
  @PublicApiRateLimit("webhook_manage")
  @ApiOperation({
    summary: "Update a Public API webhook endpoint",
    description:
      "Requires webhooks:manage. Updates URL, subscribed events or enabled status for one Store-scoped webhook endpoint.",
  })
  @ApiHeader({
    name: "x-selfx-api-key",
    required: false,
    description:
      "Preferred Public API key header. Authorization: Bearer and x-api-key are also supported.",
  })
  @ApiOkResponse({ type: PublicApiWebhookEndpointDto })
  async updateWebhook(
    @Param("endpointId") endpointId: string,
    @Body() body: UpdatePublicApiWebhookEndpointDto,
    @PublicApiCredential() credential: PublicApiCredentialContext,
  ): Promise<PublicApiWebhookEndpointDto> {
    return this.webhooks.updateEndpoint(credential, endpointId, body);
  }

  @Delete("webhooks/:endpointId")
  @HttpCode(204)
  @RequirePublicApiScopes("webhooks:manage")
  @PublicApiRateLimit("webhook_manage")
  @ApiOperation({
    summary: "Disable a Public API webhook endpoint",
    description:
      "Requires webhooks:manage. Disables the endpoint while preserving delivery history for audit.",
  })
  @ApiHeader({
    name: "x-selfx-api-key",
    required: false,
    description:
      "Preferred Public API key header. Authorization: Bearer and x-api-key are also supported.",
  })
  @ApiNoContentResponse()
  async deleteWebhook(
    @Param("endpointId") endpointId: string,
    @PublicApiCredential() credential: PublicApiCredentialContext,
  ): Promise<void> {
    await this.webhooks.disableEndpoint(credential, endpointId);
  }
}
