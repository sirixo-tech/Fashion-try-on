import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from "class-validator";

export class CreateOrganizationApplicationDto {
  @ApiProperty({ example: "SelfX Demo Retail" })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  organizationName!: string;

  @ApiProperty({ example: "selfx-demo-retail" })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  slug!: string;

  @ApiPropertyOptional({ example: "Asia/Kolkata" })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  timezone?: string;

  @ApiPropertyOptional({
    description: "Safe, non-secret onboarding metadata.",
    type: Object,
  })
  @IsOptional()
  @IsObject()
  businessMetadata?: Record<string, unknown>;
}
