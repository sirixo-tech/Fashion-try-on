import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from "class-validator";

export const loginPageMediaTypes = ["VIDEO", "IMAGE", "GIF"] as const;

export type LoginPageMediaType = (typeof loginPageMediaTypes)[number];

export class LoginPageCardDto {
  @ApiProperty()
  @IsString()
  @MaxLength(48)
  title!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(120)
  description!: string;
}

export class LoginPageSettingsResponseDto {
  @ApiProperty()
  eyebrow!: string;

  @ApiProperty()
  headline!: string;

  @ApiProperty()
  body!: string;

  @ApiProperty({ enum: loginPageMediaTypes })
  mediaType!: LoginPageMediaType;

  @ApiProperty()
  mediaUrl!: string;

  @ApiPropertyOptional({ nullable: true })
  mediaPosterUrl!: string | null;

  @ApiProperty()
  mediaMuted!: boolean;

  @ApiProperty({ type: [LoginPageCardDto] })
  cards!: LoginPageCardDto[];

  @ApiProperty({ type: [String] })
  bullets!: string[];
}

export class UpdateLoginPageSettingsDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  eyebrow?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  headline?: string;

  @IsOptional()
  @IsString()
  @MaxLength(260)
  body?: string;

  @IsOptional()
  @IsIn(loginPageMediaTypes)
  mediaType?: LoginPageMediaType;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  mediaUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  mediaPosterUrl?: string | null;

  @IsOptional()
  @IsBoolean()
  mediaMuted?: boolean;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(2)
  @ValidateNested({ each: true })
  @Type(() => LoginPageCardDto)
  cards?: LoginPageCardDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(4)
  @IsString({ each: true })
  bullets?: string[];
}
