import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { ImpersonationSessionStatus } from "@prisma/client";
import { IsIn, IsOptional, IsUUID } from "class-validator";

export class StartStoreImpersonationDto {
  @ApiProperty({ enum: ["store-admin", "staff"] })
  @IsIn(["store-admin", "staff"])
  effectiveRoleCode!: "store-admin" | "staff";
}

export class StoreImpersonationSessionDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  actorUserId!: string | null;

  @ApiProperty()
  targetStoreId!: string;

  @ApiProperty()
  targetStoreName!: string;

  @ApiProperty()
  targetStoreSlug!: string;

  @ApiProperty({ enum: ["store-admin", "staff"] })
  effectiveRoleCode!: string;

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
