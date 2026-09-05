import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsIn } from "class-validator";

import {
  SELFX_JEWELLERY_CAPTURE_CHANNELS,
  SELFX_JEWELLERY_CAPTURE_GUIDES,
  SELFX_JEWELLERY_CAPTURE_TARGET_REGIONS,
  SELFX_JEWELLERY_PERSON_CHECKS,
  SELFX_JEWELLERY_PERSON_INPUT_METHODS,
  SELFX_JEWELLERY_TYPES,
  type SelfxJewelleryCaptureChannel,
  type SelfxJewelleryCaptureGuide,
  type SelfxJewelleryCaptureTargetRegion,
  type SelfxJewelleryPersonCheck,
  type SelfxJewelleryPersonInputMethod,
  type SelfxJewelleryType,
} from "@selfx/shared";

export class JewelleryCaptureRequirementsParamsDto {
  @IsIn(SELFX_JEWELLERY_TYPES)
  jewelleryType!: SelfxJewelleryType;
}

export class JewelleryCaptureRequirementsResponseDto {
  @ApiProperty({ enum: [1] })
  schemaVersion!: 1;

  @ApiProperty({ enum: ["JEWELLERY"] })
  tryOnVertical!: "JEWELLERY";

  @ApiProperty({ enum: SELFX_JEWELLERY_TYPES })
  jewelleryType!: SelfxJewelleryType;

  @ApiProperty({ enum: SELFX_JEWELLERY_CAPTURE_CHANNELS })
  channel!: SelfxJewelleryCaptureChannel;

  @ApiPropertyOptional()
  productId?: string;

  @ApiProperty({ enum: SELFX_JEWELLERY_PERSON_INPUT_METHODS, isArray: true })
  personInputMethods!: SelfxJewelleryPersonInputMethod[];

  @ApiProperty({ enum: SELFX_JEWELLERY_CAPTURE_TARGET_REGIONS })
  targetRegion!: SelfxJewelleryCaptureTargetRegion;

  @ApiProperty({ enum: SELFX_JEWELLERY_CAPTURE_GUIDES })
  guide!: SelfxJewelleryCaptureGuide;

  @ApiProperty()
  title!: string;

  @ApiProperty()
  instruction!: string;

  @ApiProperty({ type: [String] })
  checklist!: string[];

  @ApiProperty({ enum: SELFX_JEWELLERY_PERSON_CHECKS, isArray: true })
  requiredChecks!: SelfxJewelleryPersonCheck[];
}
