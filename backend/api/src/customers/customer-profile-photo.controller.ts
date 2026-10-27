import {
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
import { IsIn } from "class-validator";
import type { FastifyRequest } from "fastify";
import { ApiErrorException } from "../common/api-error.exception.js";
import { SelfxUuidParamPipe } from "../common/uuid-param.pipe.js";
import { CustomerAuthService } from "./customer-auth.service.js";
import {
  CustomerProfilePhotoService,
  PROFILE_PHOTO_VERSION,
} from "./customer-profile-photo.service.js";
import { CUSTOMER_LANGUAGES } from "./customer-languages.js";

export class ProfilePhotoConsentDto {
  @IsIn([PROFILE_PHOTO_VERSION]) consentVersion!: string;
  @IsIn(CUSTOMER_LANGUAGES) consentLanguage!: string;
}

@Controller("api/v1/customer/me/photo")
export class CustomerProfilePhotoController {
  constructor(
    private readonly auth: CustomerAuthService,
    private readonly photos: CustomerProfilePhotoService,
  ) {}
  @Get()
  @Header("Cache-Control", "no-store")
  async get(@Req() req: FastifyRequest) {
    const { customer } = await this.auth.requireCustomer(
      req.headers.authorization,
    );
    return this.photos.get(customer.id);
  }
  @Get(":id/content")
  @Header("Cache-Control", "no-store")
  @Header("X-Content-Type-Options", "nosniff")
  async content(
    @Req() req: FastifyRequest,
    @Param("id", SelfxUuidParamPipe) id: string,
  ) {
    const { customer } = await this.auth.requireCustomer(
      req.headers.authorization,
    );
    return new StreamableFile(await this.photos.content(customer.id, id), {
      type: "image/jpeg",
      disposition: 'inline; filename="profile.jpg"',
    });
  }
  @Delete()
  @Header("Cache-Control", "no-store")
  async remove(@Req() req: FastifyRequest) {
    const { customer } = await this.auth.requireCustomer(
      req.headers.authorization,
    );
    return this.photos.remove(customer);
  }
  @Post()
  @Header("Cache-Control", "no-store")
  async upload(
    @Req() req: FastifyRequest,
    @Query() consent: ProfilePhotoConsentDto,
  ) {
    const { customer } = await this.auth.requireCustomer(
      req.headers.authorization,
    );
    await this.auth.limitExperience("upload", customer.id, req.ip);
    let file: { bytes: Buffer; mime: string } | undefined;
    try {
      if (!req.isMultipart()) throw new Error("Multipart required");
      for await (const part of req.parts({
        limits: { files: 1, fields: 0, parts: 1, fileSize: 5 * 1024 * 1024 },
      })) {
        if (part.type !== "file" || part.fieldname !== "image" || file)
          throw new Error("One image required");
        file = { bytes: await part.toBuffer(), mime: part.mimetype };
      }
      if (!file) throw new Error("Photo required");
    } catch {
      throw new ApiErrorException(
        400,
        "PROFILE_PHOTO_INVALID",
        "Choose one JPEG, PNG or WebP photo up to 5 MB.",
      );
    }
    return this.photos.upload(
      customer,
      file.bytes,
      file.mime,
      consent.consentLanguage,
    );
  }
}
