import { IsBoolean } from "class-validator";

export class UpdateGarmentPreviewSettingsDto {
  @IsBoolean()
  garmentPreviewEnabled!: boolean;
}

export class GarmentPreviewPlatformSettingsResponseDto {
  garmentPreviewEnabled!: boolean;
}

export class StoreGarmentPreviewSettingsResponseDto {
  platformGarmentPreviewEnabled!: boolean;
  storeHasGarmentPreviewPermission!: boolean;
  storeGarmentPreviewEnabled!: boolean;
  effectiveGarmentPreviewEnabled!: boolean;
}

