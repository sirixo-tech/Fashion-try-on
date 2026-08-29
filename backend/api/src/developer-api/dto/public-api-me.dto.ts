import { ApiProperty } from "@nestjs/swagger";

import {
  type ApiKeyEnvironment,
  type ApiKeyScope,
  apiKeyEnvironmentOptions,
  apiKeyScopeOptions,
} from "./developer-api-key.dto.js";

export class PublicApiStoreContextDto {
  @ApiProperty({ example: "0198a9b3-d0bc-7000-8000-000000000001" })
  id!: string;

  @ApiProperty({ example: "Demo Store" })
  name!: string;
}

export class PublicApiMeResponseDto {
  @ApiProperty({ example: true })
  authenticated!: true;

  @ApiProperty({ example: "selfx_test_abcd1234" })
  keyPrefix!: string;

  @ApiProperty({ enum: apiKeyEnvironmentOptions, example: "TEST" })
  environment!: ApiKeyEnvironment;

  @ApiProperty({
    enum: apiKeyScopeOptions,
    isArray: true,
    example: ["tryon:create", "tryon:read", "usage:read"],
  })
  scopes!: ApiKeyScope[];

  @ApiProperty({ type: PublicApiStoreContextDto })
  store!: PublicApiStoreContextDto;

  @ApiProperty({ example: "2026-08-29T12:00:00.000Z" })
  serverTime!: string;
}
