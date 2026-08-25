import { Type } from "class-transformer";
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from "class-validator";

export const CATALOG_AUDIENCES = ["MEN", "WOMEN", "UNISEX"] as const;
export type CatalogAudience = (typeof CATALOG_AUDIENCES)[number];

export class KioskCatalogQueryDto {
  @IsOptional()
  @IsIn(CATALOG_AUDIENCES)
  audience?: CatalogAudience;

  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  category?: string;

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
}

export class KioskCatalogCategoryQueryDto {
  @IsOptional()
  @IsIn(CATALOG_AUDIENCES)
  audience?: CatalogAudience;
}

export class KioskCatalogCategoryDto {
  id!: string;
  name!: string;
  slug!: string;
  audience!: string | null;
  productCount!: number;
}

export class KioskCatalogProductCategoryDto {
  id!: string;
  name!: string;
  slug!: string;
  audience!: string | null;
}

export class KioskCatalogProductImageDto {
  url!: string | null;
  contentType!: string | null;
  width!: number | null;
  height!: number | null;
  cacheKey!: string;
}

export class KioskCatalogProductDto {
  id!: string;
  name!: string;
  description!: string | null;
  audience!: string;
  category!: KioskCatalogProductCategoryDto;
  garmentIntent!: string;
  garmentCategory!: string;
  garmentPhotoType!: string;
  image!: KioskCatalogProductImageDto;
  updatedAt!: string;
}

export class KioskCatalogRevisionDto {
  revision!: string;
  scope!: string;
  storeTenantId!: string | null;
  productCount!: number;
  categoryCount!: number;
  updatedAt!: string | null;
}

export class KioskCatalogPaginationDto {
  page!: number;
  pageSize!: number;
  total!: number;
  totalPages!: number;
  hasMore!: boolean;
}

export class KioskCatalogProductListResponseDto {
  data!: KioskCatalogProductDto[];
  pagination!: KioskCatalogPaginationDto;
}

export class KioskCatalogCategoryListResponseDto {
  data!: KioskCatalogCategoryDto[];
}

export class KioskCatalogSnapshotDto extends KioskCatalogRevisionDto {
  categories!: KioskCatalogCategoryDto[];
  products!: KioskCatalogProductDto[];
}
