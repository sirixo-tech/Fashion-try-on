import { ApiProperty } from "@nestjs/swagger";
import { IsIn } from "class-validator";

export const imageUploadLimitMbOptions = [10, 12, 15, 25, 50] as const;
export const videoUploadLimitMbOptions = [50, 80, 100, 150] as const;

export type ImageUploadLimitMb = (typeof imageUploadLimitMbOptions)[number];
export type VideoUploadLimitMb = (typeof videoUploadLimitMbOptions)[number];

export class MediaUploadSettingsResponseDto {
  @ApiProperty({ enum: imageUploadLimitMbOptions })
  captureImageMaxMb!: ImageUploadLimitMb;

  @ApiProperty()
  captureImageMaxBytes!: number;

  @ApiProperty({ enum: imageUploadLimitMbOptions })
  presentationImageMaxMb!: ImageUploadLimitMb;

  @ApiProperty()
  presentationImageMaxBytes!: number;

  @ApiProperty({ enum: videoUploadLimitMbOptions })
  presentationVideoMaxMb!: VideoUploadLimitMb;

  @ApiProperty()
  presentationVideoMaxBytes!: number;

  @ApiProperty()
  imageHardMaxBytes!: number;

  @ApiProperty()
  videoHardMaxBytes!: number;
}

export class UpdateMediaUploadSettingsDto {
  @IsIn(imageUploadLimitMbOptions)
  captureImageMaxMb!: ImageUploadLimitMb;

  @IsIn(imageUploadLimitMbOptions)
  presentationImageMaxMb!: ImageUploadLimitMb;

  @IsIn(videoUploadLimitMbOptions)
  presentationVideoMaxMb!: VideoUploadLimitMb;
}
