import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  Patch,
  Post,
  Query,
  Req,
  StreamableFile,
} from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { AuthService } from "../auth/auth.service.js";
import { SelfxUuidParamPipe } from "../common/uuid-param.pipe.js";
import { CustomerAuthService } from "../customers/customer-auth.service.js";
import { PlatformAuthorizationService } from "../platform/platform-authorization.service.js";
import {
  PLATFORM_PERMISSIONS,
  type PlatformPermission,
} from "../platform/platform-permissions.js";
import {
  ContentReportsQuery,
  ReviewContentReportDto,
  SubmitContentReportDto,
} from "./content-reports.dto.js";
import { ContentReportsService } from "./content-reports.service.js";

@Controller("api/v1/customer/content-reports")
export class CustomerContentReportsController {
  constructor(
    private readonly auth: CustomerAuthService,
    private readonly reports: ContentReportsService,
  ) {}

  @Post()
  @Header("Cache-Control", "no-store")
  async submit(
    @Req() request: FastifyRequest,
    @Body() input: SubmitContentReportDto,
  ) {
    const { customer } = await this.auth.requireCustomer(
      request.headers.authorization,
    );
    await this.auth.limitExperience("report", customer.id, request.ip);
    return this.reports.submit(customer, input);
  }
}

@Controller("api/v1/admin/content-reports")
export class AdminContentReportsController {
  constructor(
    private readonly auth: AuthService,
    private readonly platform: PlatformAuthorizationService,
    private readonly reports: ContentReportsService,
  ) {}

  private async authorize(
    request: FastifyRequest,
    permission: PlatformPermission,
  ) {
    const actor = await this.auth.requireAccessUser(
      request.headers.authorization,
    );
    await this.platform.requirePermission(actor.id, permission);
    return actor.id;
  }

  @Get()
  @Header("Cache-Control", "no-store")
  async list(
    @Req() request: FastifyRequest,
    @Query() query: ContentReportsQuery,
  ) {
    await this.authorize(request, PLATFORM_PERMISSIONS.contentReportsView);
    return this.reports.list(query);
  }

  @Get(":id")
  @Header("Cache-Control", "no-store")
  async detail(
    @Req() request: FastifyRequest,
    @Param("id", SelfxUuidParamPipe) id: string,
  ) {
    const actorId = await this.authorize(
      request,
      PLATFORM_PERMISSIONS.contentReportsView,
    );
    return this.reports.detail(id, actorId);
  }

  @Get(":id/image")
  @Header("Cache-Control", "private, no-store")
  @Header("X-Content-Type-Options", "nosniff")
  async image(
    @Req() request: FastifyRequest,
    @Param("id", SelfxUuidParamPipe) id: string,
  ) {
    const actorId = await this.authorize(
      request,
      PLATFORM_PERMISSIONS.contentReportsView,
    );
    const image = await this.reports.image(id, actorId);
    return new StreamableFile(image.body, { type: image.contentType });
  }

  @Patch(":id")
  @Header("Cache-Control", "no-store")
  async review(
    @Req() request: FastifyRequest,
    @Param("id", SelfxUuidParamPipe) id: string,
    @Body() input: ReviewContentReportDto,
  ) {
    const actorId = await this.authorize(
      request,
      PLATFORM_PERMISSIONS.contentReportsManage,
    );
    return this.reports.review(id, actorId, input);
  }
}
