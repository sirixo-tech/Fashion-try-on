import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
} from "@nestjs/common";
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
import {
  CreateKioskConfigurationAssetUploadDto,
  KioskConfigurationAssetUploadIntentDto,
  KioskConfigurationDto,
  KioskDeviceListResponseDto,
  UpdateKioskConfigurationDto,
} from "../kiosks/dto/kiosk.dto.js";
import { KioskConfigurationService } from "../kiosks/kiosk-configuration.service.js";
import {
  PLATFORM_PERMISSIONS,
  type PlatformPermission,
} from "../platform/platform-permissions.js";
import { PlatformAuthorizationService } from "../platform/platform-authorization.service.js";
import {
  STORE_PERMISSION_CODES,
  type StorePermissionCode,
} from "../rbac/store-permissions.js";
import { StoreRbacService } from "../rbac/store-rbac.service.js";
import { AdminStoresService } from "./admin-stores.service.js";
import {
  AdminStoreDetailResponseDto,
  AdminStoreListQueryDto,
  AdminStoreListResponseDto,
  AdminStoreResponseDto,
  CreateAdminStoreDto,
  CreateStoreProductDto,
  CreateStoreProductImageUploadDto,
  PairStoreKioskDto,
  StoreKioskDeviceResponseDto,
  StoreKioskPairResponseDto,
  StoreProductDto,
  StoreProductImageUploadIntentDto,
  StoreProductListQueryDto,
  StoreProductListResponseDto,
  StoreVirtualTryOnSettingsResponseDto,
  UpdateStoreProductDto,
  UpdateStoreVirtualTryOnSettingsDto,
  UpdateAdminStoreDto,
} from "./dto/admin-store.dto.js";

@ApiTags("Platform Stores")
@ApiBearerAuth()
@Controller("api/v1/admin/stores")
export class AdminStoresController {
  constructor(
    private readonly auth: AuthService,
    private readonly platformAuthorization: PlatformAuthorizationService,
    private readonly stores: AdminStoresService,
    private readonly configurations: KioskConfigurationService,
    private readonly rbac: StoreRbacService,
  ) {}

  @Get()
  @ApiOperation({ summary: "List merchant Stores" })
  @ApiOkResponse({ type: AdminStoreListResponseDto })
  @ApiResponse({ status: 401, type: ApiErrorResponseDto })
  @ApiResponse({ status: 403, type: ApiErrorResponseDto })
  async list(
    @Req() request: FastifyRequest,
    @Query() query: AdminStoreListQueryDto,
  ): Promise<AdminStoreListResponseDto> {
    await this.requirePermission(request, PLATFORM_PERMISSIONS.storesView);
    return this.stores.listStores(query);
  }

  @Post()
  @ApiOperation({ summary: "Create a merchant Store" })
  @ApiCreatedResponse({ type: AdminStoreResponseDto })
  @ApiResponse({ status: 400, type: ApiErrorResponseDto })
  @ApiResponse({ status: 401, type: ApiErrorResponseDto })
  @ApiResponse({ status: 403, type: ApiErrorResponseDto })
  @ApiResponse({ status: 409, type: ApiErrorResponseDto })
  async create(
    @Req() request: FastifyRequest,
    @Body() dto: CreateAdminStoreDto,
  ): Promise<AdminStoreResponseDto> {
    await this.requirePermission(request, PLATFORM_PERMISSIONS.storesCreate);
    return this.stores.createStore(dto);
  }

  @Get(":storeId")
  @ApiOperation({ summary: "Get one Store dashboard" })
  @ApiOkResponse({ type: AdminStoreDetailResponseDto })
  @ApiResponse({ status: 401, type: ApiErrorResponseDto })
  @ApiResponse({ status: 403, type: ApiErrorResponseDto })
  @ApiResponse({ status: 404, type: ApiErrorResponseDto })
  async get(
    @Req() request: FastifyRequest,
    @Param("storeId", SelfxUuidParamPipe) storeId: string,
  ): Promise<AdminStoreDetailResponseDto> {
    await this.requirePlatformOrStorePermission(
      request,
      storeId,
      PLATFORM_PERMISSIONS.storesView,
      STORE_PERMISSION_CODES.storesView,
    );
    return this.stores.getStore(storeId);
  }

  @Patch(":storeId")
  @ApiOperation({ summary: "Update Store details" })
  @ApiOkResponse({ type: AdminStoreResponseDto })
  @ApiResponse({ status: 400, type: ApiErrorResponseDto })
  @ApiResponse({ status: 401, type: ApiErrorResponseDto })
  @ApiResponse({ status: 403, type: ApiErrorResponseDto })
  @ApiResponse({ status: 404, type: ApiErrorResponseDto })
  @ApiResponse({ status: 409, type: ApiErrorResponseDto })
  async update(
    @Req() request: FastifyRequest,
    @Param("storeId", SelfxUuidParamPipe) storeId: string,
    @Body() dto: UpdateAdminStoreDto,
  ): Promise<AdminStoreResponseDto> {
    await this.requirePlatformOrStorePermission(
      request,
      storeId,
      PLATFORM_PERMISSIONS.storesUpdate,
      STORE_PERMISSION_CODES.storesUpdate,
    );
    return this.stores.updateStore(storeId, dto);
  }

  @Get(":storeId/virtual-try-on-settings")
  @ApiOperation({ summary: "Read Store Virtual Try-On settings" })
  @ApiOkResponse({ type: StoreVirtualTryOnSettingsResponseDto })
  async getVirtualTryOnSettings(
    @Req() request: FastifyRequest,
    @Param("storeId", SelfxUuidParamPipe) storeId: string,
  ): Promise<StoreVirtualTryOnSettingsResponseDto> {
    await this.requirePlatformOrStorePermission(
      request,
      storeId,
      PLATFORM_PERMISSIONS.storesView,
      STORE_PERMISSION_CODES.storesView,
    );
    return this.stores.getVirtualTryOnSettings(storeId);
  }

  @Put(":storeId/virtual-try-on-settings")
  @ApiOperation({ summary: "Update Store Virtual Try-On settings" })
  @ApiOkResponse({ type: StoreVirtualTryOnSettingsResponseDto })
  async updateVirtualTryOnSettings(
    @Req() request: FastifyRequest,
    @Param("storeId", SelfxUuidParamPipe) storeId: string,
    @Body() dto: UpdateStoreVirtualTryOnSettingsDto,
  ): Promise<StoreVirtualTryOnSettingsResponseDto> {
    await this.requirePlatformOrStorePermission(
      request,
      storeId,
      PLATFORM_PERMISSIONS.storesUpdate,
      STORE_PERMISSION_CODES.storesUpdate,
    );
    return this.stores.updateVirtualTryOnSettings(storeId, dto);
  }

  @Post(":storeId/deactivate")
  @ApiOperation({ summary: "Deactivate a Store" })
  @ApiOkResponse({ type: AdminStoreResponseDto })
  async deactivate(
    @Req() request: FastifyRequest,
    @Param("storeId", SelfxUuidParamPipe) storeId: string,
  ): Promise<AdminStoreResponseDto> {
    await this.requirePermission(
      request,
      PLATFORM_PERMISSIONS.storesDeactivate,
    );
    return this.stores.deactivateStore(storeId);
  }

  @Post(":storeId/activate")
  @ApiOperation({ summary: "Reactivate a Store" })
  @ApiOkResponse({ type: AdminStoreResponseDto })
  async activate(
    @Req() request: FastifyRequest,
    @Param("storeId", SelfxUuidParamPipe) storeId: string,
  ): Promise<AdminStoreResponseDto> {
    await this.requirePermission(request, PLATFORM_PERMISSIONS.storesUpdate);
    return this.stores.activateStore(storeId);
  }

  @Delete(":storeId")
  @ApiOperation({ summary: "Delete an inactive Store" })
  @ApiOkResponse({ type: AdminStoreResponseDto })
  async archive(
    @Req() request: FastifyRequest,
    @Param("storeId", SelfxUuidParamPipe) storeId: string,
  ): Promise<AdminStoreResponseDto> {
    await this.requirePermission(
      request,
      PLATFORM_PERMISSIONS.storesDeactivate,
    );
    return this.stores.archiveStore(storeId);
  }

  @Get(":storeId/products")
  @ApiOperation({ summary: "List Store catalog products" })
  @ApiOkResponse({ type: StoreProductListResponseDto })
  async listProducts(
    @Req() request: FastifyRequest,
    @Param("storeId", SelfxUuidParamPipe) storeId: string,
    @Query() query: StoreProductListQueryDto,
  ): Promise<StoreProductListResponseDto> {
    await this.requirePlatformOrStorePermission(
      request,
      storeId,
      PLATFORM_PERMISSIONS.storesView,
      STORE_PERMISSION_CODES.storesView,
    );
    return this.stores.listStoreProducts(storeId, query);
  }

  @Post(":storeId/products")
  @ApiOperation({ summary: "Create a Store catalog product" })
  @ApiCreatedResponse({ type: StoreProductDto })
  async createProduct(
    @Req() request: FastifyRequest,
    @Param("storeId", SelfxUuidParamPipe) storeId: string,
    @Body() dto: CreateStoreProductDto,
  ): Promise<StoreProductDto> {
    await this.requirePlatformOrStorePermission(
      request,
      storeId,
      PLATFORM_PERMISSIONS.storesUpdate,
      STORE_PERMISSION_CODES.storesUpdate,
    );
    return this.stores.createStoreProduct(storeId, dto);
  }

  @Patch(":storeId/products/:productId")
  @ApiOperation({ summary: "Update a Store catalog product" })
  @ApiOkResponse({ type: StoreProductDto })
  async updateProduct(
    @Req() request: FastifyRequest,
    @Param("storeId", SelfxUuidParamPipe) storeId: string,
    @Param("productId", SelfxUuidParamPipe) productId: string,
    @Body() dto: UpdateStoreProductDto,
  ): Promise<StoreProductDto> {
    await this.requirePlatformOrStorePermission(
      request,
      storeId,
      PLATFORM_PERMISSIONS.storesUpdate,
      STORE_PERMISSION_CODES.storesUpdate,
    );
    return this.stores.updateStoreProduct(storeId, productId, dto);
  }

  @Delete(":storeId/products/:productId")
  @ApiOperation({ summary: "Delete a Store catalog product" })
  @ApiOkResponse({ type: StoreProductDto })
  async deleteProduct(
    @Req() request: FastifyRequest,
    @Param("storeId", SelfxUuidParamPipe) storeId: string,
    @Param("productId", SelfxUuidParamPipe) productId: string,
  ): Promise<StoreProductDto> {
    await this.requirePlatformOrStorePermission(
      request,
      storeId,
      PLATFORM_PERMISSIONS.storesUpdate,
      STORE_PERMISSION_CODES.storesUpdate,
    );
    return this.stores.deleteStoreProduct(storeId, productId);
  }

  @Post(":storeId/products/images/upload-intent")
  @ApiOperation({ summary: "Create a Store product image upload URL" })
  @ApiOkResponse({ type: StoreProductImageUploadIntentDto })
  async createProductImageUploadIntent(
    @Req() request: FastifyRequest,
    @Param("storeId", SelfxUuidParamPipe) storeId: string,
    @Body() dto: CreateStoreProductImageUploadDto,
  ): Promise<StoreProductImageUploadIntentDto> {
    await this.requirePlatformOrStorePermission(
      request,
      storeId,
      PLATFORM_PERMISSIONS.storesUpdate,
      STORE_PERMISSION_CODES.storesUpdate,
    );
    return this.stores.createStoreProductImageUploadIntent(storeId, dto);
  }

  @Get(":storeId/kiosks")
  @ApiOperation({ summary: "List kiosks assigned to one Store" })
  @ApiOkResponse({ type: KioskDeviceListResponseDto })
  async listKiosks(
    @Req() request: FastifyRequest,
    @Param("storeId", SelfxUuidParamPipe) storeId: string,
  ): Promise<KioskDeviceListResponseDto> {
    await this.requirePlatformOrStorePermission(
      request,
      storeId,
      PLATFORM_PERMISSIONS.kiosksView,
      STORE_PERMISSION_CODES.kiosksView,
    );
    return this.stores.listStoreKiosks(storeId);
  }

  @Post(":storeId/kiosks/pair")
  @ApiOperation({ summary: "Pair a physical kiosk directly to this Store" })
  @ApiCreatedResponse({ type: StoreKioskPairResponseDto })
  async pairKiosk(
    @Req() request: FastifyRequest,
    @Param("storeId", SelfxUuidParamPipe) storeId: string,
    @Body() dto: PairStoreKioskDto,
  ): Promise<StoreKioskPairResponseDto> {
    const user = await this.requirePlatformOrStorePermission(
      request,
      storeId,
      PLATFORM_PERMISSIONS.kiosksPair,
      STORE_PERMISSION_CODES.kiosksPair,
    );
    return this.stores.pairStoreKiosk(user.id, storeId, dto);
  }

  @Post(":storeId/kiosks/:deviceId/assign")
  @ApiOperation({
    summary: "Explicitly assign an existing kiosk to this Store",
  })
  @ApiOkResponse({ type: StoreKioskDeviceResponseDto })
  async assignKiosk(
    @Req() request: FastifyRequest,
    @Param("storeId", SelfxUuidParamPipe) storeId: string,
    @Param("deviceId", SelfxUuidParamPipe) deviceId: string,
  ): Promise<StoreKioskDeviceResponseDto> {
    const user = await this.requirePermission(
      request,
      PLATFORM_PERMISSIONS.kiosksAssign,
    );
    return this.stores.assignKioskToStore(user.id, storeId, deviceId);
  }

  @Get(":storeId/kiosks/:deviceId")
  @ApiOperation({ summary: "Get one Store-owned kiosk" })
  @ApiOkResponse({ type: StoreKioskDeviceResponseDto })
  async getKiosk(
    @Req() request: FastifyRequest,
    @Param("storeId", SelfxUuidParamPipe) storeId: string,
    @Param("deviceId", SelfxUuidParamPipe) deviceId: string,
  ): Promise<StoreKioskDeviceResponseDto> {
    await this.requirePlatformOrStorePermission(
      request,
      storeId,
      PLATFORM_PERMISSIONS.kiosksView,
      STORE_PERMISSION_CODES.kiosksView,
    );
    return this.stores.getStoreKiosk(storeId, deviceId);
  }

  @Get(":storeId/kiosks/:deviceId/configuration")
  @ApiOperation({
    summary: "Return Store-owned kiosk runtime configuration",
  })
  @ApiOkResponse({ type: KioskConfigurationDto })
  async getKioskConfiguration(
    @Req() request: FastifyRequest,
    @Param("storeId", SelfxUuidParamPipe) storeId: string,
    @Param("deviceId", SelfxUuidParamPipe) deviceId: string,
  ): Promise<KioskConfigurationDto> {
    await this.requirePlatformOrStorePermission(
      request,
      storeId,
      PLATFORM_PERMISSIONS.kiosksConfigure,
      STORE_PERMISSION_CODES.kiosksConfigure,
    );
    await this.stores.requireKioskInStore(storeId, deviceId);
    return this.configurations.getAdminConfiguration(deviceId);
  }

  @Put(":storeId/kiosks/:deviceId/configuration")
  @ApiOperation({
    summary: "Update Store-owned kiosk runtime configuration",
  })
  @ApiOkResponse({ type: KioskConfigurationDto })
  async updateKioskConfiguration(
    @Req() request: FastifyRequest,
    @Param("storeId", SelfxUuidParamPipe) storeId: string,
    @Param("deviceId", SelfxUuidParamPipe) deviceId: string,
    @Body() dto: UpdateKioskConfigurationDto,
  ): Promise<KioskConfigurationDto> {
    const user = await this.requirePlatformOrStorePermission(
      request,
      storeId,
      PLATFORM_PERMISSIONS.kiosksConfigure,
      STORE_PERMISSION_CODES.kiosksConfigure,
    );
    await this.stores.requireKioskInStore(storeId, deviceId);
    return this.configurations.updateAdminConfiguration(user.id, deviceId, dto);
  }

  @Post(":storeId/kiosks/:deviceId/configuration/assets/upload-intent")
  @ApiOperation({
    summary: "Create a Store-owned kiosk presentation asset upload URL",
  })
  @ApiOkResponse({ type: KioskConfigurationAssetUploadIntentDto })
  async createKioskConfigurationAssetUploadIntent(
    @Req() request: FastifyRequest,
    @Param("storeId", SelfxUuidParamPipe) storeId: string,
    @Param("deviceId", SelfxUuidParamPipe) deviceId: string,
    @Body() dto: CreateKioskConfigurationAssetUploadDto,
  ): Promise<KioskConfigurationAssetUploadIntentDto> {
    await this.requirePlatformOrStorePermission(
      request,
      storeId,
      PLATFORM_PERMISSIONS.kiosksConfigure,
      STORE_PERMISSION_CODES.kiosksConfigure,
    );
    await this.stores.requireKioskInStore(storeId, deviceId);
    return this.configurations.createAdminAssetUploadIntent(deviceId, dto);
  }

  private async requirePermission(
    request: FastifyRequest,
    permission: PlatformPermission,
  ) {
    const user = await this.auth.requireAccessUser(
      request.headers.authorization,
    );
    await this.platformAuthorization.requirePermission(user.id, permission);
    return user;
  }

  private async requirePlatformOrStorePermission(
    request: FastifyRequest,
    storeId: string,
    platformPermission: PlatformPermission,
    storePermission: StorePermissionCode,
  ) {
    const user = await this.auth.requireAccessUser(
      request.headers.authorization,
    );
    if (
      await this.platformAuthorization.hasPermission(
        user.id,
        platformPermission,
      )
    ) {
      return user;
    }
    await this.rbac.requireStorePermission(user.id, storeId, storePermission);
    return user;
  }
}
