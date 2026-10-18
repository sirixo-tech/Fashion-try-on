import {
  Body,
  Controller,
  Get,
  Header,
  HttpStatus,
  Param,
  Put,
  Req,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import type { FastifyRequest } from "fastify";
import { AuthService } from "../auth/auth.service.js";
import { ApiErrorResponseDto } from "../auth/dto/auth-response.dto.js";
import { ApiErrorException } from "../common/api-error.exception.js";
import { SelfxUuidParamPipe } from "../common/uuid-param.pipe.js";
import { PlatformAuthorizationService } from "../platform/platform-authorization.service.js";
import { PLATFORM_PERMISSIONS } from "../platform/platform-permissions.js";
import { StoreRbacService } from "../rbac/store-rbac.service.js";
import { StoreImpersonationService } from "../stores/store-impersonation.service.js";
import {
  PaymentGatewayListDto,
  SavePhonePeConnectionDto,
  SelectPaymentGatewayDto,
  StorePaymentSettingsDto,
  UpdateGatewayPolicyDto,
} from "./payment-settings.dto.js";
import { PaymentSettingsService } from "./payment-settings.service.js";

@ApiTags("Payment configuration")
@ApiBearerAuth()
@ApiResponse({ status: 403, type: ApiErrorResponseDto })
@Controller("api/v1/admin/payment-gateways")
export class PlatformPaymentGatewaysController {
  constructor(
    private readonly auth: AuthService,
    private readonly platform: PlatformAuthorizationService,
    private readonly impersonation: StoreImpersonationService,
    private readonly payments: PaymentSettingsService,
  ) {}
  @Get()
  @Header("Cache-Control", "private, no-store")
  @ApiOkResponse({ type: PaymentGatewayListDto })
  @ApiOperation({
    summary:
      "List supported and planned gateways; configuration availability does not enable checkout",
  })
  async list(@Req() request: FastifyRequest) {
    await this.authorize(request, false);
    return this.payments.listGateways();
  }
  @Put(":provider")
  @Header("Cache-Control", "private, no-store")
  @ApiOkResponse({ type: PaymentGatewayListDto })
  @ApiOperation({
    summary: "Control gateway configuration availability for Stores",
  })
  async update(
    @Req() request: FastifyRequest,
    @Param("provider") provider: string,
    @Body() input: UpdateGatewayPolicyDto,
  ) {
    const user = await this.authorize(request, true);
    return this.payments.updatePolicy(provider, user.id, input);
  }
  private async authorize(request: FastifyRequest, writing: boolean) {
    const user = await this.auth.requireAccessUser(
      request.headers.authorization,
    );
    if ((await this.impersonation.currentSession(user.id)).session)
      throw new ApiErrorException(
        HttpStatus.FORBIDDEN,
        "PAYMENT_IMPERSONATION_RESTRICTED",
        "Exit Store impersonation to manage platform gateways.",
      );
    if (
      !(await this.platform.hasPermission(
        user.id,
        writing
          ? PLATFORM_PERMISSIONS.integrationsManage
          : PLATFORM_PERMISSIONS.integrationsView,
      ))
    )
      throw new ApiErrorException(
        HttpStatus.FORBIDDEN,
        "PLATFORM_PERMISSION_DENIED",
        "Payment gateway access is not permitted.",
      );
    return user;
  }
}

@ApiTags("Store payment configuration")
@ApiBearerAuth()
@ApiResponse({ status: 403, type: ApiErrorResponseDto })
@Controller("api/v1/admin/stores/:storeId/payments")
export class StorePaymentSettingsController {
  constructor(
    private readonly auth: AuthService,
    private readonly rbac: StoreRbacService,
    private readonly impersonation: StoreImpersonationService,
    private readonly payments: PaymentSettingsService,
  ) {}
  @Get()
  @Header("Cache-Control", "private, no-store")
  @ApiOkResponse({ type: StorePaymentSettingsDto })
  @ApiOperation({
    summary: "Read Store gateway setup status without credentials",
  })
  async get(
    @Req() request: FastifyRequest,
    @Param("storeId", SelfxUuidParamPipe) storeId: string,
  ) {
    await this.authorize(request, storeId, false);
    return this.payments.getStore(storeId);
  }
  @Put("connections/phonepe")
  @Header("Cache-Control", "private, no-store")
  @ApiOkResponse({ type: StorePaymentSettingsDto })
  @ApiOperation({
    summary:
      "Securely replace PhonePe credentials; does not verify or enable payments",
  })
  async save(
    @Req() request: FastifyRequest,
    @Param("storeId", SelfxUuidParamPipe) storeId: string,
    @Body() input: SavePhonePeConnectionDto,
  ) {
    const user = await this.authorize(request, storeId, true);
    return this.payments.savePhonePe(storeId, user.id, input);
  }
  @Put("selection")
  @Header("Cache-Control", "private, no-store")
  @ApiOkResponse({ type: StorePaymentSettingsDto })
  @ApiOperation({
    summary:
      "Select one configured gateway for future checkout or clear selection",
  })
  async select(
    @Req() request: FastifyRequest,
    @Param("storeId", SelfxUuidParamPipe) storeId: string,
    @Body() input: SelectPaymentGatewayDto,
  ) {
    const user = await this.authorize(request, storeId, true);
    return this.payments.select(storeId, user.id, input);
  }
  private async authorize(
    request: FastifyRequest,
    storeId: string,
    writing: boolean,
  ) {
    const user = await this.auth.requireAccessUser(
      request.headers.authorization,
    );
    const context = await this.impersonation.resolveStoreContext(
      user.id,
      storeId,
    );
    if (writing && context.impersonationSession)
      throw new ApiErrorException(
        HttpStatus.FORBIDDEN,
        "PAYMENT_IMPERSONATION_RESTRICTED",
        "Payment credentials and selection cannot be changed during Store impersonation.",
      );
    await this.rbac.requireStorePaymentPermission(user.id, storeId, writing);
    return user;
  }
}
