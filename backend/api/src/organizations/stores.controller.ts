import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
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
import { CursorPaginationQueryDto } from "../common/pagination.dto.js";
import { SelfxUuidParamPipe } from "../common/uuid-param.pipe.js";
import { CreateStoreDto, UpdateStoreDto } from "./dto/tenant-commands.dto.js";
import {
  StoreListResponseDto,
  StoreResponseDto,
} from "./dto/tenant-response.dto.js";
import { TenantManagementService } from "./tenant-management.service.js";

@ApiTags("Stores")
@ApiBearerAuth()
@Controller("api/v1/organizations/:organizationId/stores")
export class StoresController {
  constructor(
    private readonly auth: AuthService,
    private readonly tenants: TenantManagementService,
  ) {}

  @Get()
  @ApiOperation({ summary: "List stores visible to the current membership" })
  @ApiOkResponse({ type: StoreListResponseDto })
  @ApiResponse({ status: 401, type: ApiErrorResponseDto })
  @ApiResponse({ status: 403, type: ApiErrorResponseDto })
  async list(
    @Req() request: FastifyRequest,
    @Param("organizationId", SelfxUuidParamPipe) organizationId: string,
    @Query() query: CursorPaginationQueryDto,
  ): Promise<StoreListResponseDto> {
    const user = await this.auth.requireAccessUser(
      request.headers.authorization,
    );
    return this.tenants.listStores(user.id, organizationId, query);
  }

  @Post()
  @ApiOperation({ summary: "Create a store in an active organization" })
  @ApiCreatedResponse({ type: StoreResponseDto })
  @ApiResponse({ status: 401, type: ApiErrorResponseDto })
  @ApiResponse({ status: 403, type: ApiErrorResponseDto })
  async create(
    @Req() request: FastifyRequest,
    @Param("organizationId", SelfxUuidParamPipe) organizationId: string,
    @Body() dto: CreateStoreDto,
  ): Promise<StoreResponseDto> {
    const user = await this.auth.requireAccessUser(
      request.headers.authorization,
    );
    return this.tenants.createStore(user.id, organizationId, dto);
  }

  @Get(":storeId")
  @ApiOperation({ summary: "Get one store within an active organization" })
  @ApiOkResponse({ type: StoreResponseDto })
  @ApiResponse({ status: 401, type: ApiErrorResponseDto })
  @ApiResponse({ status: 403, type: ApiErrorResponseDto })
  @ApiResponse({ status: 404, type: ApiErrorResponseDto })
  async get(
    @Req() request: FastifyRequest,
    @Param("organizationId", SelfxUuidParamPipe) organizationId: string,
    @Param("storeId", SelfxUuidParamPipe) storeId: string,
  ): Promise<StoreResponseDto> {
    const user = await this.auth.requireAccessUser(
      request.headers.authorization,
    );
    return this.tenants.getStore(user.id, organizationId, storeId);
  }

  @Patch(":storeId")
  @ApiOperation({ summary: "Update or archive one store" })
  @ApiOkResponse({ type: StoreResponseDto })
  @ApiResponse({ status: 401, type: ApiErrorResponseDto })
  @ApiResponse({ status: 403, type: ApiErrorResponseDto })
  @ApiResponse({ status: 404, type: ApiErrorResponseDto })
  async update(
    @Req() request: FastifyRequest,
    @Param("organizationId", SelfxUuidParamPipe) organizationId: string,
    @Param("storeId", SelfxUuidParamPipe) storeId: string,
    @Body() dto: UpdateStoreDto,
  ): Promise<StoreResponseDto> {
    const user = await this.auth.requireAccessUser(
      request.headers.authorization,
    );
    return this.tenants.updateStore(user.id, organizationId, storeId, dto);
  }
}
