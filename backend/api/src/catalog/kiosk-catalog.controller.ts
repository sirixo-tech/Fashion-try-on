import { Controller, Get, Headers, Query } from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";

import { ApiErrorResponseDto } from "../auth/dto/auth-response.dto.js";
import { KioskService } from "../kiosks/kiosk.service.js";
import { CatalogService } from "./catalog.service.js";
import {
  KioskCatalogCategoryListResponseDto,
  KioskCatalogCategoryQueryDto,
  KioskCatalogProductListResponseDto,
  KioskCatalogQueryDto,
} from "./dto/kiosk-catalog.dto.js";

@ApiTags("Kiosk Catalog")
@ApiBearerAuth()
@Controller("api/v1/kiosk/catalog")
export class KioskCatalogController {
  constructor(
    private readonly kiosks: KioskService,
    private readonly catalog: CatalogService,
  ) {}

  @Get("products")
  @ApiOperation({
    summary: "List catalog products available to the authenticated kiosk",
  })
  @ApiOkResponse({ type: KioskCatalogProductListResponseDto })
  @ApiResponse({ status: 401, type: ApiErrorResponseDto })
  @ApiResponse({ status: 403, type: ApiErrorResponseDto })
  async listProducts(
    @Headers("authorization") authorization: string | undefined,
    @Query() query: KioskCatalogQueryDto,
  ): Promise<KioskCatalogProductListResponseDto> {
    const device = await this.kiosks.requireDevice(authorization);
    return this.catalog.listKioskProducts(device.organizationId, query);
  }

  @Get("categories")
  @ApiOperation({
    summary: "List catalog categories available to the authenticated kiosk",
  })
  @ApiOkResponse({ type: KioskCatalogCategoryListResponseDto })
  @ApiResponse({ status: 401, type: ApiErrorResponseDto })
  @ApiResponse({ status: 403, type: ApiErrorResponseDto })
  async listCategories(
    @Headers("authorization") authorization: string | undefined,
    @Query() query: KioskCatalogCategoryQueryDto,
  ): Promise<KioskCatalogCategoryListResponseDto> {
    const device = await this.kiosks.requireDevice(authorization);
    return this.catalog.listKioskCategories(device.organizationId, query);
  }
}
