import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { ImpersonationSessionStatus } from "@prisma/client";
import { IsOptional, IsUUID } from "class-validator";

export class StoreImpersonationSessionDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  actorUserId!: string;

  @ApiProperty()
  targetStoreId!: string;

  @ApiProperty()
  targetStoreName!: string;

  @ApiProperty()
  targetStoreSlug!: string;

  @ApiProperty({ enum: ImpersonationSessionStatus })
  status!: ImpersonationSessionStatus;

  @ApiProperty()
  startedAt!: string;

  @ApiProperty()
  expiresAt!: string;

  @ApiPropertyOptional({ nullable: true })
  endedAt!: string | null;
}

export class StoreImpersonationSessionResponseDto {
  @ApiProperty({ type: StoreImpersonationSessionDto })
  session!: StoreImpersonationSessionDto;
}

export class CurrentStoreImpersonationSessionResponseDto {
  @ApiPropertyOptional({ type: StoreImpersonationSessionDto, nullable: true })
  session!: StoreImpersonationSessionDto | null;
}

export class CurrentStoreImpersonationQueryDto {
  @IsOptional()
  @IsUUID()
  sessionId?: string;
}
