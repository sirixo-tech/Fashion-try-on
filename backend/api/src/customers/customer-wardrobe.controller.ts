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
import { Type } from "class-transformer";
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from "class-validator";
import type { FastifyRequest } from "fastify";
import { ApiErrorException } from "../common/api-error.exception.js";
import { SelfxUuidParamPipe } from "../common/uuid-param.pipe.js";
import { CustomerAuthService } from "./customer-auth.service.js";
import { CustomerExperienceService } from "./customer-experience.service.js";
import {
  CustomerWardrobeService,
  WARDROBE_CATEGORIES,
  type WardrobeCategory,
} from "./customer-wardrobe.service.js";

export class WardrobeMetadataDto {
  @IsString() @Matches(/\S/) @MaxLength(120) name!: string;
  @IsIn(WARDROBE_CATEGORIES) category!: WardrobeCategory;
  @IsOptional() @IsString() @MaxLength(40) colour?: string;
  @IsOptional() @IsString() @MaxLength(500) notes?: string;
}
export class CreateWardrobeDto extends WardrobeMetadataDto {
  @Matches(
    /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  )
  id!: string;
}
export class WardrobeListDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(10000) page?: number;
  @IsOptional() @IsIn(WARDROBE_CATEGORIES) category?: WardrobeCategory;
  @IsOptional() @IsString() @MaxLength(120) search?: string;
}
export class WardrobeChoiceDto {
  @IsUUID() itemId!: string;
}

@Controller("api/v1/customer")
export class CustomerWardrobeController {
  constructor(
    private readonly auth: CustomerAuthService,
    private readonly wardrobe: CustomerWardrobeService,
    private readonly experience: CustomerExperienceService,
  ) {}
  private async customer(req: FastifyRequest) {
    return (await this.auth.requireCustomer(req.headers.authorization))
      .customer;
  }
  @Get("wardrobe") @Header("Cache-Control", "no-store") async list(
    @Req() req: FastifyRequest,
    @Query() query: WardrobeListDto,
  ) {
    const customer = await this.customer(req);
    return this.wardrobe.list(customer.id, query);
  }
  @Post("wardrobe") @Header("Cache-Control", "no-store") async create(
    @Req() req: FastifyRequest,
    @Body() input: CreateWardrobeDto,
  ) {
    const customer = await this.customer(req);
    await this.auth.limitExperience("upload", customer.id, req.ip);
    return this.wardrobe.create(customer, input.id, input);
  }
  @Get("wardrobe/:id/content")
  @Header("Cache-Control", "no-store")
  @Header("X-Content-Type-Options", "nosniff")
  async content(
    @Req() req: FastifyRequest,
    @Param("id", SelfxUuidParamPipe) id: string,
  ) {
    const customer = await this.customer(req);
    return new StreamableFile(await this.wardrobe.content(customer.id, id), {
      type: "image/jpeg",
      disposition: 'inline; filename="garment.jpg"',
    });
  }
  @Post("wardrobe/:id/photo") @Header("Cache-Control", "no-store") async upload(
    @Req() req: FastifyRequest,
    @Param("id", SelfxUuidParamPipe) id: string,
  ) {
    const customer = await this.customer(req);
    await this.auth.limitExperience("upload", customer.id, req.ip);
    let file: { bytes: Buffer; mime: string } | undefined;
    try {
      if (!req.isMultipart()) throw new Error("Image required");
      for await (const part of req.parts({
        limits: { files: 1, fields: 0, parts: 1, fileSize: 16 * 1024 * 1024 },
      })) {
        if (part.type !== "file" || part.fieldname !== "image" || file)
          throw new Error("One image required");
        file = { bytes: await part.toBuffer(), mime: part.mimetype };
      }
      if (!file) throw new Error("Image required");
    } catch {
      throw new ApiErrorException(
        400,
        "WARDROBE_PHOTO_INVALID",
        "Choose a JPEG, PNG or WebP photo up to 16 MB, at least 256 pixels on each side and no more than 8192 pixels on either side.",
      );
    }
    return this.wardrobe.upload(customer, id, file.bytes, file.mime);
  }
  @Patch("wardrobe/:id") @Header("Cache-Control", "no-store") async update(
    @Req() req: FastifyRequest,
    @Param("id", SelfxUuidParamPipe) id: string,
    @Body() input: WardrobeMetadataDto,
  ) {
    const customer = await this.customer(req);
    await this.auth.limitExperience("upload", customer.id, req.ip);
    return this.wardrobe.update(customer, id, input);
  }
  @Delete("wardrobe/:id") @Header("Cache-Control", "no-store") async remove(
    @Req() req: FastifyRequest,
    @Param("id", SelfxUuidParamPipe) id: string,
  ) {
    return this.wardrobe.remove(await this.customer(req), id);
  }
  @Post("try-on/sessions/:id/wardrobe")
  @Header("Cache-Control", "no-store")
  async use(
    @Req() req: FastifyRequest,
    @Param("id", SelfxUuidParamPipe) id: string,
    @Body() input: WardrobeChoiceDto,
  ) {
    const customer = await this.customer(req);
    await this.auth.limitExperience("upload", customer.id, req.ip);
    const bytes = await this.wardrobe.content(customer.id, input.itemId);
    // The canonical upload path enforces session ownership, consent, Store
    // product restrictions and the seven-day temporary-input retention.
    return this.experience.upload(customer, id, "GARMENT", bytes, "image/jpeg");
  }
}
