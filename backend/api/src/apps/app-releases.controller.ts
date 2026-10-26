import { Body, Controller, Get, Param, Post, Query, Req } from "@nestjs/common";
import { IsIn, IsInt, Min, IsOptional } from "class-validator";
import type { FastifyRequest } from "fastify";
import { AuthService } from "../auth/auth.service.js";
import { PlatformAuthorizationService } from "../platform/platform-authorization.service.js";
import { PLATFORM_PERMISSIONS } from "../platform/platform-permissions.js";
import { StoreRbacService } from "../rbac/store-rbac.service.js";
import { StoreImpersonationService } from "../stores/store-impersonation.service.js";
import { ApiErrorException } from "../common/api-error.exception.js";
import { SelfxUuidParamPipe } from "../common/uuid-param.pipe.js";
import { CursorPaginationQueryDto } from "../common/pagination.dto.js";
import { AppReleasesService, MAX_APK_BYTES } from "./app-releases.service.js";
export class ReleaseListQuery extends CursorPaginationQueryDto {
  @IsOptional() @IsIn(["KIOSK", "CUSTOMER"]) app?: "KIOSK" | "CUSTOMER";
}

export class ReleaseActionDto {
  @IsIn(["publish", "recommend", "retire"]) action!:
    "publish" | "recommend" | "retire";
  @IsInt() @Min(0) revision!: number;
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
  @Get()
  async list(@Req() request: FastifyRequest, @Query() query: ReleaseListQuery) {
    await this.authorize(request);
    return query.app === "CUSTOMER"
      ? this.releases.list(false, query.cursor, query.pageSize, "CUSTOMER")
      : this.releases.list(false, query.cursor, query.pageSize);
  }
  @Post()
  async upload(@Req() request: FastifyRequest) {
    const user = await this.authorize(request, true);
    this.releases.beginUpload(user.id);
    try {
      if (!request.isMultipart())
        throw new ApiErrorException(
          400,
          "APK_MULTIPART_REQUIRED",
          "Upload an APK using multipart/form-data.",
        );
      let file: Buffer | undefined;
      let releaseNotes = "";
      let notesSeen = false;
      let app: "KIOSK" | "CUSTOMER" = "KIOSK";
      let appSeen = false;
      for await (const part of request.parts({
        limits: {
          files: 1,
          fileSize: MAX_APK_BYTES,
          fields: 2,
          fieldSize: 16000,
          parts: 3,
        },
      })) {
        if (part.type === "file") {
          if (
            part.fieldname !== "apk" ||
            file ||
            !part.filename.toLowerCase().endsWith(".apk") ||
            ![
              "application/vnd.android.package-archive",
              "application/octet-stream",
              "application/zip",
            ].includes(part.mimetype)
          )
            throw new ApiErrorException(
              400,
              "APK_INVALID_FILE",
              "Choose one Android APK file.",
            );
          file = await part.toBuffer();
          if (part.file.truncated)
            throw new ApiErrorException(
              413,
              "APK_TOO_LARGE",
              "The APK exceeds 200 MiB.",
            );
        } else {
          if (
            part.fieldname === "app" &&
            !appSeen &&
            ["KIOSK", "CUSTOMER"].includes(String(part.value)) &&
            !part.valueTruncated
          ) {
            app = part.value as "KIOSK" | "CUSTOMER";
            appSeen = true;
            continue;
          }
          if (
            part.fieldname !== "releaseNotes" ||
            notesSeen ||
            typeof part.value !== "string" ||
            part.value.length > 4000 ||
            part.valueTruncated
          )
            throw new ApiErrorException(
              400,
              "APK_INVALID_NOTES",
              "Release notes must be at most 4,000 characters.",
            );
          releaseNotes = part.value;
          notesSeen = true;
        }
      }
      if (!file || file.length < 4)
        throw new ApiErrorException(
          400,
          "APK_FILE_REQUIRED",
          "Choose an APK file.",
        );
      return app === "CUSTOMER"
        ? await this.releases.upload(user.id, file, releaseNotes, app)
        : await this.releases.upload(user.id, file, releaseNotes);
    } catch (error) {
      if (error instanceof ApiErrorException) throw error;
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        String(error.code).startsWith("FST_")
      )
        throw new ApiErrorException(
          400,
          "APK_UPLOAD_INVALID",
          "Upload one APK no larger than 200 MiB with optional release notes.",
        );
      throw error;
    } finally {
      this.releases.endUpload(user.id);
    }
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
    await this.authorize(request);
    return this.releases.download(id, false);
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
    await this.impersonation.resolveStoreContext(user.id, storeId);
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
