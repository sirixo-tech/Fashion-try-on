import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

import {
  SELFX_JEWELLERY_TYPES,
  SELFX_TRY_ON_CHANNELS,
  SELFX_TRY_ON_RUN_STATUSES,
  type JewelleryTryOnLabTelemetry,
  type SelfxJewelleryType,
  type SelfxTryOnChannel,
  type SelfxTryOnRunStatus,
  type TryOnLabErrorCode,
} from "@selfx/shared";

export class JewelleryTryOnLabProductReferenceDto {
  @ApiPropertyOptional()
  productId?: string;

  @ApiPropertyOptional()
  productName?: string;

  @ApiPropertyOptional()
  sku?: string;
}

export class JewelleryTryOnLabTelemetryDto {
  @ApiProperty()
  selfxRunId!: string;

  @ApiProperty({ enum: SELFX_TRY_ON_CHANNELS })
  channel!: SelfxTryOnChannel;

  @ApiProperty()
  provider!: string;

  @ApiProperty()
  providerDisplayName!: string;

  @ApiProperty()
  model!: string;

  @ApiProperty({ enum: SELFX_JEWELLERY_TYPES })
  jewelleryType!: SelfxJewelleryType;

  @ApiPropertyOptional({ type: JewelleryTryOnLabProductReferenceDto })
  productReference?: JewelleryTryOnLabTelemetry["productReference"];

  @ApiProperty()
  createdAt!: string;

  @ApiPropertyOptional()
  startedAt?: string;

  @ApiPropertyOptional()
  completedAt?: string;

  @ApiPropertyOptional()
  elapsedMs?: number;

  @ApiProperty({ enum: SELFX_TRY_ON_RUN_STATUSES })
  status!: SelfxTryOnRunStatus;

  @ApiPropertyOptional()
  failureCode?: TryOnLabErrorCode;
}

export class JewelleryTryOnLabRunResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ enum: SELFX_TRY_ON_RUN_STATUSES })
  status!: SelfxTryOnRunStatus;

  @ApiProperty({ enum: ["JEWELLERY"] })
  tryOnVertical!: "JEWELLERY";

  @ApiProperty({ enum: SELFX_JEWELLERY_TYPES })
  jewelleryType!: SelfxJewelleryType;

  @ApiPropertyOptional({ type: JewelleryTryOnLabProductReferenceDto })
  productReference?: JewelleryTryOnLabProductReferenceDto;

  @ApiProperty()
  createdAt!: string;

  @ApiProperty()
  updatedAt!: string;

  @ApiPropertyOptional({
    description:
      "Ephemeral development-lab output. Base64 or URL is returned only when the provider supplies it.",
  })
  resultImage?: string;

  @ApiPropertyOptional()
  errorCode?: TryOnLabErrorCode;

  @ApiPropertyOptional()
  errorMessage?: string;

  @ApiProperty({ type: JewelleryTryOnLabTelemetryDto })
  telemetry!: JewelleryTryOnLabTelemetryDto;
}
