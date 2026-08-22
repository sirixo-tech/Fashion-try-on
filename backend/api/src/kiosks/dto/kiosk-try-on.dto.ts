import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

import type {
  SelfxTryOnAssetPurpose,
  SelfxTryOnRunStatus,
  SelfxTryOnSessionStatus,
  TryOnLabErrorCode,
} from "@selfx/shared";

export class KioskTryOnRunResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ enum: ["QUEUED", "PROCESSING", "COMPLETED", "FAILED"] })
  status!: SelfxTryOnRunStatus;

  @ApiProperty()
  createdAt!: string;

  @ApiProperty()
  updatedAt!: string;

  @ApiPropertyOptional()
  resultImage?: string;

  @ApiPropertyOptional()
  errorCode?: TryOnLabErrorCode;

  @ApiPropertyOptional()
  errorMessage?: string;
}

export class KioskTryOnSessionResponseDto {
  @ApiProperty()
  sessionId!: string;

  @ApiProperty({ enum: ["ACTIVE", "COMPLETED", "EXPIRED"] })
  status!: SelfxTryOnSessionStatus;

  @ApiProperty()
  createdAt!: string;

  @ApiProperty()
  updatedAt!: string;

  @ApiProperty()
  expiresAt!: string;

  @ApiPropertyOptional()
  currentPersonAssetId?: string;
}

export class KioskTryOnAssetResponseDto {
  @ApiProperty()
  assetId!: string;

  @ApiProperty({ enum: ["PERSON", "GARMENT", "RESULT"] })
  purpose!: SelfxTryOnAssetPurpose;

  @ApiProperty()
  contentType!: string;

  @ApiProperty()
  sizeBytes!: number;

  @ApiProperty()
  width!: number;

  @ApiProperty()
  height!: number;

  @ApiProperty()
  expiresAt!: string;
}

export class KioskTryOnLookResponseDto {
  @ApiProperty()
  lookId!: string;

  @ApiProperty()
  runId!: string;

  @ApiProperty()
  personAssetId!: string;

  @ApiPropertyOptional()
  garmentAssetId?: string;

  @ApiPropertyOptional()
  productId?: string;

  @ApiProperty()
  resultAssetId!: string;

  @ApiProperty()
  resultReadUrl!: string;

  @ApiProperty()
  createdAt!: string;

  @ApiProperty()
  expiresAt!: string;
}

export class KioskTryOnLooksResponseDto {
  @ApiProperty({ type: [KioskTryOnLookResponseDto] })
  data!: KioskTryOnLookResponseDto[];
}

export class KioskTryOnShareResponseDto {
  @ApiProperty()
  shareUrl!: string;

  @ApiProperty()
  expiresAt!: string;
}

export class PublicTryOnShareLookDto {
  @ApiProperty()
  lookId!: string;

  @ApiProperty()
  imageReadUrl!: string;

  @ApiProperty()
  createdAt!: string;

  @ApiProperty()
  expiresAt!: string;

  @ApiPropertyOptional()
  productName?: string;
}

export class PublicTryOnShareResponseDto {
  @ApiProperty()
  expiresAt!: string;

  @ApiProperty()
  serverTime!: string;

  @ApiProperty({ type: [PublicTryOnShareLookDto] })
  looks!: PublicTryOnShareLookDto[];
}
