import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  Patch,
  Post,
  Query,
  Req,
  StreamableFile,
} from "@nestjs/common";
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
} from "class-validator";
import type { FastifyRequest } from "fastify";
import { ApiErrorException } from "../common/api-error.exception.js";
import { SelfxUuidParamPipe } from "../common/uuid-param.pipe.js";
import { PrismaService } from "../database/prisma.service.js";
import { CustomerAuthService } from "./customer-auth.service.js";
import { CustomerExperienceService } from "./customer-experience.service.js";
import {
  CustomerProfilePhotoService,
  AVATAR_PHOTO_VERSION,
  type AccountPhotoKind,
} from "./customer-profile-photo.service.js";
import { CUSTOMER_LANGUAGES } from "./customer-languages.js";

export class CustomerAvatarSetupDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(3)
  @ArrayUnique()
  @IsIn(["MEN", "WOMEN", "JEWELLERY"], { each: true })
  interests!: string[];
  @IsOptional() @IsBoolean() complete?: boolean;
}
export class AvatarConsentDto {
  @IsIn([AVATAR_PHOTO_VERSION]) consentVersion!: string;
  @IsIn(CUSTOMER_LANGUAGES) consentLanguage!: string;
}
function avatarKind(kind: string): AccountPhotoKind {
  if (kind !== "SELFIE" && kind !== "FULL_BODY")
    throw new ApiErrorException(
      400,
      "AVATAR_KIND_INVALID",
      "Choose a selfie or full-body photo.",
    );
  return kind;
}

@Controller("api/v1/customer")
export class CustomerAvatarController {
  constructor(
    private readonly auth: CustomerAuthService,
    private readonly db: PrismaService,
    private readonly photos: CustomerProfilePhotoService,
    private readonly experience: CustomerExperienceService,
  ) {}
  @Get("me/avatar")
  @Header("Cache-Control", "no-store")
  async get(@Req() req: FastifyRequest) {
    const { customer } = await this.auth.requireCustomer(
      req.headers.authorization,
    );
    const [selfie, fullBody] = await Promise.all([
      this.photos.get(customer.id, "SELFIE"),
      this.photos.get(customer.id, "FULL_BODY"),
    ]);
    return {
      interests: customer.interests,
      complete: Boolean(customer.avatarSetupCompletedAt),
      selfie: selfie.photo,
      fullBody: fullBody.photo,
    };
  }
  @Patch("me/avatar")
  @Header("Cache-Control", "no-store")
  async setup(
    @Req() req: FastifyRequest,
    @Body() input: CustomerAvatarSetupDto,
  ) {
    const { customer } = await this.auth.requireCustomer(
      req.headers.authorization,
    );
    await this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM customers WHERE id = ${customer.id}::uuid FOR UPDATE`;
      const current = await tx.customer.findUniqueOrThrow({
        where: { id: customer.id },
      });
      if (
        current.status !== "ACTIVE" ||
        current.securityVersion !== customer.securityVersion
      )
        throw new ApiErrorException(
          401,
          "CUSTOMER_UNAUTHORIZED",
          "Please sign in again.",
        );
      await tx.customer.update({
        where: { id: customer.id },
        data: {
          interests: input.interests,
          ...(input.complete
            ? {
                avatarSetupCompletedAt:
                  current.avatarSetupCompletedAt ?? new Date(),
              }
            : {}),
        },
      });
    });
    return this.get(req);
  }
  @Get("me/avatar/:kind/:id/content")
  @Header("Cache-Control", "no-store")
  @Header("X-Content-Type-Options", "nosniff")
  async content(
    @Req() req: FastifyRequest,
    @Param("kind") kind: string,
    @Param("id", SelfxUuidParamPipe) id: string,
  ) {
    const { customer } = await this.auth.requireCustomer(
      req.headers.authorization,
    );
    return new StreamableFile(
      await this.photos.content(customer.id, id, avatarKind(kind)),
      {
        type: "image/jpeg",
        disposition: 'inline; filename="avatar.jpg"',
      },
    );
  }
  @Delete("me/avatar/:kind")
  @Header("Cache-Control", "no-store")
  async remove(@Req() req: FastifyRequest, @Param("kind") kind: string) {
    const { customer } = await this.auth.requireCustomer(
      req.headers.authorization,
    );
    return this.photos.remove(customer, avatarKind(kind));
  }
  @Post("me/avatar/:kind")
  @Header("Cache-Control", "no-store")
  async upload(
    @Req() req: FastifyRequest,
    @Param("kind") kind: string,
    @Query() consent: AvatarConsentDto,
  ) {
    const photoKind = avatarKind(kind);
    const { customer } = await this.auth.requireCustomer(
      req.headers.authorization,
    );
    await this.auth.limitExperience("upload", customer.id, req.ip);
    let file: { bytes: Buffer; mime: string } | undefined;
    try {
      if (!req.isMultipart()) throw new Error("Multipart required");
      for await (const part of req.parts({
        limits: { files: 1, fields: 0, parts: 1, fileSize: 16 * 1024 * 1024 },
      })) {
        if (part.type !== "file" || part.fieldname !== "image" || file)
          throw new Error("One image required");
        file = { bytes: await part.toBuffer(), mime: part.mimetype };
      }
      if (!file) throw new Error("Photo required");
    } catch {
      throw new ApiErrorException(
        400,
        "AVATAR_PHOTO_INVALID",
        "Choose one JPEG, PNG or WebP photo up to 16 MB.",
      );
    }
    return this.photos.upload(
      customer,
      file.bytes,
      file.mime,
      consent.consentLanguage,
      consent.consentVersion,
      photoKind,
    );
  }
  @Post("try-on/sessions/:id/avatar")
  @Header("Cache-Control", "no-store")
  async useAvatar(
    @Req() req: FastifyRequest,
    @Param("id", SelfxUuidParamPipe) id: string,
  ) {
    const { customer } = await this.auth.requireCustomer(
      req.headers.authorization,
    );
    await this.auth.limitExperience("upload", customer.id, req.ip);
    const { photo } = await this.photos.get(customer.id, "FULL_BODY");
    if (!photo) return { photo: null };
    const bytes = await this.photos.content(customer.id, photo.id, "FULL_BODY");
    // Existing upload enforces session ownership/consent and creates a 7-day input.
    return this.experience.upload(customer, id, "PERSON", bytes, "image/jpeg");
  }
}
