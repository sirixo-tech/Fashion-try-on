import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";

import { PrismaService } from "../database/prisma.service.js";
import {
  PLATFORM_IMAGE_UPLOAD_HARD_MAX_BYTES,
  PLATFORM_VIDEO_UPLOAD_HARD_MAX_BYTES,
} from "../kiosks/kiosk.constants.js";
import {
  type ImageUploadLimitMb,
  type MediaUploadSettingsResponseDto,
  type UpdateMediaUploadSettingsDto,
  type VideoUploadLimitMb,
  imageUploadLimitMbOptions,
  videoUploadLimitMbOptions,
} from "./dto/media-upload-settings.dto.js";

export const MEDIA_UPLOAD_SETTINGS_KEY = "platform.media_upload_limits";

const bytesPerMb = 1024 * 1024;

const defaultMediaUploadSettings = {
  captureImageMaxMb: 10,
  presentationImageMaxMb: 12,
  presentationVideoMaxMb: 80,
} satisfies UpdateMediaUploadSettingsDto;

@Injectable()
export class MediaUploadSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async getSettings(): Promise<MediaUploadSettingsResponseDto> {
    const rows = await this.prisma.$queryRaw<Array<{ value: unknown }>>`
      SELECT "value"
      FROM platform_settings
      WHERE "key" = ${MEDIA_UPLOAD_SETTINGS_KEY}
      LIMIT 1
    `;
    return mediaUploadSettingsFromValue(rows[0]?.value);
  }

  async updateSettings(
    input: UpdateMediaUploadSettingsDto,
  ): Promise<MediaUploadSettingsResponseDto> {
    const next = sanitizeMediaUploadSettings(input);
    await this.prisma.$executeRaw`
      INSERT INTO platform_settings ("key", "value")
      VALUES (${MEDIA_UPLOAD_SETTINGS_KEY}, ${JSON.stringify(next)}::jsonb)
      ON CONFLICT ("key") DO UPDATE SET
        "value" = EXCLUDED."value",
        "updated_at" = CURRENT_TIMESTAMP
    `;
    return toResponse(next);
  }

  async resolveCaptureImageMaxBytes(): Promise<number> {
    const settings = await this.getSettings();
    return settings.captureImageMaxBytes;
  }

  async resolvePresentationUploadLimits(): Promise<{
    maxImageBytes: number;
    maxVideoBytes: number;
  }> {
    const settings = await this.getSettings();
    return {
      maxImageBytes: settings.presentationImageMaxBytes,
      maxVideoBytes: settings.presentationVideoMaxBytes,
    };
  }
}

function mediaUploadSettingsFromValue(
  value: unknown,
): MediaUploadSettingsResponseDto {
  return toResponse(
    sanitizeMediaUploadSettings({
      ...defaultMediaUploadSettings,
      ...(isRecord(value) ? value : {}),
    }),
  );
}

function sanitizeMediaUploadSettings(value: {
  captureImageMaxMb?: unknown;
  presentationImageMaxMb?: unknown;
  presentationVideoMaxMb?: unknown;
}): UpdateMediaUploadSettingsDto {
  return {
    captureImageMaxMb: cleanImageMb(
      value.captureImageMaxMb,
      defaultMediaUploadSettings.captureImageMaxMb,
    ),
    presentationImageMaxMb: cleanImageMb(
      value.presentationImageMaxMb,
      defaultMediaUploadSettings.presentationImageMaxMb,
    ),
    presentationVideoMaxMb: cleanVideoMb(value.presentationVideoMaxMb),
  };
}

function cleanImageMb(
  value: unknown,
  fallback: ImageUploadLimitMb,
): ImageUploadLimitMb {
  const numeric = typeof value === "number" ? value : Number(value);
  return imageUploadLimitMbOptions.includes(numeric as ImageUploadLimitMb)
    ? (numeric as ImageUploadLimitMb)
    : fallback;
}

function cleanVideoMb(value: unknown): VideoUploadLimitMb {
  const numeric = typeof value === "number" ? value : Number(value);
  return videoUploadLimitMbOptions.includes(numeric as VideoUploadLimitMb)
    ? (numeric as VideoUploadLimitMb)
    : defaultMediaUploadSettings.presentationVideoMaxMb;
}

function toResponse(
  value: UpdateMediaUploadSettingsDto,
): MediaUploadSettingsResponseDto {
  return {
    captureImageMaxMb: value.captureImageMaxMb,
    captureImageMaxBytes: mbToBytes(value.captureImageMaxMb),
    presentationImageMaxMb: value.presentationImageMaxMb,
    presentationImageMaxBytes: mbToBytes(value.presentationImageMaxMb),
    presentationVideoMaxMb: value.presentationVideoMaxMb,
    presentationVideoMaxBytes: mbToBytes(value.presentationVideoMaxMb),
    imageHardMaxBytes: PLATFORM_IMAGE_UPLOAD_HARD_MAX_BYTES,
    videoHardMaxBytes: PLATFORM_VIDEO_UPLOAD_HARD_MAX_BYTES,
  };
}

function mbToBytes(value: number): number {
  return value * bytesPerMb;
}

function isRecord(value: unknown): value is Record<string, Prisma.JsonValue> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
