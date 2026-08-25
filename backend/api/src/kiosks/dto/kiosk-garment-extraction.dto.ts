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
    enum: ["AUTO", "TOP", "BOTTOM", "ONE_PIECE", "FULL_OUTFIT"],
    description: "Garment intent used for preview and Try-On.",
  })
  garmentIntent!: "AUTO" | "TOP" | "BOTTOM" | "ONE_PIECE" | "FULL_OUTFIT";
}
