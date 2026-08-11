import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsBoolean,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from "class-validator";

export class CreateActivationRequirementDto {
  @ApiProperty({ example: "PRICING_APPROVAL" })
  @IsString()
  @MaxLength(120)
  @Matches(/^[A-Z0-9_]+$/)
  code!: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  required?: boolean;

  @ApiPropertyOptional({
    description:
      "Safe metadata only. Do not include secrets or document bytes.",
    type: Object,
  })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class RequirementDecisionDto {
  @ApiPropertyOptional({
    description:
      "Safe metadata only. Do not include secrets or document bytes.",
    type: Object,
  })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
