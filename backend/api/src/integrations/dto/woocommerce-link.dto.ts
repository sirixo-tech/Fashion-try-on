import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsString, IsUUID, Matches, MaxLength } from "class-validator";

export class CreateWooCommerceLinkSessionDto {
  @ApiProperty()
  @IsString()
  @MaxLength(500)
  siteUrl!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(500)
  adminUrl!: string;

  @ApiProperty()
  @Matches(/^[A-Za-z0-9_-]{43}$/)
  linkToken!: string;

  @ApiProperty()
  @Matches(/^[A-Za-z0-9_-]{43}$/)
  redeemSecret!: string;
}

export class ApproveWooCommerceLinkSessionDto {
  @ApiProperty()
  @IsUUID()
  storeId!: string;
}

export class WooCommerceLinkDetailsDto {
  @ApiProperty()
  status!: "PENDING" | "APPROVED" | "REDEEMED";
  @ApiProperty()
  siteUrl!: string;
  @ApiProperty()
  adminUrl!: string;
  @ApiPropertyOptional({ nullable: true })
  storeId!: string | null;
  @ApiPropertyOptional({ nullable: true })
  storeName!: string | null;
  @ApiProperty()
  expiresAt!: string;
}

export class WooCommerceLinkCreatedDto {
  @ApiProperty()
  approvalUrl!: string;
  @ApiProperty()
  expiresAt!: string;
}

export class WooCommerceLinkRedeemedDto {
  @ApiProperty()
  status!: "LINKED";
  @ApiProperty()
  siteUrl!: string;
  @ApiProperty()
  storeId!: string;
  @ApiProperty()
  storeName!: string;
  @ApiProperty()
  integrationId!: string;
  @ApiProperty()
  integrationToken!: string;
}
