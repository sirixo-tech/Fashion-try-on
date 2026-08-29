import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export const publicApiUploadPurposeOptions = ["PERSON", "GARMENT"] as const;
export type PublicApiUploadPurpose =
  (typeof publicApiUploadPurposeOptions)[number];

export class PublicApiUploadRequestDto {
  @ApiProperty({
    enum: publicApiUploadPurposeOptions,
    example: "PERSON",
    description:
      "Upload purpose. PERSON starts or updates the session person image; GARMENT adds a garment input.",
  })
  purpose!: PublicApiUploadPurpose;

  @ApiPropertyOptional({
    description:
      "Existing Try-On session ID. Omit to create a new Store-scoped session.",
    example: "0198a9b3-d0bc-7000-8000-000000000101",
  })
  sessionId?: string;

  @ApiProperty({
    type: "string",
    format: "binary",
    description: "JPEG, PNG or WebP image.",
  })
  image!: unknown;
}

export class PublicApiUploadResponseDto {
  @ApiProperty({ example: "0198a9b3-d0bc-7000-8000-000000000101" })
  sessionId!: string;

  @ApiProperty({ example: "0198a9b3-d0bc-7000-8000-000000000201" })
  assetId!: string;

  @ApiProperty({ enum: publicApiUploadPurposeOptions, example: "PERSON" })
  purpose!: PublicApiUploadPurpose;

  @ApiProperty({ example: "image/png" })
  contentType!: string;

  @ApiProperty({ example: 245120 })
  sizeBytes!: number;

  @ApiProperty({ example: 1080 })
  width!: number;

  @ApiProperty({ example: 1440 })
  height!: number;

  @ApiProperty({ example: "2026-09-05T12:00:00.000Z" })
  expiresAt!: string;

  @ApiProperty({ example: "2026-08-29T12:00:00.000Z" })
  serverTime!: string;
}
