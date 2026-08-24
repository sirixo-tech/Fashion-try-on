import { Body, Controller, Get, Param, Patch, Post, Query, Req } from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import { type FastifyRequest } from "fastify";

import { AuthService } from "../auth/auth.service.js";
import { ApiErrorResponseDto } from "../auth/dto/auth-response.dto.js";
import { SelfxUuidParamPipe } from "../common/uuid-param.pipe.js";
import { PLATFORM_PERMISSIONS } from "../platform/platform-permissions.js";
import { PlatformAuthorizationService } from "../platform/platform-authorization.service.js";
import { AdminCatalogService } from "./admin-catalog.service.js";
import {
  CreatePlatformProductDto,
  CreatePlatformProductImageUploadDto,
  PlatformProductDto,
  PlatformProductImageUploadIntentDto,
  PlatformProductListQueryDto,
  PlatformProductListResponseDto,
  UpdatePlatformProductDto,
} from "./dto/admin-catalog.dto.js";

@ApiTags("Platform Catalog")
@ApiBearerAuth()
@Controller("api/v1/admin/catalog")
export class AdminCatalogController {
  constructor(
    private readonly auth: AuthService,
    private readonly platformAuthorization: PlatformAuthorizationService,
    private readonly catalog: AdminCatalogService,
  ) {}

  @Get("products")
  @ApiOperation({ summary: "List platform default catalog products" })
  @ApiOkResponse({ type: PlatformProductListResponseDto })
  @ApiResponse({ status: 401, type: ApiErrorResponseDto })
  @ApiResponse({ status: 403, type: ApiErrorResponseDto })
  async listProducts(
    @Req() request: FastifyRequest,
    @Query() query: PlatformProductListQueryDto,
  ): Promise<PlatformProductListResponseDto> {
    const user = await this.auth.requireAccessUser(
      request.headers.authorization,
    );
    await this.platformAuthorization.requirePermission(
      user.id,
      PLATFORM_PERMISSIONS.platformProductsView,
    );
    return this.catalog.listPlatformProducts(query);
  }

  @Post("products")
  @ApiOperation({ summary: "Create a platform default catalog product" })
  @ApiCreatedResponse({ type: PlatformProductDto })
  async createProduct(
    @Req() request: FastifyRequest,
    @Body() dto: CreatePlatformProductDto,
  ): Promise<PlatformProductDto> {
    const user = await this.auth.requireAccessUser(
      request.headers.authorization,
    );
    await this.platformAuthorization.requirePermission(
      user.id,
      PLATFORM_PERMISSIONS.platformProductsManage,
    );
    return this.catalog.createPlatformProduct(dto);
  }

  @Patch("products/:productId")
  @ApiOperation({ summary: "Update a platform default catalog product" })
  @ApiOkResponse({ type: PlatformProductDto })
  async updateProduct(
    @Req() request: FastifyRequest,
    @Param("productId", SelfxUuidParamPipe) productId: string,
    @Body() dto: UpdatePlatformProductDto,
  ): Promise<PlatformProductDto> {
    const user = await this.auth.requireAccessUser(
      request.headers.authorization,
    );
    await this.platformAuthorization.requirePermission(
      user.id,
      PLATFORM_PERMISSIONS.platformProductsManage,
    );
    return this.catalog.updatePlatformProduct(productId, dto);
  }

  @Post("products/images/upload-intent")
  @ApiOperation({ summary: "Create a platform product image upload URL" })
  @ApiOkResponse({ type: PlatformProductImageUploadIntentDto })
  async createProductImageUploadIntent(
    @Req() request: FastifyRequest,
    @Body() dto: CreatePlatformProductImageUploadDto,
  ): Promise<PlatformProductImageUploadIntentDto> {
    const user = await this.auth.requireAccessUser(
      request.headers.authorization,
    );
    await this.platformAuthorization.requirePermission(
      user.id,
      PLATFORM_PERMISSIONS.platformProductsManage,
    );
    return this.catalog.createPlatformProductImageUploadIntent(dto);
  }
}
