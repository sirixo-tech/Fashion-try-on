import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  Post,
  Query,
  Req,
} from "@nestjs/common";
import { Type } from "class-transformer";
import {
  IsIn,
  IsInt,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
} from "class-validator";
import type { FastifyRequest } from "fastify";
import { CursorPaginationQueryDto } from "../common/pagination.dto.js";
import { SelfxUuidParamPipe } from "../common/uuid-param.pipe.js";
import { AppReleasesService } from "../apps/app-releases.service.js";
import { CustomerAuthService } from "./customer-auth.service.js";
import { CustomerNotificationsService } from "./customer-notifications.service.js";
import { CUSTOMER_TERMS_VERSION } from "./customer.config.js";

export function customerPublicLinks() {
  let origin = "https://selfxweb-production.up.railway.app";
  const inherited = process.env.SELFX_WEB_BASE_URL;
  const configured =
    process.env.SELFX_CUSTOMER_PUBLIC_WEB_URL ||
    (inherited?.startsWith("https://") ? inherited : undefined);
  if (configured) {
    const parsed = new URL(configured);
    if (
      parsed.protocol !== "https:" ||
      parsed.username ||
      parsed.password ||
      parsed.pathname !== "/" ||
      parsed.search ||
      parsed.hash
    )
      throw new Error("Invalid customer public website URL");
    origin = parsed.origin;
  }
  const email =
    process.env.SELFX_SUPPORT_EMAIL?.trim() ||
    process.env.NEXT_PUBLIC_SUPPORT_EMAIL?.trim() ||
    "sirixollc@gmail.com";
  if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email))
    throw new Error("Invalid support email");
  return {
    supportEmail: email,
    supportUrl: `${origin}/support`,
    privacyUrl: `${origin}/privacy`,
    termsUrl: `${origin}/terms`,
    termsVersion: CUSTOMER_TERMS_VERSION,
  };
}
export class CustomerUpdateQuery {
  @Type(() => Number) @IsInt() @Min(1) @Max(2147483647) versionCode!: number;
  @IsIn(["ARM64", "ARM32", "X86_64", "UNIVERSAL"]) architecture!: string;
  @Type(() => Number) @IsInt() @Min(21) @Max(1000) sdk!: number;
}
export class CustomerPushDeviceDto {
  @IsUUID() installationId!: string;
  @IsString() @Length(20, 4096) token!: string;
  @IsIn(["ANDROID", "IOS"]) platform!: string;
}
@Controller("api/v1/customer/app")
export class CustomerAppController {
  constructor(
    private readonly notifications: CustomerNotificationsService,
    private readonly releases: AppReleasesService,
  ) {}
  @Get("config") @Header("Cache-Control", "no-store") config() {
    return {
      ...customerPublicLinks(),
      pushAvailable: this.notifications.ready(),
    };
  }
  @Get("updates") @Header("Cache-Control", "no-store") updates(
    @Query() query: CustomerUpdateQuery,
  ) {
    return this.releases.customerUpdate(
      query.versionCode,
      query.architecture,
      query.sdk,
    );
  }
  @Post("releases/:id/download") @Header("Cache-Control", "no-store") download(
    @Param("id", SelfxUuidParamPipe) id: string,
  ) {
    return this.releases.download(id, true, "CUSTOMER");
  }
}
@Controller("api/v1/customer")
export class CustomerNotificationsController {
  constructor(
    private readonly auth: CustomerAuthService,
    private readonly notifications: CustomerNotificationsService,
  ) {}
  @Get("notifications")
  @Header("Cache-Control", "no-store")
  async list(
    @Req() req: FastifyRequest,
    @Query() query: CursorPaginationQueryDto,
  ) {
    const { customer } = await this.auth.requireCustomer(
      req.headers.authorization,
    );
    return this.notifications.list(customer.id, query.cursor, query.pageSize);
  }
  @Post("notifications/:id/read")
  @Header("Cache-Control", "no-store")
  async read(
    @Req() req: FastifyRequest,
    @Param("id", SelfxUuidParamPipe) id: string,
  ) {
    const { customer } = await this.auth.requireCustomer(
      req.headers.authorization,
    );
    return this.notifications.read(customer.id, id);
  }
  @Post("push-devices")
  @Header("Cache-Control", "no-store")
  async register(
    @Req() req: FastifyRequest,
    @Body() input: CustomerPushDeviceDto,
  ) {
    const { customer, sessionId } = await this.auth.requireCustomer(
      req.headers.authorization,
    );
    await this.auth.limitExperience("session", customer.id, req.ip);
    return this.notifications.register(customer.id, sessionId, input);
  }
  @Delete("push-devices/:installationId")
  @Header("Cache-Control", "no-store")
  async unregister(
    @Req() req: FastifyRequest,
    @Param("installationId", SelfxUuidParamPipe) id: string,
  ) {
    const { customer } = await this.auth.requireCustomer(
      req.headers.authorization,
    );
    return this.notifications.unregister(customer.id, id);
  }
}
