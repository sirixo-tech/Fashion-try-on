import { ApiProperty, ApiPropertyOptional, PartialType } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
} from "class-validator";

export class PlatformProductListQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;

  @IsOptional()
  @IsIn(["ALL", "ACTIVE", "INACTIVE", "VTO_ENABLED"])
  status?: "ALL" | "ACTIVE" | "INACTIVE" | "VTO_ENABLED";
}

export class PlatformProductImageInputDto {
  @IsOptional()
  @IsString()
  @MaxLength(512)
  storageKey?: string | null;

  @IsOptional()
  @IsUrl({ require_protocol: true, protocols: ["https", "http"] })
  @MaxLength(2048)
  url?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  contentType?: string | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20000)
  width?: number | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20000)
  height?: number | null;
}

export class CreatePlatformProductDto {
  @IsString()
  @Length(1, 180)
  name!: string;

  @IsString()
  @Length(1, 120)
  categoryName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  slug?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  audience?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100_000_000)
  priceAmountCents?: number | null;

  @IsOptional()
  @IsString()
  @Matches(/^[A-Z]{3}$/)
  priceCurrency?: string | null;

  @IsOptional()
  @IsUrl({ require_protocol: true, protocols: ["https", "http"] })
  @MaxLength(2048)
  productUrl?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  garmentIntent?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  garmentCategory?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  garmentPhotoType?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsBoolean()
  vtoEnabled?: boolean;

  @IsOptional()
  @Type(() => PlatformProductImageInputDto)
  image?: PlatformProductImageInputDto | null;
}

export class UpdatePlatformProductDto extends PartialType(
  CreatePlatformProductDto,
) {}

export class CreatePlatformProductImageUploadDto {
  @IsString()
  @MaxLength(80)
  contentType!: string;

  @IsInt()
  @Min(1)
  @Max(12 * 1024 * 1024)
  sizeBytes!: number;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  fileName?: string;
}

export class PlatformProductImageDto {
  @ApiPropertyOptional({ nullable: true })
  url!: string | null;

  @ApiPropertyOptional({ nullable: true })
  storageKey!: string | null;

  @ApiPropertyOptional({ nullable: true })
  contentType!: string | null;

  @ApiPropertyOptional({ nullable: true })
  width!: number | null;

  @ApiPropertyOptional({ nullable: true })
  height!: number | null;
}

export class PlatformProductDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  slug!: string;

  @ApiPropertyOptional({ nullable: true })
  description!: string | null;

  @ApiProperty()
  audience!: string;

  @ApiProperty()
  categoryId!: string;

  @ApiProperty()
  categoryName!: string;

  @ApiProperty()
  categorySlug!: string;

  @ApiProperty()
  active!: boolean;

  @ApiProperty()
  vtoEnabled!: boolean;

  @ApiPropertyOptional({ nullable: true })
  priceAmountCents!: number | null;

  @ApiPropertyOptional({ nullable: true })
  priceCurrency!: string | null;

  @ApiPropertyOptional({ nullable: true })
  productUrl!: string | null;

  @ApiProperty()
  garmentIntent!: string;

  @ApiProperty()
  garmentCategory!: string;

  @ApiProperty()
  garmentPhotoType!: string;

  @ApiProperty()
  image!: PlatformProductImageDto;

  @ApiProperty()
  createdAt!: string;

  @ApiProperty()
  updatedAt!: string;
}

export class PlatformProductListResponseDto {
  @ApiProperty({ type: [PlatformProductDto] })
  data!: PlatformProductDto[];

  @ApiProperty()
  pagination!: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
    hasMore: boolean;
  };
}

export class PlatformProductImageUploadIntentDto {
  storageKey!: string;
  uploadUrl!: string;
  method!: "PUT";
  expiresAt!: string;
  headers!: Record<string, string>;
  maxImageBytes!: number;
  supportedContentTypes!: string[];
}
