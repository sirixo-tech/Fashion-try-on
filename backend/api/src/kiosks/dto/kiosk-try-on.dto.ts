import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

import type { SelfxTryOnRunStatus, TryOnLabErrorCode } from "@selfx/shared";

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
