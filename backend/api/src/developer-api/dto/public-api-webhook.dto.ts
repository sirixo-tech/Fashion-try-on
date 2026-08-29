import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
} from "class-validator";

export const publicApiWebhookEventOptions = [
  "try_on.completed",
  "try_on.failed",
] as const;
export type PublicApiWebhookEvent =
  (typeof publicApiWebhookEventOptions)[number];

export const publicApiWebhookStatusOptions = ["ACTIVE", "DISABLED"] as const;
export type PublicApiWebhookStatus =
  (typeof publicApiWebhookStatusOptions)[number];

export class CreatePublicApiWebhookEndpointDto {
  @ApiProperty({
    example: "https://merchant.example.com/selfx/webhooks",
    description: "HTTPS endpoint that receives signed SelfX webhook events.",
  })
  @IsString()
  @MaxLength(2048)
  @IsUrl({ protocols: ["https"], require_protocol: true })
  url!: string;

  @ApiPropertyOptional({
    enum: publicApiWebhookEventOptions,
    isArray: true,
    example: ["try_on.completed", "try_on.failed"],
    description: "Omit to subscribe to all currently supported events.",
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(publicApiWebhookEventOptions.length)
  @IsIn(publicApiWebhookEventOptions, { each: true })
  subscribedEvents?: PublicApiWebhookEvent[];
}

export class UpdatePublicApiWebhookEndpointDto {
  @ApiPropertyOptional({
    example: "https://merchant.example.com/selfx/webhooks",
  })
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  @IsUrl({ protocols: ["https"], require_protocol: true })
  url?: string;

  @ApiPropertyOptional({
    enum: publicApiWebhookEventOptions,
    isArray: true,
    example: ["try_on.completed"],
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(publicApiWebhookEventOptions.length)
  @IsIn(publicApiWebhookEventOptions, { each: true })
  subscribedEvents?: PublicApiWebhookEvent[];

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

export class PublicApiWebhookEndpointDto {
  @ApiProperty({ example: "0198a9b3-d0bc-7000-8000-000000000501" })
  id!: string;

  @ApiProperty({ example: "https://merchant.example.com/selfx/webhooks" })
  url!: string;

  @ApiProperty({ enum: publicApiWebhookStatusOptions, example: "ACTIVE" })
  status!: PublicApiWebhookStatus;

  @ApiProperty({
    enum: publicApiWebhookEventOptions,
    isArray: true,
    example: ["try_on.completed", "try_on.failed"],
  })
  subscribedEvents!: PublicApiWebhookEvent[];

  @ApiProperty({ example: "2026-08-29T12:00:00.000Z" })
  createdAt!: string;

  @ApiProperty({ example: "2026-08-29T12:00:00.000Z" })
  updatedAt!: string;
}

export class CreatePublicApiWebhookEndpointResponseDto extends PublicApiWebhookEndpointDto {
  @ApiProperty({
    example: "whsec_DyYz6psXVO2u-SelfXExampleSecret",
    description:
      "Webhook signing secret. It is returned only once when the endpoint is created.",
  })
  secret!: string;
}

export class PublicApiWebhookEndpointListResponseDto {
  @ApiProperty({ type: [PublicApiWebhookEndpointDto] })
  data!: PublicApiWebhookEndpointDto[];
}
