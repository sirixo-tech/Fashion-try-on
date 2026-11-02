import { Body, Controller, Get, Param, Post, Query, Req } from "@nestjs/common";
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from "class-validator";
import type { FastifyRequest } from "fastify";
import { AuthService } from "../auth/auth.service.js";
import { PlatformAuthorizationService } from "../platform/platform-authorization.service.js";
import { PLATFORM_PERMISSIONS } from "../platform/platform-permissions.js";
import { StoreRbacService } from "../rbac/store-rbac.service.js";
import { StoreImpersonationService } from "../stores/store-impersonation.service.js";
import { ApiErrorException } from "../common/api-error.exception.js";
import { SelfxUuidParamPipe } from "../common/uuid-param.pipe.js";
import { CursorPaginationQueryDto } from "../common/pagination.dto.js";
import { AppReleasesService } from "./app-releases.service.js";
export class ReleaseListQuery extends CursorPaginationQueryDto {
  @IsOptional()
  @IsIn(["ALL", "KIOSK", "CUSTOMER", "CUSTOM"])
  app?: "ALL" | "KIOSK" | "CUSTOMER" | "CUSTOM";
}

export class ReleaseActionDto {
  @IsIn(["publish", "recommend", "retire"]) action!:
    "publish" | "recommend" | "retire";
  @IsInt() @Min(0) revision!: number;
}

export class BeginAppReleaseUploadDto {
  @IsIn(["KIOSK", "CUSTOMER", "CUSTOM"])
  app!: "KIOSK" | "CUSTOMER" | "CUSTOM";
  @IsOptional() @IsUUID() companionAppId?: string;
  @IsOptional() @IsString() @MaxLength(120) appName?: string;
  @IsOptional() @IsString() @MaxLength(500) appDescription?: string;
  @IsString() @MaxLength(255) filename!: string;
  @IsInt() @Min(4) @Max(209715200) sizeBytes!: number;
  @IsString() @MaxLength(4000) releaseNotes!: string;
}
@Controller("api/v1/platform/app-releases")
export class AppReleasesController {
  constructor(
    private readonly auth: AuthService,
    private readonly platform: PlatformAuthorizationService,
    private readonly releases: AppReleasesService,
  ) {}
  private async authorize(request: FastifyRequest, manage = false) {
    const user = await this.auth.requireAccessUser(
      request.headers.authorization,
    );
    if (manage)
      await this.platform.requirePermission(
        user.id,
        PLATFORM_PERMISSIONS.appReleasesManage,
      );
    else if (
      !(await this.platform.hasPermission(
        user.id,
        PLATFORM_PERMISSIONS.appReleasesView,
      ))
    )
      await this.platform.requirePermission(
        user.id,
        PLATFORM_PERMISSIONS.appReleasesManage,
      );
    return user;
  }
  @Get("uploads")
  async uploads(@Req() request: FastifyRequest) {
    const user = await this.authorize(request, true);
    return this.releases.listUploads(user.id);
  }
  @Post("uploads")
  async beginUpload(
    @Req() request: FastifyRequest,
    @Body() input: BeginAppReleaseUploadDto,
  ) {
    const user = await this.authorize(request, true);
    return this.releases.beginUpload(user.id, input);
  }
  @Post("uploads/:id/complete")
  async completeUpload(
    @Req() request: FastifyRequest,
    @Param("id", SelfxUuidParamPipe) id: string,
  ) {
    const user = await this.authorize(request, true);
    return this.releases.completeUpload(user.id, id);
  }
  // Keep the legacy endpoint as a clear protocol error for older clients. Large
  // APK bytes must go directly to the signed private-storage URL.
  @Post()
  async upload(@Req() request: FastifyRequest): Promise<never> {
    await this.authorize(request, true);
    throw new ApiErrorException(
      410,
      "APK_UPLOAD_PROTOCOL_UPDATED",
      "Request a secure upload URL, upload the APK directly to private storage, then complete the upload.",
    );
  }
  @Get()
  async list(@Req() request: FastifyRequest, @Query() query: ReleaseListQuery) {
    await this.authorize(request);
    return this.releases.list(
      false,
      query.cursor,
      query.pageSize,
      query.app ?? "KIOSK",
    );
  }
  @Post(":id/action")
  async action(
    @Req() request: FastifyRequest,
    @Param("id", SelfxUuidParamPipe) id: string,
    @Body() input: ReleaseActionDto,
  ) {
    const user = await this.authorize(request, true);
    return this.releases.change(user.id, id, input.action, input.revision);
  }
  @Post(":id/download")
  async download(
    @Req() request: FastifyRequest,
    @Param("id", SelfxUuidParamPipe) id: string,
  ) {
    const user = await this.authorize(request);
    if (await this.releases.isPublished(id))
      return this.releases.download(id, false);
    await this.platform.requirePermission(
      user.id,
      PLATFORM_PERMISSIONS.appReleasesManage,
    );
    return this.releases.download(id, false);
  }
}

@Controller("api/v1/apps/downloads")
export class SharedAppDownloadsController {
  constructor(
    private readonly auth: AuthService,
    private readonly releases: AppReleasesService,
  ) {}

  @Get()
  async list(@Req() request: FastifyRequest, @Query() query: ReleaseListQuery) {
    await this.auth.requireAccessUser(request.headers.authorization);
    return this.releases.listPublishedDownloads(
      query.cursor,
      query.pageSize,
      query.app === "ALL" ? undefined : query.app,
    );
  }

  @Post(":id/download")
  async download(
    @Req() request: FastifyRequest,
    @Param("id", SelfxUuidParamPipe) id: string,
  ) {
    await this.auth.requireAccessUser(request.headers.authorization);
    return this.releases.downloadPublished(id);
  }
}

@Controller("api/v1/admin/stores/:storeId/app-releases")
export class StoreAppDownloadsController {
  constructor(
    private readonly auth: AuthService,
    private readonly rbac: StoreRbacService,
    private readonly impersonation: StoreImpersonationService,
    private readonly releases: AppReleasesService,
  ) {}
  private async authorize(request: FastifyRequest, storeId: string) {
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
      "kiosks.view",
    );
    const access = await this.rbac.effectivePermissions(
      user.id,
      storeId,
      false,
    );
    if (
      !access.featureKeys.some((key) =>
        ["KIOSK_MANAGEMENT", "KIOSK_RENTAL"].includes(key),
      )
    )
      throw new ApiErrorException(
        403,
        "SELFX_FEATURE_UNAVAILABLE",
        "Your Store plan does not include kiosk access.",
      );
  }
  @Get()
  async list(
    @Req() request: FastifyRequest,
    @Param("storeId", SelfxUuidParamPipe) storeId: string,
    @Query() query: CursorPaginationQueryDto,
  ) {
    await this.authorize(request, storeId);
    return this.releases.list(true, query.cursor, query.pageSize);
  }
  @Post(":id/download")
  async download(
    @Req() request: FastifyRequest,
    @Param("storeId", SelfxUuidParamPipe) storeId: string,
    @Param("id", SelfxUuidParamPipe) id: string,
  ) {
    await this.authorize(request, storeId);
    return this.releases.download(id, true);
  }
}
