import { isIP } from "node:net";

import { HttpStatus, Injectable } from "@nestjs/common";
import {
  KioskConfigurationAssetType,
  KioskConfigurationGarmentIntent,
  KioskConfigurationSoundProfile,
  KioskDeviceStatus,
  KioskIdleMode,
  type KioskDeviceConfiguration,
  type KioskDeviceConfigurationAsset,
} from "@prisma/client";

import { createSelfxId } from "@selfx/database";

import { ApiErrorException } from "../common/api-error.exception.js";
import { PrismaService } from "../database/prisma.service.js";
import { MediaUploadSettingsService } from "../platform/media-upload-settings.service.js";
import { ObjectStorageService } from "../storage/object-storage.js";
import { GarmentPreviewSettingsService } from "../try-on/garment-preview-settings.service.js";
import {
  type CreateKioskConfigurationAssetUploadDto,
  type KioskCatalogSyncResponseDto,
  type KioskConfigurationAssetUploadIntentDto,
  type KioskConfigurationDto,
  type UpdateKioskConfigurationDto,
} from "./dto/kiosk.dto.js";
import {
  KIOSK_AUDIT_ACTIONS,
  KIOSK_ERROR_CODES,
  KIOSK_PRESENTATION_DEFAULT_MAX_IMAGE_BYTES,
  KIOSK_PRESENTATION_DEFAULT_MAX_VIDEO_BYTES,
} from "./kiosk.constants.js";
import { KioskService } from "./kiosk.service.js";

const fallbackBundledAssetKey = "selfx-default-kiosk-video";
const fallbackBundledImageAssetKey = "selfx-default-kiosk-wallpaper";
const allowedBundledAssetKeys = new Set([
  fallbackBundledAssetKey,
  fallbackBundledImageAssetKey,
]);
const allowedAssetTypes = new Set(Object.values(KioskConfigurationAssetType));
const allowedIdleModes = new Set(Object.values(KioskIdleMode));
const allowedSoundProfiles = new Set(
  Object.values(KioskConfigurationSoundProfile),
);
const allowedIntents = new Set(Object.values(KioskConfigurationGarmentIntent));
const defaultIntents = [
  KioskConfigurationGarmentIntent.TOP,
  KioskConfigurationGarmentIntent.BOTTOM,
  KioskConfigurationGarmentIntent.FULL_OUTFIT,
];
const supportedUploadContentTypes = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "video/mp4",
] as const;
const supportedUploadContentTypeSet = new Set<string>(
  supportedUploadContentTypes,
);
const uploadIntentTtlSeconds = 300;
const readUrlTtlSeconds = 900;

type ConfigurationWithAssets = KioskDeviceConfiguration & {
  assets: KioskDeviceConfigurationAsset[];
};

@Injectable()
export class KioskConfigurationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly kiosks: KioskService,
    private readonly storage: ObjectStorageService,
    private readonly garmentPreviewSettings: GarmentPreviewSettingsService,
    private readonly mediaUploadSettings: MediaUploadSettingsService,
  ) {}

  async getAdminConfiguration(
    deviceId: string,
  ): Promise<KioskConfigurationDto> {
    await this.requireManageableDevice(deviceId);
    const configuration = await this.prisma.kioskDeviceConfiguration.findUnique(
      {
        where: { kioskDeviceId: deviceId },
        include: { assets: { orderBy: { sortOrder: "asc" } } },
      },
    );
    const storeId = await this.storeIdForDevice(deviceId);
    return this.mapConfiguration(configuration, storeId);
  }

  async createAdminAssetUploadIntent(
    deviceId: string,
    input: CreateKioskConfigurationAssetUploadDto,
  ): Promise<KioskConfigurationAssetUploadIntentDto> {
    await this.requireManageableDevice(deviceId);
    const contentType = normalizeUploadedContentType(input.contentType);
    const uploadLimits =
      await this.mediaUploadSettings.resolvePresentationUploadLimits();
    const maxBytes = maxBytesForContentType(contentType, uploadLimits);
    if (!contentType || input.sizeBytes > maxBytes) {
      throwConfigurationInvalid("Presentation asset upload is invalid.");
    }
    const objectKey = kioskConfigurationAssetObjectKeyFor(
      deviceId,
      contentType,
    );
    const now = new Date();
    return {
      assetRef: encodeAssetRef(objectKey),
      type: KioskConfigurationAssetType.UPLOADED_IMAGE,
      label: presentationAssetLabel(input.fileName, contentType),
      uploadUrl: this.storage.createUploadUrl({
        key: objectKey,
        contentType,
        expiresInSeconds: uploadIntentTtlSeconds,
      }),
      method: "PUT",
      expiresAt: new Date(
        now.getTime() + uploadIntentTtlSeconds * 1000,
      ).toISOString(),
      headers: { "Content-Type": contentType },
      maxImageBytes: uploadLimits.maxImageBytes,
      maxVideoBytes: uploadLimits.maxVideoBytes,
      supportedContentTypes: [...supportedUploadContentTypes],
    };
  }

  async updateAdminConfiguration(
    actorUserId: string,
    deviceId: string,
    input: UpdateKioskConfigurationDto,
  ): Promise<KioskConfigurationDto> {
    await this.requireManageableDevice(deviceId);
    const uploadLimits =
      await this.mediaUploadSettings.resolvePresentationUploadLimits();
    const normalized = normalizeConfigurationInput(input, deviceId, uploadLimits);
    const updated = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.kioskDeviceConfiguration.findUnique({
        where: { kioskDeviceId: deviceId },
        select: { id: true, version: true },
      });
      const configurationId = existing?.id ?? createSelfxId();
      const version = (existing?.version ?? 1) + 1;

      if (existing) {
        await tx.kioskDeviceConfigurationAsset.deleteMany({
          where: { configurationId },
        });
        await tx.kioskDeviceConfiguration.update({
          where: { id: configurationId },
          data: {
            version,
            ...normalized.data,
            updatedByUserId: actorUserId,
          },
        });
      } else {
        await tx.kioskDeviceConfiguration.create({
          data: {
            id: configurationId,
            kioskDeviceId: deviceId,
            version,
            ...normalized.data,
            updatedByUserId: actorUserId,
          },
        });
      }

      await tx.kioskDeviceConfigurationAsset.createMany({
        data: normalized.assets.map((asset, index) => ({
          id: createSelfxId(),
          configurationId,
          sortOrder: index,
          type: asset.type,
          label: asset.label,
          url: asset.url,
          bundledAssetKey: asset.bundledAssetKey,
          objectKey: asset.objectKey,
          contentType: asset.contentType,
          sizeBytes: asset.sizeBytes,
        })),
      });
      const device = await tx.kioskDevice.findUniqueOrThrow({
        where: { id: deviceId },
        select: { organizationId: true, storeId: true },
      });
      await tx.auditLog.create({
        data: {
          id: createSelfxId(),
          action: KIOSK_AUDIT_ACTIONS.configured,
          actorUserId,
          organizationId: device.organizationId,
          storeId: device.storeId,
          resourceType: "kiosk_device",
          resourceId: deviceId,
          metadata: { configurationVersion: version },
        },
      });
      return tx.kioskDeviceConfiguration.findUniqueOrThrow({
        where: { id: configurationId },
        include: { assets: { orderBy: { sortOrder: "asc" } } },
      });
    });
    const storeId = await this.storeIdForDevice(deviceId);
    return this.mapConfiguration(updated, storeId);
  }

  async requestFleetCatalogSync(
    actorUserId: string,
  ): Promise<KioskCatalogSyncResponseDto> {
    const requestedAt = new Date();
    const updatedDevices = await this.prisma.$transaction(async (tx) => {
      const devices = await tx.kioskDevice.findMany({
        where: { status: KioskDeviceStatus.ACTIVE },
        select: {
          id: true,
          organizationId: true,
          storeId: true,
          configuration: { select: { id: true, version: true } },
        },
      });
      for (const device of devices) {
        if (device.configuration) {
          await tx.kioskDeviceConfiguration.update({
            where: { id: device.configuration.id },
            data: {
              version: device.configuration.version + 1,
              updatedByUserId: actorUserId,
            },
          });
        } else {
          await tx.kioskDeviceConfiguration.create({
            data: {
              id: createSelfxId(),
              kioskDeviceId: device.id,
              version: 2,
              updatedByUserId: actorUserId,
            },
          });
        }
      }
      if (devices.length > 0) {
        await tx.auditLog.createMany({
          data: devices.map((device) => ({
            id: createSelfxId(),
            action: KIOSK_AUDIT_ACTIONS.configured,
            actorUserId,
            organizationId: device.organizationId,
            storeId: device.storeId,
            resourceType: "kiosk_device",
            resourceId: device.id,
            metadata: { catalogSyncRequestedAt: requestedAt.toISOString() },
          })),
        });
      }
      return devices.length;
    });
    return { updatedDevices, requestedAt: requestedAt.toISOString() };
  }

  async getDeviceConfiguration(
    authorization: string | undefined,
  ): Promise<KioskConfigurationDto> {
    const device = await this.kiosks.requireDevice(authorization);
    const configuration = await this.prisma.kioskDeviceConfiguration.findUnique(
      {
        where: { kioskDeviceId: device.id },
        include: { assets: { orderBy: { sortOrder: "asc" } } },
      },
    );
    return this.mapConfiguration(configuration, device.organizationId);
  }

  private async requireManageableDevice(deviceId: string): Promise<void> {
    const device = await this.prisma.kioskDevice.findUnique({
      where: { id: deviceId },
      select: { id: true, status: true },
    });
    if (!device || device.status === KioskDeviceStatus.DELETED) {
      throw new ApiErrorException(
        HttpStatus.NOT_FOUND,
        KIOSK_ERROR_CODES.deviceUnpaired,
        "Kiosk device was not found.",
      );
    }
  }

  private async storeIdForDevice(deviceId: string): Promise<string | null> {
    const device = await this.prisma.kioskDevice.findUnique({
      where: { id: deviceId },
      select: { organizationId: true },
    });
    return device?.organizationId ?? null;
  }

  private async mapConfiguration(
    configuration: ConfigurationWithAssets | null,
    storeId: string | null,
  ): Promise<KioskConfigurationDto> {
    const source = configuration ?? defaultConfiguration();
    const assets = source.assets.length > 0 ? source.assets : defaultAssets();
    const garmentPreviewEnabled =
      await this.garmentPreviewSettings.resolveGarmentPreviewEnabled(storeId);
    const [uploadLimits, captureImageMaxBytes] = await Promise.all([
      this.mediaUploadSettings.resolvePresentationUploadLimits(),
      this.mediaUploadSettings.resolveCaptureImageMaxBytes(),
    ]);
    return {
      version: source.version,
      display: {
        idleMode: source.idleMode,
        slideDurationSeconds: source.slideDurationSeconds,
        title: source.title,
        subtitle: source.subtitle,
        ctaLabel: source.ctaLabel,
        assets: assets.map((asset) => ({
          id: asset.id,
          type: asset.type,
          label: asset.label,
          url: this.assetUrl(asset),
          bundledAssetKey: asset.bundledAssetKey,
          assetRef: asset.objectKey ? encodeAssetRef(asset.objectKey) : null,
          contentType: asset.contentType,
          sizeBytes: asset.sizeBytes,
          sortOrder: asset.sortOrder,
        })),
      },
      capture: {
        countdownSeconds: source.countdownSeconds,
        soundEnabled: source.soundEnabled,
        soundProfile: source.soundProfile,
        guidanceAudioEnabled: source.guidanceAudioEnabled,
      },
      experience: {
        enabledGarmentIntents: [...source.enabledGarmentIntents],
        sessionIdleTimeoutSeconds: source.sessionIdleTimeoutSeconds,
        garmentPreviewEnabled,
      },
      assetUpload: {
        supported: true,
        maxImageBytes: uploadLimits.maxImageBytes,
        maxVideoBytes: uploadLimits.maxVideoBytes,
        supportedContentTypes: [...supportedUploadContentTypes],
      },
      captureUpload: {
        maxImageBytes: captureImageMaxBytes,
        supportedContentTypes: ["image/jpeg", "image/png", "image/webp"],
      },
      updatedAt: source.updatedAt.toISOString(),
    };
  }

  private assetUrl(asset: KioskDeviceConfigurationAsset): string | null {
    if (
      asset.type === KioskConfigurationAssetType.UPLOADED_IMAGE &&
      asset.objectKey
    ) {
      return this.storage.createReadUrl({
        key: asset.objectKey,
        expiresInSeconds: readUrlTtlSeconds,
      });
    }
    return asset.url;
  }
}

function defaultConfiguration(): ConfigurationWithAssets {
  return {
    id: "00000000-0000-0000-0000-000000000000",
    kioskDeviceId: "00000000-0000-0000-0000-000000000000",
    version: 1,
    idleMode: KioskIdleMode.STATIC,
    slideDurationSeconds: 6,
    title: "SelfX Virtual Try-On",
    subtitle: "Find your perfect fit in seconds.",
    ctaLabel: "Start Try-On",
    countdownSeconds: 10,
    soundEnabled: true,
    soundProfile: KioskConfigurationSoundProfile.SELFX_SIGNATURE,
    guidanceAudioEnabled: false,
    enabledGarmentIntents: defaultIntents,
    sessionIdleTimeoutSeconds: 120,
    updatedByUserId: null,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    assets: defaultAssets(),
  };
}

function defaultAssets(): KioskDeviceConfigurationAsset[] {
  return [
    {
      id: "selfx-default-kiosk-video",
      configurationId: "00000000-0000-0000-0000-000000000000",
      sortOrder: 0,
      type: KioskConfigurationAssetType.BUNDLED_IMAGE,
      label: "SelfX default video",
      url: null,
      bundledAssetKey: fallbackBundledAssetKey,
      objectKey: null,
      contentType: null,
      sizeBytes: null,
      createdAt: new Date(0),
    },
  ];
}

function normalizeConfigurationInput(
  input: UpdateKioskConfigurationDto,
  deviceId: string,
  uploadLimits: { maxImageBytes: number; maxVideoBytes: number },
) {
  assertEnumValue(
    allowedIdleModes,
    input.display.idleMode,
    "Idle mode is invalid.",
  );
  assertIntegerRange(
    input.display.slideDurationSeconds,
    3,
    60,
    "Slide duration must be between 3 and 60 seconds.",
  );
  assertIntegerSet(
    input.capture.countdownSeconds,
    [5, 10, 15],
    "Countdown duration is invalid.",
  );
  assertEnumValue(
    allowedSoundProfiles,
    input.capture.soundProfile,
    "Sound profile is invalid.",
  );
  assertIntegerRange(
    input.experience.sessionIdleTimeoutSeconds,
    30,
    900,
    "Session idle timeout must be between 30 and 900 seconds.",
  );
  const requestedIntents = input.experience.enabledGarmentIntents;
  if (
    requestedIntents.some((intent) => !allowedIntents.has(intent)) ||
    requestedIntents.length > 3
  ) {
    throwConfigurationInvalid("Enabled garment intents are invalid.");
  }
  const intents = unique(requestedIntents);
  if (intents.length === 0 || intents.length !== requestedIntents.length) {
    throwConfigurationInvalid(
      "Enabled garment intents must be unique and non-empty.",
    );
  }
  if (input.display.assets.length < 1 || input.display.assets.length > 12) {
    throwConfigurationInvalid(
      "Presentation assets must include 1 to 12 items.",
    );
  }
  const assets = input.display.assets.map((asset) =>
    normalizeAsset(asset, deviceId, uploadLimits),
  );
  if (input.display.idleMode === KioskIdleMode.SLIDESHOW && assets.length < 2) {
    throwConfigurationInvalid(
      "Slideshow mode requires at least two presentation assets.",
    );
  }
  return {
    data: {
      idleMode: input.display.idleMode,
      slideDurationSeconds: input.display.slideDurationSeconds,
      title: nullableTrim(input.display.title),
      subtitle: nullableTrim(input.display.subtitle),
      ctaLabel: input.display.ctaLabel?.trim() || "Start Try-On",
      countdownSeconds: input.capture.countdownSeconds,
      soundEnabled:
        input.capture.soundProfile === KioskConfigurationSoundProfile.MUTED
          ? false
          : input.capture.soundEnabled,
      soundProfile: input.capture.soundProfile,
      guidanceAudioEnabled: input.capture.guidanceAudioEnabled,
      enabledGarmentIntents: intents,
      sessionIdleTimeoutSeconds: input.experience.sessionIdleTimeoutSeconds,
    },
    assets,
  };
}

function normalizeAsset(
  input: {
    type: KioskConfigurationAssetType;
    label: string;
    url?: string;
    bundledAssetKey?: string;
    assetRef?: string;
    contentType?: string;
    sizeBytes?: number;
  },
  deviceId: string,
  uploadLimits: { maxImageBytes: number; maxVideoBytes: number },
) {
  assertEnumValue(
    allowedAssetTypes,
    input.type,
    "Presentation asset type is invalid.",
  );
  const label = input.label.trim();
  if (!label) {
    throwConfigurationInvalid("Presentation asset label is required.");
  }
  if (input.type === KioskConfigurationAssetType.BUNDLED_IMAGE) {
    const bundledAssetKey = input.bundledAssetKey?.trim() || "";
    if (!allowedBundledAssetKeys.has(bundledAssetKey)) {
      throwConfigurationInvalid("Bundled presentation asset is not supported.");
    }
    return {
      type: input.type,
      label,
      url: null,
      bundledAssetKey,
      objectKey: null,
      contentType: null,
      sizeBytes: null,
    };
  }
  if (input.type === KioskConfigurationAssetType.UPLOADED_IMAGE) {
    const contentType = normalizeUploadedContentType(input.contentType);
    if (!contentType) {
      throwConfigurationInvalid("Uploaded presentation asset is invalid.");
    }
    const maxBytes = maxBytesForContentType(contentType, uploadLimits);
    if (!input.sizeBytes || input.sizeBytes > maxBytes) {
      throwConfigurationInvalid("Uploaded presentation asset is too large.");
    }
    const objectKey = decodeAssetRef(input.assetRef);
    if (!objectKey.startsWith(`kiosk-config/${deviceId}/`)) {
      throwConfigurationInvalid(
        "Uploaded presentation asset does not belong to this kiosk.",
      );
    }
    return {
      type: input.type,
      label,
      url: null,
      bundledAssetKey: null,
      objectKey,
      contentType,
      sizeBytes: input.sizeBytes,
    };
  }
  const url = input.url?.trim() || "";
  assertSafeRemoteMediaUrl(url);
  return {
    type: input.type,
    label,
    url,
    bundledAssetKey: null,
    objectKey: null,
    contentType: null,
    sizeBytes: null,
  };
}

function assertSafeRemoteMediaUrl(value: string): void {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throwConfigurationInvalid("Presentation asset URL is invalid.");
  }
  if (url.protocol !== "https:") {
    throwConfigurationInvalid("Presentation asset URL must use HTTPS.");
  }
  if (isBlockedHost(url.hostname)) {
    throwConfigurationInvalid("Presentation asset URL host is not allowed.");
  }
}

function isBlockedHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host === "0.0.0.0" ||
    host === "::1"
  ) {
    return true;
  }
  if (isIP(host) === 4) {
    const parts = host.split(".").map((part) => Number(part));
    const [first = 0, second = 0] = parts;
    return (
      first === 0 ||
      first === 10 ||
      first === 127 ||
      (first === 100 && second >= 64 && second <= 127) ||
      (first === 169 && second === 254) ||
      (first === 172 && second >= 16 && second <= 31) ||
      (first === 192 && second === 168) ||
      (first === 198 && second >= 18 && second <= 19)
    );
  }
  if (host.startsWith("::ffff:")) {
    return true;
  }
  if (isIP(host) === 6) {
    return (
      host === "::" ||
      host.startsWith("fc") ||
      host.startsWith("fd") ||
      host.startsWith("fe80")
    );
  }
  return (
    host === "internal" ||
    host.endsWith(".internal") ||
    host.endsWith(".local") ||
    host.endsWith(".lan") ||
    host.endsWith(".home")
  );
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function assertEnumValue<T>(allowed: Set<T>, value: T, message: string): void {
  if (!allowed.has(value)) {
    throwConfigurationInvalid(message);
  }
}

function assertIntegerRange(
  value: number,
  min: number,
  max: number,
  message: string,
): void {
  if (!Number.isInteger(value) || value < min || value > max) {
    throwConfigurationInvalid(message);
  }
}

function assertIntegerSet(
  value: number,
  allowed: number[],
  message: string,
): void {
  if (!Number.isInteger(value) || !allowed.includes(value)) {
    throwConfigurationInvalid(message);
  }
}

function nullableTrim(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function normalizeUploadedContentType(value?: string): string | null {
  const contentType = value?.toLowerCase().split(";")[0]?.trim();
  if (!contentType || !supportedUploadContentTypeSet.has(contentType)) {
    return null;
  }
  return contentType;
}

function maxBytesForContentType(
  contentType: string | null,
  limits: { maxImageBytes: number; maxVideoBytes: number } = {
    maxImageBytes: KIOSK_PRESENTATION_DEFAULT_MAX_IMAGE_BYTES,
    maxVideoBytes: KIOSK_PRESENTATION_DEFAULT_MAX_VIDEO_BYTES,
  },
): number {
  if (contentType?.startsWith("video/")) {
    return limits.maxVideoBytes;
  }
  return limits.maxImageBytes;
}

function kioskConfigurationAssetObjectKeyFor(
  deviceId: string,
  contentType: string,
): string {
  const prefix = contentType.startsWith("video/")
    ? "presentation-video"
    : "presentation-image";
  return `kiosk-config/${deviceId}/${createSelfxId()}/${prefix}.${extensionForContentType(
    contentType,
  )}`;
}

function extensionForContentType(contentType: string): string {
  if (contentType === "video/mp4") {
    return "mp4";
  }
  if (contentType === "image/png") {
    return "png";
  }
  if (contentType === "image/webp") {
    return "webp";
  }
  return "jpg";
}

function encodeAssetRef(objectKey: string): string {
  return Buffer.from(objectKey, "utf8").toString("base64url");
}

function decodeAssetRef(assetRef?: string): string {
  if (!assetRef) {
    throwConfigurationInvalid(
      "Uploaded presentation image reference is required.",
    );
  }
  try {
    const objectKey = Buffer.from(assetRef, "base64url").toString("utf8");
    if (!objectKey.startsWith("kiosk-config/")) {
      throw new Error("invalid key");
    }
    return objectKey;
  } catch {
    throwConfigurationInvalid(
      "Uploaded presentation image reference is invalid.",
    );
  }
}

function presentationAssetLabel(
  fileName: string | undefined,
  contentType: string,
): string {
  const label = fileName?.replace(/\.[^.]+$/, "").trim();
  if (label) {
    return label.slice(0, 120);
  }
  return contentType.startsWith("video/")
    ? "Kiosk presentation video"
    : "Kiosk presentation image";
}

function throwConfigurationInvalid(message: string): never {
  throw new ApiErrorException(
    HttpStatus.BAD_REQUEST,
    KIOSK_ERROR_CODES.configurationInvalid,
    message,
  );
}
