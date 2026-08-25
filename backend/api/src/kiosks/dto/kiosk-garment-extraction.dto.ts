import { ApiProperty } from "@nestjs/swagger";

export class KioskGarmentExtractionResponseDto {
  @ApiProperty({
    description: "Extracted garment preview as a data URI.",
    example: "data:image/png;base64,...",
  })
  imageDataUri!: string;

  @ApiProperty({ example: "image/png" })
  mimeType!: "image/png";

  @ApiProperty({
    enum: ["TOP", "BOTTOM", "ONE_PIECE", "FULL_OUTFIT"],
    description: "Resolved garment intent used for preview and Try-On.",
  })
  garmentIntent!: "TOP" | "BOTTOM" | "ONE_PIECE" | "FULL_OUTFIT";
}
