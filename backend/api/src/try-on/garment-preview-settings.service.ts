import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";

import { PrismaService } from "../database/prisma.service.js";
import { STORE_PERMISSION_CODES } from "../rbac/store-permissions.js";

export const GARMENT_PREVIEW_PLATFORM_SETTING_KEY =
  "tryon.garment_preview.platform_enabled";

export type GarmentPreviewPlatformSettingsDto = {
  garmentPreviewEnabled: boolean;
};

export type StoreGarmentPreviewSettingsDto = {
  platformGarmentPreviewEnabled: boolean;
  storeHasGarmentPreviewPermission: boolean;
  storeGarmentPreviewEnabled: boolean;
  effectiveGarmentPreviewEnabled: boolean;
};

@Injectable()
export class GarmentPreviewSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async getPlatformSettings(): Promise<GarmentPreviewPlatformSettingsDto> {
    return {
      garmentPreviewEnabled: await this.platformGarmentPreviewEnabled(),
    };
  }

  async updatePlatformSettings(
    enabled: boolean,
  ): Promise<GarmentPreviewPlatformSettingsDto> {
    await this.prisma.$executeRaw`
      INSERT INTO platform_settings ("key", "value")
      VALUES (
        ${GARMENT_PREVIEW_PLATFORM_SETTING_KEY},
        ${JSON.stringify({ garmentPreviewEnabled: enabled })}::jsonb
      )
      ON CONFLICT ("key") DO UPDATE SET
        "value" = EXCLUDED."value",
        "updated_at" = CURRENT_TIMESTAMP
    `;
    return { garmentPreviewEnabled: enabled };
  }

  async storeSettings(
    storeId: string,
  ): Promise<StoreGarmentPreviewSettingsDto> {
    const [
      platformGarmentPreviewEnabled,
      storeHasGarmentPreviewPermission,
      storeGarmentPreviewEnabled,
    ] = await Promise.all([
      this.platformGarmentPreviewEnabled(),
      this.storeHasGarmentPreviewPermission(storeId),
      this.storeGarmentPreviewEnabled(storeId),
    ]);
    return this.resolve({
      platformGarmentPreviewEnabled,
      storeHasGarmentPreviewPermission,
      storeGarmentPreviewEnabled,
    });
  }

  async resolveGarmentPreviewEnabled(storeId: string | null): Promise<boolean> {
    if (!storeId) {
      return false;
    }
    return (await this.storeSettings(storeId)).effectiveGarmentPreviewEnabled;
  }

  async storeGarmentPreviewEnabled(storeId: string): Promise<boolean> {
    const store = await this.prisma.organization.findUnique({
      where: { id: storeId },
      select: { settings: true },
    });
    return storeGarmentPreviewEnabledFromSettings(store?.settings);
  }

  async storeHasGarmentPreviewPermission(storeId: string): Promise<boolean> {
    const grant = await this.prisma.storePermissionGrant.findFirst({
      where: {
        storeTenantId: storeId,
        permission: { code: STORE_PERMISSION_CODES.tryOnGarmentPreview },
      },
      select: { id: true },
    });
    return grant != null;
  }

  storeSettingsFromValue(
    settings: Prisma.JsonValue | null | undefined,
    enabled: boolean,
  ): Prisma.InputJsonValue {
    const base = isRecord(settings) ? settings : {};
    const currentTryOn = isRecord(base.virtualTryOn) ? base.virtualTryOn : {};
    return {
      ...base,
      virtualTryOn: {
        ...currentTryOn,
        capturedGarmentPreviewEnabled: enabled,
      },
    } as Prisma.InputJsonValue;
  }

  resolve(input: {
    platformGarmentPreviewEnabled: boolean;
    storeHasGarmentPreviewPermission: boolean;
    storeGarmentPreviewEnabled: boolean;
  }): StoreGarmentPreviewSettingsDto {
    return {
      ...input,
      effectiveGarmentPreviewEnabled:
        input.platformGarmentPreviewEnabled &&
        input.storeHasGarmentPreviewPermission &&
        input.storeGarmentPreviewEnabled,
    };
  }

  private async platformGarmentPreviewEnabled(): Promise<boolean> {
    const rows = await this.prisma.$queryRaw<Array<{ value: unknown }>>`
      SELECT "value"
      FROM platform_settings
      WHERE "key" = ${GARMENT_PREVIEW_PLATFORM_SETTING_KEY}
      LIMIT 1
    `;
    const [row] = rows;
    if (!row) {
      return true;
    }
    return garmentPreviewEnabledFromPlatformSetting(row.value);
  }
}

function garmentPreviewEnabledFromPlatformSetting(value: unknown): boolean {
  if (!isRecord(value)) {
    return true;
  }
  return typeof value.garmentPreviewEnabled === "boolean"
    ? value.garmentPreviewEnabled
    : true;
}

function storeGarmentPreviewEnabledFromSettings(
  settings: Prisma.JsonValue | null | undefined,
): boolean {
  if (!isRecord(settings) || !isRecord(settings.virtualTryOn)) {
    return false;
  }
  return settings.virtualTryOn.capturedGarmentPreviewEnabled === true;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
