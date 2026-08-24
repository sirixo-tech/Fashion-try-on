import { IsBoolean, IsOptional, Matches } from "class-validator";

export class UpdateGarmentPreviewSettingsDto {
  @IsOptional()
  @IsBoolean()
  garmentPreviewEnabled?: boolean;

  @IsOptional()
  @Matches(/^[A-Z]{3}$/)
  defaultCurrency?: string;
}

export class GarmentPreviewPlatformSettingsResponseDto {
  garmentPreviewEnabled!: boolean;
  defaultCurrency!: string;
}

export class StoreGarmentPreviewSettingsResponseDto {
  platformGarmentPreviewEnabled!: boolean;
  storeHasGarmentPreviewPermission!: boolean;
  storeGarmentPreviewEnabled!: boolean;
  effectiveGarmentPreviewEnabled!: boolean;
}
