import { Body, Controller, Get, Header, Param, Put, Req } from "@nestjs/common";
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
import { KioskService } from "../kiosks/kiosk.service.js";
import { StoreRbacService } from "../rbac/store-rbac.service.js";
import { STORE_PERMISSION_CODES } from "../rbac/store-permissions.js";
import {
  ProductStockDto,
  UpdateProductStockDto,
} from "./dto/product-stock.dto.js";
import { ProductStockService } from "./product-stock.service.js";
import { StoreImpersonationService } from "./store-impersonation.service.js";

@ApiTags("Store Product Stock")
@ApiBearerAuth()
@ApiResponse({ status: 400, type: ApiErrorResponseDto })
@ApiResponse({ status: 401, type: ApiErrorResponseDto })
@ApiResponse({ status: 403, type: ApiErrorResponseDto })
@ApiResponse({ status: 404, type: ApiErrorResponseDto })
@ApiResponse({ status: 409, type: ApiErrorResponseDto })
@Controller("api/v1/admin/stores/:storeId/products/:productId/stock")
export class ProductStockController {
  constructor(
    private readonly auth: AuthService,
    private readonly rbac: StoreRbacService,
    private readonly impersonation: StoreImpersonationService,
    private readonly stock: ProductStockService,
  ) {}

  @Get()
  @Header("Cache-Control", "private, no-store")
  @ApiOperation({
    summary:
      "Read Store-shared stock and effective variant prices for a native product",
  })
  @ApiOkResponse({ type: ProductStockDto })
  async get(
    @Req() request: FastifyRequest,
    @Param("storeId", SelfxUuidParamPipe) storeId: string,
    @Param("productId", SelfxUuidParamPipe) productId: string,
  ): Promise<ProductStockDto> {
    await this.authorize(request, storeId, false);
    return this.stock.get(storeId, productId);
  }

  @Put()
  @ApiOperation({
    summary:
      "Set product options and absolute stock quantities with optimistic concurrency",
  })
  @ApiOkResponse({ type: ProductStockDto })
  async update(
    @Req() request: FastifyRequest,
    @Param("storeId", SelfxUuidParamPipe) storeId: string,
    @Param("productId", SelfxUuidParamPipe) productId: string,
    @Body() input: UpdateProductStockDto,
  ): Promise<ProductStockDto> {
    const user = await this.authorize(request, storeId, true);
    return this.stock.update(storeId, productId, user.id, input);
  }

  private async authorize(
    request: FastifyRequest,
    storeId: string,
    writing: boolean,
  ) {
    const user = await this.auth.requireAccessUser(
      request.headers.authorization,
    );
    await this.impersonation.resolveStoreContext(
      user.id,
      storeId,
      user.authSessionId,
    );
    await this.rbac.requireStoreResourcePermission(
      user.id,
      storeId,
      writing
        ? STORE_PERMISSION_CODES.productsManage
        : STORE_PERMISSION_CODES.storesView,
    );
    return user;
  }
}

@ApiTags("Kiosk Catalog")
@ApiBearerAuth()
@Controller("api/v1/kiosk/catalog/products")
export class KioskProductStockController {
  constructor(
    private readonly kiosks: KioskService,
    private readonly stock: ProductStockService,
  ) {}

  @Get(":productId/stock")
  @Header("Cache-Control", "private, no-store")
  @ApiResponse({ status: 401, type: ApiErrorResponseDto })
  @ApiResponse({ status: 403, type: ApiErrorResponseDto })
  @ApiResponse({ status: 404, type: ApiErrorResponseDto })
  @ApiResponse({ status: 409, type: ApiErrorResponseDto })
  @ApiOperation({
    summary: "Read live Store stock without changing Try-On eligibility",
  })
  @ApiOkResponse({ type: ProductStockDto })
  async get(
    @Req() request: FastifyRequest,
    @Param("productId", SelfxUuidParamPipe) productId: string,
  ): Promise<ProductStockDto> {
    const device = await this.kiosks.requireDevice(
      request.headers.authorization,
    );
    return this.stock.getForKiosk(device.organizationId, productId);
  }
}
