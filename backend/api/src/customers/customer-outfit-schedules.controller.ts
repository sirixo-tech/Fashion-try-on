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
} from "@nestjs/common";
import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
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
import { SelfxUuidParamPipe } from "../common/uuid-param.pipe.js";
import { CustomerAuthService } from "./customer-auth.service.js";
import { CustomerOutfitSchedulesService } from "./customer-outfit-schedules.service.js";
class OutfitScheduleDto {
  @IsString() @Matches(/^\d{4}-\d{2}-\d{2}$/) date!: string;
  @IsOptional() @IsString() @MaxLength(80) occasion?: string;
  @IsOptional() @IsString() @MaxLength(500) notes?: string;
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ArrayUnique()
  @IsUUID("all", { each: true })
  garmentIds!: string[];
}
export class CreateOutfitScheduleDto extends OutfitScheduleDto {
  @Matches(
    /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  )
  id!: string;
}
export class UpdateOutfitScheduleDto extends OutfitScheduleDto {
  @IsInt() @Min(1) @Max(2147483647) version!: number;
}
export class OutfitScheduleListDto {
  @IsString() @Matches(/^\d{4}-\d{2}-\d{2}$/) from!: string;
  @IsString() @Matches(/^\d{4}-\d{2}-\d{2}$/) to!: string;
  @IsOptional() @IsString() @Matches(/^\d{4}-\d{2}-\d{2}$/) day?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(10000) page?: number;
}
@Controller("api/v1/customer/outfit-schedules")
export class CustomerOutfitSchedulesController {
  constructor(
    private readonly auth: CustomerAuthService,
    private readonly schedules: CustomerOutfitSchedulesService,
  ) {}
  private async customer(req: FastifyRequest, write = false) {
    const { customer } = await this.auth.requireCustomer(
      req.headers.authorization,
    );
    if (write) await this.auth.limitExperience("upload", customer.id, req.ip);
    return customer;
  }
  @Get() @Header("Cache-Control", "no-store") async list(
    @Req() req: FastifyRequest,
    @Query() input: OutfitScheduleListDto,
  ) {
    return this.schedules.list((await this.customer(req)).id, input);
  }
  @Post() @Header("Cache-Control", "no-store") async create(
    @Req() req: FastifyRequest,
    @Body() input: CreateOutfitScheduleDto,
  ) {
    return this.schedules.create(
      await this.customer(req, true),
      input.id,
      input,
    );
  }
  @Patch(":id") @Header("Cache-Control", "no-store") async update(
    @Req() req: FastifyRequest,
    @Param("id", SelfxUuidParamPipe) id: string,
    @Body() input: UpdateOutfitScheduleDto,
  ) {
    return this.schedules.update(
      await this.customer(req, true),
      id,
      input.version,
      input,
    );
  }
  @Delete(":id") @Header("Cache-Control", "no-store") async remove(
    @Req() req: FastifyRequest,
    @Param("id", SelfxUuidParamPipe) id: string,
  ) {
    return this.schedules.remove(await this.customer(req, true), id);
  }
}
