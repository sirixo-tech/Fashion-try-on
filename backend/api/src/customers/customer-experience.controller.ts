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
  StreamableFile,
} from "@nestjs/common";
import {
  IsBoolean,
  IsInt,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  Matches,
} from "class-validator";
import { Type } from "class-transformer";
import type { FastifyRequest } from "fastify";
import { ApiErrorException } from "../common/api-error.exception.js";
import { SelfxUuidParamPipe } from "../common/uuid-param.pipe.js";
import { AuthService } from "../auth/auth.service.js";
import { StoreRbacService } from "../rbac/store-rbac.service.js";
import { STORE_PERMISSION_CODES } from "../rbac/store-permissions.js";
import { StoreImpersonationService } from "../stores/store-impersonation.service.js";
import { CustomerAuthService } from "./customer-auth.service.js";
import { CustomerExperienceService } from "./customer-experience.service.js";
import { demoCatalog } from "./customer-demo-catalog.js";
import { CUSTOMER_LANGUAGES } from "./customer-languages.js";

export class CustomerPhotoSessionDto {
  @IsBoolean() consentAccepted!: boolean;
  @IsString() @MaxLength(40) consentVersion!: string;
  @IsOptional() @IsIn(CUSTOMER_LANGUAGES) consentLanguage?: string;
  @IsOptional() @IsUUID() storeVisitId?: string;
}
export class CustomerRunDto {
  @IsUUID() sessionId!: string;
  @IsUUID() clientRequestId!: string;
  @IsUUID() personAssetId!: string;
  @IsOptional() @IsUUID() garmentAssetId?: string;
  @IsOptional() @IsUUID() productId?: string;
}
export class CustomerPageDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(10000) page?: number;
}
export class CustomerStoreJoinDto {
  @IsString() @MaxLength(256) payload!: string;
}
export class CustomerDemoChoiceDto {
  @IsString() @MaxLength(64) id!: string;
}
export class CustomerSavedGarmentDto {
  @IsIn(["DEMO", "STORE"]) source!: "DEMO" | "STORE";
  @IsString() @MaxLength(64) id!: string;
}
export class CustomerStoreQrDto {
  @IsString() @MaxLength(100) @Matches(/\S/) label!: string;
  @IsInt() @Min(1) @Max(100) dailyCustomerLimit!: number;
}

@Controller("api/v1/customer")
export class CustomerExperienceController {
  constructor(
    private readonly auth: CustomerAuthService,
    private readonly experience: CustomerExperienceService,
  ) {}
  @Get("experience")
  @Header("Cache-Control", "no-store")
  async summary(@Req() request: FastifyRequest) {
    const { customer } = await this.auth.requireCustomer(
      request.headers.authorization,
    );
    return this.experience.summary(customer);
  }
  @Get("demo-catalog")
  @Header("Cache-Control", "no-store")
  async demo(@Req() request: FastifyRequest) {
    await this.auth.requireCustomer(request.headers.authorization);
    return demoCatalog();
  }
  @Post("try-on/sessions/:id/demo/:purpose")
  @Header("Cache-Control", "no-store")
  async useDemo(
    @Req() request: FastifyRequest,
    @Param("id", SelfxUuidParamPipe) id: string,
    @Param("purpose") purpose: string,
    @Body() input: CustomerDemoChoiceDto,
  ) {
    const { customer } = await this.auth.requireCustomer(
      request.headers.authorization,
    );
    await this.auth.limitExperience("upload", customer.id, request.ip);
    if (purpose !== "PERSON" && purpose !== "GARMENT")
      throw new ApiErrorException(
        400,
        "DEMO_ITEM_INVALID",
        "Choose a demo model or outfit.",
      );
    return this.experience.useDemo(customer, id, purpose, input.id);
  }
  @Post("try-on/sessions")
  @Header("Cache-Control", "no-store")
  async createSession(
    @Req() request: FastifyRequest,
    @Body() input: CustomerPhotoSessionDto,
  ) {
    const { customer } = await this.auth.requireCustomer(
      request.headers.authorization,
    );
    await this.auth.limitExperience("session", customer.id, request.ip);
    return this.experience.createSession(customer, input);
  }
  @Post("try-on/sessions/:id/photos/:purpose")
  @Header("Cache-Control", "no-store")
  async upload(
    @Req() request: FastifyRequest,
    @Param("id", SelfxUuidParamPipe) id: string,
    @Param("purpose") purpose: string,
  ) {
    const { customer } = await this.auth.requireCustomer(
      request.headers.authorization,
    );
    await this.auth.limitExperience("upload", customer.id, request.ip);
    if (!["PERSON", "GARMENT"].includes(purpose) || !request.isMultipart())
      throw new ApiErrorException(
        400,
        "CUSTOMER_UPLOAD_INVALID",
        "Choose a valid photo to upload.",
      );
    let photo: { buffer: Buffer; contentType: string } | undefined;
    try {
      for await (const part of request.parts({
        limits: { files: 1, fields: 0, parts: 1, fileSize: 16 * 1024 * 1024 },
      })) {
        if (part.type !== "file" || part.fieldname !== "image" || photo)
          throw new Error("Invalid image fields");
        photo = { buffer: await part.toBuffer(), contentType: part.mimetype };
      }
    } catch {
      throw new ApiErrorException(
        400,
        "CUSTOMER_UPLOAD_INVALID",
        "Choose one JPEG, PNG or WebP photo up to 16 MB.",
      );
    }
    if (!photo)
      throw new ApiErrorException(
        400,
        "CUSTOMER_UPLOAD_REQUIRED",
        "Choose a photo first.",
      );
    return this.experience.upload(
      customer,
      id,
      purpose as "PERSON" | "GARMENT",
      photo.buffer,
      photo.contentType,
    );
  }
  @Get("try-on/assets/:id")
  @Header("Cache-Control", "no-store")
  async asset(
    @Req() request: FastifyRequest,
    @Param("id", SelfxUuidParamPipe) id: string,
  ) {
    const { customer } = await this.auth.requireCustomer(
      request.headers.authorization,
    );
    return this.experience.getAsset(customer.id, id);
  }
  @Get("try-on/assets/:id/download")
  @Header("Cache-Control", "no-store")
  async download(
    @Req() request: FastifyRequest,
    @Param("id", SelfxUuidParamPipe) id: string,
  ) {
    const { customer } = await this.auth.requireCustomer(
      request.headers.authorization,
    );
    const asset = await this.experience.downloadResult(customer.id, id);
    return new StreamableFile(asset.body, {
      type: asset.contentType,
      disposition: `attachment; filename="SelfX-look.${asset.extension}"`,
    });
  }
  @Post("try-on/runs")
  @Header("Cache-Control", "no-store")
  async createRun(
    @Req() request: FastifyRequest,
    @Body() input: CustomerRunDto,
  ) {
    const { customer } = await this.auth.requireCustomer(
      request.headers.authorization,
    );
    await this.auth.limitExperience("run", customer.id, request.ip);
    return this.experience.createRun(customer, input);
  }
  @Get("try-on/runs/:id")
  @Header("Cache-Control", "no-store")
  async run(
    @Req() request: FastifyRequest,
    @Param("id", SelfxUuidParamPipe) id: string,
  ) {
    const { customer } = await this.auth.requireCustomer(
      request.headers.authorization,
    );
    return this.experience.getRun(customer.id, id);
  }
  @Get("looks")
  @Header("Cache-Control", "no-store")
  async saved(@Req() request: FastifyRequest, @Query() input: CustomerPageDto) {
    const { customer } = await this.auth.requireCustomer(
      request.headers.authorization,
    );
    return this.experience.saved(customer.id, input.page);
  }
  @Get("saved-garments")
  @Header("Cache-Control", "no-store")
  async savedGarments(@Req() request: FastifyRequest) {
    const { customer } = await this.auth.requireCustomer(request.headers.authorization);
    return this.experience.savedGarments(customer.id);
  }
  @Post("saved-garments")
  @Header("Cache-Control", "no-store")
  async saveGarment(@Req() request: FastifyRequest, @Body() input: CustomerSavedGarmentDto) {
    const { customer } = await this.auth.requireCustomer(request.headers.authorization);
    return this.experience.saveGarment(customer.id, input);
  }
  @Delete("saved-garments/:source/:id")
  @Header("Cache-Control", "no-store")
  async removeGarment(
    @Req() request: FastifyRequest,
    @Param("source") source: string,
    @Param("id") id: string,
  ) {
    const { customer } = await this.auth.requireCustomer(request.headers.authorization);
    return this.experience.removeGarment(customer.id, source, id);
  }
  @Delete("looks/:id")
  @Header("Cache-Control", "no-store")
  async deleteLook(
    @Req() request: FastifyRequest,
    @Param("id", SelfxUuidParamPipe) id: string,
  ) {
    const { customer } = await this.auth.requireCustomer(
      request.headers.authorization,
    );
    return this.experience.deleteLook(customer.id, id);
  }
  @Delete("photos")
  @Header("Cache-Control", "no-store")
  async erasePhotos(@Req() request: FastifyRequest) {
    const { customer } = await this.auth.requireCustomer(
      request.headers.authorization,
    );
    await this.experience.eraseCustomerPhotos(customer.id);
    return { message: "Your photos and results have been removed." };
  }
  @Post("store-visits")
  @Header("Cache-Control", "no-store")
  async join(
    @Req() request: FastifyRequest,
    @Body() input: CustomerStoreJoinDto,
  ) {
    const { customer } = await this.auth.requireCustomer(
      request.headers.authorization,
    );
    await this.auth.limitExperience("store", customer.id, request.ip);
    return this.experience.joinStore(customer.id, input.payload);
  }
  @Get("store-visits/:id/products")
  @Header("Cache-Control", "no-store")
  async products(
    @Req() request: FastifyRequest,
    @Param("id", SelfxUuidParamPipe) id: string,
    @Query() input: CustomerPageDto,
  ) {
    const { customer } = await this.auth.requireCustomer(
      request.headers.authorization,
    );
    return this.experience.storeProducts(customer.id, id, input.page);
  }
  @Delete("store-visits/:id")
  @Header("Cache-Control", "no-store")
  async leave(
    @Req() request: FastifyRequest,
    @Param("id", SelfxUuidParamPipe) id: string,
  ) {
    const { customer } = await this.auth.requireCustomer(
      request.headers.authorization,
    );
    return this.experience.leaveStore(customer.id, id);
  }
}

@Controller("api/v1/admin/stores/:storeId/mobile-qrs")
export class CustomerStoreQrController {
  constructor(
    private readonly auth: AuthService,
    private readonly rbac: StoreRbacService,
    private readonly impersonation: StoreImpersonationService,
    private readonly experience: CustomerExperienceService,
  ) {}
  private async requireStore(
    request: FastifyRequest,
    storeId: string,
    manage: boolean,
  ) {
    const actor = await this.auth.requireAccessUser(
      request.headers.authorization,
    );
    await this.impersonation.resolveStoreContext(actor.id, storeId);
    await this.rbac.requireStoreResourcePermission(
      actor.id,
      storeId,
      manage
        ? STORE_PERMISSION_CODES.integrationsManage
        : STORE_PERMISSION_CODES.integrationsView,
    );
    return actor;
  }
  @Get()
  @Header("Cache-Control", "no-store")
  async list(
    @Req() request: FastifyRequest,
    @Param("storeId", SelfxUuidParamPipe) storeId: string,
  ) {
    await this.requireStore(request, storeId, false);
    return this.experience.listQrs(storeId);
  }
  @Post()
  @Header("Cache-Control", "no-store")
  async create(
    @Req() request: FastifyRequest,
    @Param("storeId", SelfxUuidParamPipe) storeId: string,
    @Body() input: CustomerStoreQrDto,
  ) {
    const actor = await this.requireStore(request, storeId, true);
    return this.experience.createQr(
      storeId,
      actor.id,
      input.label,
      input.dailyCustomerLimit,
    );
  }
  @Delete(":id")
  @Header("Cache-Control", "no-store")
  async revoke(
    @Req() request: FastifyRequest,
    @Param("storeId", SelfxUuidParamPipe) storeId: string,
    @Param("id", SelfxUuidParamPipe) id: string,
  ) {
    const actor = await this.requireStore(request, storeId, true);
    return this.experience.revokeQr(storeId, id, actor.id);
  }
}
