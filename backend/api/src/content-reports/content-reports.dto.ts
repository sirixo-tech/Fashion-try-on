import { Type } from "class-transformer";
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from "class-validator";
import { ContentReportReason, ContentReportStatus } from "@prisma/client";

export class SubmitContentReportDto {
  @IsUUID() resultAssetId!: string;
  @IsEnum(ContentReportReason) reason!: ContentReportReason;
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MaxLength(2000)
  comment?: string;
}

export class ContentReportsQuery {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(10000) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize = 25;
  @IsOptional() @IsEnum(ContentReportStatus) status?: ContentReportStatus;
  @IsOptional() @IsEnum(ContentReportReason) reason?: ContentReportReason;
}

export class ReviewContentReportDto {
  @IsEnum(ContentReportStatus) status!: ContentReportStatus;
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MaxLength(4000)
  reviewNotes?: string;
  @IsInt() @Min(1) @Max(2147483646) version!: number;
}
