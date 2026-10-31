import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  Post,
  Put,
  Query,
  Req,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOperation,
  ApiTags,
  ApiOkResponse,
  ApiCreatedResponse,
  ApiResponse,
} from "@nestjs/swagger";
import { ApiErrorResponseDto } from "../auth/dto/auth-response.dto.js";
import {
  StoreTaxResponseDto,
  ShoppingCartDto,
  ShoppingOrderDto,
  ShoppingOrderListDto,
} from "./commerce-response.dto.js";
import { type FastifyRequest } from "fastify";
import { AuthService } from "../auth/auth.service.js";
import { SelfxUuidParamPipe } from "../common/uuid-param.pipe.js";
import { KioskService } from "../kiosks/kiosk.service.js";
import { PlatformAuthorizationService } from "../platform/platform-authorization.service.js";
import { PLATFORM_PERMISSIONS } from "../platform/platform-permissions.js";
import { StoreRbacService } from "../rbac/store-rbac.service.js";
import { STORE_PERMISSION_CODES } from "../rbac/store-permissions.js";
import { StoreImpersonationService } from "../stores/store-impersonation.service.js";
import {
  CancelShoppingOrderDto,
  CheckoutShoppingCartDto,
  ShoppingOrderListQueryDto,
  UpdateShoppingCartDto,
  UpdateStoreTaxDto,
} from "./commerce.dto.js";
import { CommerceService } from "./commerce.service.js";

@ApiTags("Store Shopping")
@ApiBearerAuth()
@ApiResponse({ status: 401, type: ApiErrorResponseDto })
@ApiResponse({ status: 403, type: ApiErrorResponseDto })
@ApiResponse({ status: 404, type: ApiErrorResponseDto })
@ApiResponse({ status: 409, type: ApiErrorResponseDto })
@Controller("api/v1/admin/stores/:storeId/shopping")
export class StoreCommerceController {
  constructor(
    private readonly auth: AuthService,
    private readonly platform: PlatformAuthorizationService,
    private readonly rbac: StoreRbacService,
    private readonly impersonation: StoreImpersonationService,
    private readonly commerce: CommerceService,
  ) {}
  @Get("tax")
  @Header("Cache-Control", "private, no-store")
  @ApiOperation({ summary: "Read optional Store tax configuration" })
  @ApiOkResponse({ type: StoreTaxResponseDto })
  async tax(
    @Req() request: FastifyRequest,
    @Param("storeId", SelfxUuidParamPipe) storeId: string,
  ) {
    await this.authorize(request, storeId, false);
    return this.commerce.getTax(storeId);
  }
  @Put("tax")
  @ApiOperation({
    summary: "Configure no tax, included tax or added tax and a default rate",
  })
  @ApiOkResponse({ type: StoreTaxResponseDto })
  async updateTax(
    @Req() request: FastifyRequest,
    @Param("storeId", SelfxUuidParamPipe) storeId: string,
    @Body() input: UpdateStoreTaxDto,
  ) {
    const user = await this.authorize(request, storeId, true);
    return this.commerce.updateTax(storeId, user.id, input);
  }
  @Get("orders")
  @Header("Cache-Control", "private, no-store")
  @ApiOperation({ summary: "List Store order history" })
  @ApiOkResponse({ type: ShoppingOrderListDto })
  async list(
    @Req() request: FastifyRequest,
    @Param("storeId", SelfxUuidParamPipe) storeId: string,
    @Query() query: ShoppingOrderListQueryDto,
  ) {
    await this.authorize(request, storeId, false);
    return this.commerce.listOrders(storeId, query);
  }
  @Get("orders/:orderId")
  @Header("Cache-Control", "private, no-store")
  @ApiOperation({ summary: "Read an order's immutable item and tax snapshots" })
  @ApiOkResponse({ type: ShoppingOrderDto })
  async get(
    @Req() request: FastifyRequest,
    @Param("storeId", SelfxUuidParamPipe) storeId: string,
    @Param("orderId", SelfxUuidParamPipe) orderId: string,
  ) {
    await this.authorize(request, storeId, false);
    return this.commerce.getStaffOrder(storeId, orderId);
  }
  @Post("orders/:orderId/cancel")
  @ApiOperation({
    summary: "Cancel an unpaid order and release its reservation",
  })
  @ApiCreatedResponse({ type: ShoppingOrderDto })
  async cancel(
    @Req() request: FastifyRequest,
    @Param("storeId", SelfxUuidParamPipe) storeId: string,
    @Param("orderId", SelfxUuidParamPipe) orderId: string,
    @Body() input: CancelShoppingOrderDto,
  ) {
    const user = await this.authorize(request, storeId, true);
    return this.commerce.cancelStaffOrder(
      storeId,
      orderId,
      user.id,
      input.reason,
    );
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
    if (
      !(await this.platform.hasPermission(
        user.id,
        writing
          ? PLATFORM_PERMISSIONS.storesUpdate
          : PLATFORM_PERMISSIONS.storesView,
      ))
    ) {
      await this.rbac.requireStorePermission(
        user.id,
        storeId,
        writing
          ? STORE_PERMISSION_CODES.storesUpdate
          : STORE_PERMISSION_CODES.storesView,
      );
    }
    return user;
  }
}

@ApiTags("Kiosk Shopping")
@ApiBearerAuth()
@ApiResponse({ status: 401, type: ApiErrorResponseDto })
@ApiResponse({ status: 403, type: ApiErrorResponseDto })
@ApiResponse({ status: 404, type: ApiErrorResponseDto })
@ApiResponse({ status: 409, type: ApiErrorResponseDto })
@ApiResponse({ status: 429, type: ApiErrorResponseDto })
@Controller("api/v1/kiosk/try-on/sessions/:sessionId/shopping")
export class KioskCommerceController {
  constructor(
    private readonly kiosks: KioskService,
    private readonly commerce: CommerceService,
  ) {}
  @Get("cart")
  @Header("Cache-Control", "private, no-store")
  @ApiOperation({
    summary: "Read current session cart and server-calculated quote",
  })
  @ApiOkResponse({ type: ShoppingCartDto })
  async cart(
    @Req() request: FastifyRequest,
    @Param("sessionId", SelfxUuidParamPipe) sessionId: string,
  ) {
    return this.commerce.getCart(
      await this.kiosks.requireDevice(request.headers.authorization),
      sessionId,
    );
  }
  @Put("cart")
  @ApiOperation({
    summary:
      "Replace current cart using variant IDs and quantities; no stock held yet",
  })
  @ApiOkResponse({ type: ShoppingCartDto })
  async update(
    @Req() request: FastifyRequest,
    @Param("sessionId", SelfxUuidParamPipe) sessionId: string,
    @Body() input: UpdateShoppingCartDto,
  ) {
    return this.commerce.updateCart(
      await this.kiosks.requireDevice(request.headers.authorization),
      sessionId,
      input,
    );
  }
  @Post("checkout")
  @ApiOperation({
    summary:
      "Create an unpaid order and five-minute stock reservation; no payment execution",
  })
  @ApiCreatedResponse({ type: ShoppingOrderDto })
  async checkout(
    @Req() request: FastifyRequest,
    @Param("sessionId", SelfxUuidParamPipe) sessionId: string,
    @Body() input: CheckoutShoppingCartDto,
  ) {
    return this.commerce.checkout(
      await this.kiosks.requireDevice(request.headers.authorization),
      sessionId,
      input,
    );
  }
  @Get("orders/:orderId")
  @Header("Cache-Control", "private, no-store")
  @ApiOperation({ summary: "Read this session's unpaid order" })
  @ApiOkResponse({ type: ShoppingOrderDto })
  async order(
    @Req() request: FastifyRequest,
    @Param("sessionId", SelfxUuidParamPipe) sessionId: string,
    @Param("orderId", SelfxUuidParamPipe) orderId: string,
  ) {
    return this.commerce.getDeviceOrder(
      await this.kiosks.requireDevice(request.headers.authorization),
      sessionId,
      orderId,
    );
  }
  @Post("orders/:orderId/cancel")
  @ApiOperation({ summary: "Cancel this customer's unpaid order" })
  @ApiCreatedResponse({ type: ShoppingOrderDto })
  async cancel(
    @Req() request: FastifyRequest,
    @Param("sessionId", SelfxUuidParamPipe) sessionId: string,
    @Param("orderId", SelfxUuidParamPipe) orderId: string,
  ) {
    return this.commerce.cancelDeviceOrder(
      await this.kiosks.requireDevice(request.headers.authorization),
      sessionId,
      orderId,
    );
  }
}
