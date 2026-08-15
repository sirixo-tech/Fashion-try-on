import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import {
  KioskCustomerUploadPurpose,
  KioskCustomerUploadSessionStatus,
  type KioskCustomerUploadSession,
  type KioskDevice,
} from "@prisma/client";

import { createSelfxId } from "@selfx/database";

import { ApiErrorException } from "../common/api-error.exception.js";
import {
  TechnicalImageValidationError,
  validateTechnicalImageBuffer,
  type SupportedImageMimeType,
} from "../common/image-validation.js";
import { PrismaService } from "../database/prisma.service.js";
import { ObjectStorageService } from "../storage/object-storage.js";
import {
  KIOSK_CONFIG,
  KIOSK_CUSTOMER_UPLOAD_MAX_IMAGE_BYTES,
  KIOSK_CUSTOMER_UPLOAD_POLL_INTERVAL_SECONDS,
  KIOSK_CUSTOMER_UPLOAD_SIGNED_URL_MAX_TTL_SECONDS,
  KIOSK_CUSTOMER_UPLOAD_TOKEN_BYTES,
  KIOSK_ERROR_CODES,
} from "./kiosk.constants.js";
import type { KioskConfig } from "./kiosk.config.js";
import {
  type CustomerUploadCompleteResponseDto,
  type CustomerUploadIntentDto,
  type CustomerUploadIntentResponseDto,
  type CustomerUploadPublicStatusDto,
  type KioskCustomerUploadSessionResponseDto,
  type KioskCustomerUploadSessionStatusDto,
} from "./dto/kiosk.dto.js";

const activeStatuses: KioskCustomerUploadSessionStatus[] = [
  KioskCustomerUploadSessionStatus.WAITING,
  KioskCustomerUploadSessionStatus.UPLOADING,
  KioskCustomerUploadSessionStatus.VALIDATING,
  KioskCustomerUploadSessionStatus.READY,
  KioskCustomerUploadSessionStatus.REJECTED,
];

const allowedContentTypes: SupportedImageMimeType[] = [
  "image/jpeg",
  "image/png",
  "image/webp",
];

interface RateBucket {
  count: number;
  resetAt: number;
}

@Injectable()
export class KioskCustomerUploadService {
  private readonly publicBuckets = new Map<string, RateBucket>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: ObjectStorageService,
    @Inject(KIOSK_CONFIG) private readonly config: KioskConfig,
  ) {}

  async createForDevice(
    device: Pick<KioskDevice, "id">,
    purposeInput?: string | KioskCustomerUploadPurpose,
  ): Promise<KioskCustomerUploadSessionResponseDto> {
    const purpose = normalizePurpose(purposeInput);
    await this.expireStaleSessions();
    await this.cancelActiveDeviceSessions(device.id, purpose);
    const now = new Date();
    const capability = randomBytes(KIOSK_CUSTOMER_UPLOAD_TOKEN_BYTES).toString(
      "base64url",
    );
    const session = await this.prisma.kioskCustomerUploadSession.create({
      data: {
        id: createSelfxId(),
        kioskDeviceId: device.id,
        status: KioskCustomerUploadSessionStatus.WAITING,
        purpose,
        capabilityDigest: this.digestCapability(capability),
        expiresAt: new Date(
          now.getTime() + this.config.customerUploadTtlSeconds * 1000,
        ),
      },
    });

    return {
      ...this.mapDeviceResponse(session, now),
      publicUploadUrl: this.publicUploadUrl(capability),
    };
  }

  async getForDevice(
    device: Pick<KioskDevice, "id">,
    sessionId: string,
  ): Promise<KioskCustomerUploadSessionStatusDto> {
    const session = await this.requireDeviceSession(device.id, sessionId);
    const current = await this.expireIfNeeded(session, new Date());
    return this.mapDeviceStatus(current, new Date());
  }

  async cancelForDevice(
    device: Pick<KioskDevice, "id">,
    sessionId: string,
  ): Promise<KioskCustomerUploadSessionStatusDto> {
    const session = await this.requireDeviceSession(device.id, sessionId);
    const updated = await this.prisma.kioskCustomerUploadSession.update({
      where: { id: session.id },
      data: {
        status: KioskCustomerUploadSessionStatus.CANCELLED,
        cancelledAt: new Date(),
      },
    });
    await this.deleteAssetBestEffort(session.assetKey);
    return this.mapDeviceStatus(updated, new Date());
  }

  async consumeForDevice(
    device: Pick<KioskDevice, "id">,
    sessionId: string,
    purposeInput?: string | KioskCustomerUploadPurpose,
  ): Promise<KioskCustomerUploadSessionStatusDto> {
    const expectedPurpose = normalizePurpose(purposeInput);
    const session = await this.requireDeviceSession(device.id, sessionId);
    const current = await this.expireIfNeeded(session, new Date());
    if (current.purpose !== expectedPurpose) {
      throw new ApiErrorException(
        HttpStatus.CONFLICT,
        KIOSK_ERROR_CODES.customerUploadPurposeMismatch,
        "Customer upload purpose does not match this kiosk action.",
      );
    }
    if (current.status !== KioskCustomerUploadSessionStatus.READY) {
      throw new ApiErrorException(
        HttpStatus.CONFLICT,
        KIOSK_ERROR_CODES.customerUploadNotReady,
        "Customer upload is not ready.",
      );
    }
    const updated = await this.prisma.kioskCustomerUploadSession.update({
      where: { id: current.id },
      data: {
        status: KioskCustomerUploadSessionStatus.CONSUMED,
        consumedAt: new Date(),
      },
    });
    return this.mapDeviceStatus(updated, new Date());
  }

  async publicStatus(
    capability: string,
    ipAddress: string,
  ): Promise<CustomerUploadPublicStatusDto> {
    this.assertPublicAllowed(`status:${ipAddress}`);
    const session = await this.requireCapabilitySession(capability);
    const current = await this.expireIfNeeded(session, new Date());
    return this.mapPublicStatus(current, new Date());
  }

  async createUploadIntent(
    capability: string,
    input: CustomerUploadIntentDto,
    ipAddress: string,
  ): Promise<CustomerUploadIntentResponseDto> {
    this.assertPublicAllowed(
      `intent:${ipAddress}:${this.safeBucket(capability)}`,
    );
    const session = await this.requireCapabilitySession(capability);
    const current = await this.expireIfNeeded(session, new Date());
    this.assertNotExpired(current);
    if (
      current.status !== KioskCustomerUploadSessionStatus.WAITING &&
      current.status !== KioskCustomerUploadSessionStatus.REJECTED
    ) {
      throw new ApiErrorException(
        HttpStatus.CONFLICT,
        KIOSK_ERROR_CODES.customerUploadNotReady,
        "This upload link is already being used.",
      );
    }
    const contentType = normalizeContentType(input.contentType);
    if (!contentType || input.sizeBytes > KIOSK_CUSTOMER_UPLOAD_MAX_IMAGE_BYTES) {
      throw new ApiErrorException(
        HttpStatus.BAD_REQUEST,
        KIOSK_ERROR_CODES.customerUploadRejected,
        "Invalid image.",
      );
    }

    const now = new Date();
    const remainingSeconds = Math.max(
      1,
      Math.floor((current.expiresAt.getTime() - now.getTime()) / 1000),
    );
    const signedTtl = Math.min(
      remainingSeconds,
      KIOSK_CUSTOMER_UPLOAD_SIGNED_URL_MAX_TTL_SECONDS,
    );
    const key = objectKeyFor(current.id, contentType, current.purpose);
    await this.deleteAssetBestEffort(current.assetKey);
    await this.prisma.kioskCustomerUploadSession.update({
      where: { id: current.id },
      data: {
        status: KioskCustomerUploadSessionStatus.UPLOADING,
        uploadStartedAt: now,
        assetKey: key,
        contentType,
        sizeBytes: input.sizeBytes,
        width: null,
        height: null,
        readyAt: null,
        rejectionCode: null,
      },
    });

    return {
      uploadUrl: this.storage.createUploadUrl({
        key,
        contentType,
        expiresInSeconds: signedTtl,
      }),
      method: "PUT",
      expiresAt: new Date(now.getTime() + signedTtl * 1000).toISOString(),
      headers: { "Content-Type": contentType },
      maxImageBytes: KIOSK_CUSTOMER_UPLOAD_MAX_IMAGE_BYTES,
    };
  }

  async completeUpload(
    capability: string,
    ipAddress: string,
  ): Promise<CustomerUploadCompleteResponseDto> {
    this.assertPublicAllowed(
      `complete:${ipAddress}:${this.safeBucket(capability)}`,
    );
    const session = await this.requireCapabilitySession(capability);
    const current = await this.expireIfNeeded(session, new Date());
    this.assertNotExpired(current);
    if (
      current.status !== KioskCustomerUploadSessionStatus.UPLOADING &&
      current.status !== KioskCustomerUploadSessionStatus.VALIDATING
    ) {
      throw new ApiErrorException(
        HttpStatus.CONFLICT,
        KIOSK_ERROR_CODES.customerUploadNotReady,
        "No upload is ready to validate.",
      );
    }
    if (!current.assetKey || !current.contentType) {
      return this.reject(current, "UPLOAD_OBJECT_MISSING");
    }

    await this.prisma.kioskCustomerUploadSession.update({
      where: { id: current.id },
      data: { status: KioskCustomerUploadSessionStatus.VALIDATING },
    });

    try {
      const head = await this.storage.headObject(current.assetKey);
      if (
        head.sizeBytes <= 0 ||
        head.sizeBytes > KIOSK_CUSTOMER_UPLOAD_MAX_IMAGE_BYTES
      ) {
        return this.reject(current, "IMAGE_TOO_LARGE");
      }
      const buffer = await this.storage.readObject(
        current.assetKey,
        KIOSK_CUSTOMER_UPLOAD_MAX_IMAGE_BYTES,
      );
      const metadata = validateTechnicalImageBuffer({
        buffer,
        declaredContentType: current.contentType,
        maxBytes: KIOSK_CUSTOMER_UPLOAD_MAX_IMAGE_BYTES,
      });
      const ready = await this.prisma.kioskCustomerUploadSession.update({
        where: { id: current.id },
        data: {
          status: KioskCustomerUploadSessionStatus.READY,
          readyAt: new Date(),
          contentType: metadata.mimeType,
          sizeBytes: metadata.sizeBytes,
          width: metadata.width,
          height: metadata.height,
          rejectionCode: null,
        },
      });
      return this.mapComplete(ready, new Date());
    } catch (error) {
      if (error instanceof TechnicalImageValidationError) {
        return this.reject(current, error.code);
      }
      throw error;
    }
  }

  private async reject(
    session: KioskCustomerUploadSession,
    rejectionCode: string,
  ): Promise<CustomerUploadCompleteResponseDto> {
    const rejected = await this.prisma.kioskCustomerUploadSession.update({
      where: { id: session.id },
      data: {
        status: KioskCustomerUploadSessionStatus.REJECTED,
        rejectionCode,
      },
    });
    await this.deleteAssetBestEffort(session.assetKey);
    return this.mapComplete(rejected, new Date());
  }

  private async requireDeviceSession(
    kioskDeviceId: string,
    sessionId: string,
  ): Promise<KioskCustomerUploadSession> {
    const session = await this.prisma.kioskCustomerUploadSession.findFirst({
      where: { id: sessionId, kioskDeviceId },
    });
    if (!session) {
      throw new ApiErrorException(
        HttpStatus.NOT_FOUND,
        KIOSK_ERROR_CODES.customerUploadInvalid,
        "Customer upload session was not found.",
      );
    }
    return session;
  }

  private async requireCapabilitySession(
    capability: string,
  ): Promise<KioskCustomerUploadSession> {
    const digest = this.digestCapability(capability);
    const session = await this.prisma.kioskCustomerUploadSession.findUnique({
      where: { capabilityDigest: digest },
    });
    if (!session || !constantTimeEqual(session.capabilityDigest, digest)) {
      throw new ApiErrorException(
        HttpStatus.NOT_FOUND,
        KIOSK_ERROR_CODES.customerUploadInvalid,
        "Upload link expired or invalid.",
      );
    }
    return session;
  }

  private async expireIfNeeded(
    session: KioskCustomerUploadSession,
    now: Date,
  ): Promise<KioskCustomerUploadSession> {
    if (!activeStatuses.includes(session.status) || session.expiresAt > now) {
      return session;
    }
    const expired = await this.prisma.kioskCustomerUploadSession.update({
      where: { id: session.id },
      data: { status: KioskCustomerUploadSessionStatus.EXPIRED },
    });
    await this.deleteAssetBestEffort(session.assetKey);
    return expired;
  }

  private assertNotExpired(session: KioskCustomerUploadSession): void {
    if (session.status === KioskCustomerUploadSessionStatus.EXPIRED) {
      throw new ApiErrorException(
        HttpStatus.GONE,
        KIOSK_ERROR_CODES.customerUploadExpired,
        "Upload link expired.",
      );
    }
  }

  private async expireStaleSessions(): Promise<void> {
    await this.prisma.kioskCustomerUploadSession.updateMany({
      where: {
        status: { in: activeStatuses },
        expiresAt: { lte: new Date() },
      },
      data: { status: KioskCustomerUploadSessionStatus.EXPIRED },
    });
  }

  private async cancelActiveDeviceSessions(
    kioskDeviceId: string,
    purpose: KioskCustomerUploadPurpose,
  ): Promise<void> {
    const activeSessions =
      await this.prisma.kioskCustomerUploadSession.findMany({
        where: { kioskDeviceId, purpose, status: { in: activeStatuses } },
        select: { id: true, assetKey: true },
      });
    if (activeSessions.length === 0) {
      return;
    }
    await this.prisma.kioskCustomerUploadSession.updateMany({
      where: { id: { in: activeSessions.map((session) => session.id) } },
      data: {
        status: KioskCustomerUploadSessionStatus.CANCELLED,
        cancelledAt: new Date(),
      },
    });
    await Promise.all(
      activeSessions.map((session) =>
        this.deleteAssetBestEffort(session.assetKey),
      ),
    );
  }

  private mapDeviceResponse(
    session: KioskCustomerUploadSession,
    now: Date,
  ): Omit<KioskCustomerUploadSessionResponseDto, "publicUploadUrl"> {
    return {
      sessionId: session.id,
      status: session.status,
      purpose: session.purpose,
      expiresAt: session.expiresAt.toISOString(),
      serverTime: now.toISOString(),
      pollIntervalSeconds: KIOSK_CUSTOMER_UPLOAD_POLL_INTERVAL_SECONDS,
      photo: this.readyPhoto(session),
    };
  }

  private mapDeviceStatus(
    session: KioskCustomerUploadSession,
    now: Date,
  ): KioskCustomerUploadSessionStatusDto {
    return {
      sessionId: session.id,
      status: session.status,
      purpose: session.purpose,
      expiresAt: session.expiresAt.toISOString(),
      serverTime: now.toISOString(),
      rejectionCode: session.rejectionCode,
      photo: this.readyPhoto(session),
    };
  }

  private mapPublicStatus(
    session: KioskCustomerUploadSession,
    now: Date,
  ): CustomerUploadPublicStatusDto {
    return {
      status: session.status,
      purpose: session.purpose,
      expiresAt: session.expiresAt.toISOString(),
      serverTime: now.toISOString(),
      maxImageBytes: KIOSK_CUSTOMER_UPLOAD_MAX_IMAGE_BYTES,
    };
  }

  private mapComplete(
    session: KioskCustomerUploadSession,
    now: Date,
  ): CustomerUploadCompleteResponseDto {
    return {
      status: session.status,
      purpose: session.purpose,
      expiresAt: session.expiresAt.toISOString(),
      serverTime: now.toISOString(),
    };
  }

  private readyPhoto(session: KioskCustomerUploadSession) {
    if (
      session.status !== KioskCustomerUploadSessionStatus.READY ||
      !session.assetKey ||
      !session.contentType ||
      !session.sizeBytes ||
      !session.width ||
      !session.height
    ) {
      return undefined;
    }
    return {
      readUrl: this.storage.createReadUrl({
        key: session.assetKey,
        expiresInSeconds: KIOSK_CUSTOMER_UPLOAD_SIGNED_URL_MAX_TTL_SECONDS,
      }),
      contentType: session.contentType,
      sizeBytes: session.sizeBytes,
      width: session.width,
      height: session.height,
    };
  }

  private publicUploadUrl(capability: string): string {
    return `${this.config.publicWebBaseUrl}/upload/${capability}`;
  }

  private digestCapability(capability: string): string {
    return createHmac("sha256", this.config.customerUploadTokenPepper)
      .update(capability)
      .digest("base64url");
  }

  private assertPublicAllowed(key: string): void {
    const now = Date.now();
    const current = this.publicBuckets.get(key);
    if (!current || current.resetAt <= now) {
      this.publicBuckets.set(key, { count: 1, resetAt: now + 60_000 });
      return;
    }
    current.count += 1;
    if (current.count > 30) {
      throw new ApiErrorException(
        HttpStatus.TOO_MANY_REQUESTS,
        KIOSK_ERROR_CODES.rateLimited,
        "Too many upload attempts. Try again later.",
      );
    }
  }

  private safeBucket(value: string): string {
    return this.digestCapability(value).slice(0, 16);
  }

  private async deleteAssetBestEffort(key: string | null): Promise<void> {
    if (!key) {
      return;
    }
    try {
      await this.storage.deleteObject(key);
    } catch {
      // Cleanup is best-effort until durable retention jobs arrive.
    }
  }
}

function normalizeContentType(value: string): SupportedImageMimeType | null {
  const lower = value.toLowerCase().split(";")[0]?.trim();
  return allowedContentTypes.includes(lower as SupportedImageMimeType)
    ? (lower as SupportedImageMimeType)
    : null;
}

function objectKeyFor(
  sessionId: string,
  contentType: SupportedImageMimeType,
  purpose: KioskCustomerUploadPurpose,
): string {
  const extension =
    contentType === "image/png"
      ? "png"
      : contentType === "image/webp"
        ? "webp"
        : "jpg";
  const basename =
    purpose === KioskCustomerUploadPurpose.GARMENT
      ? "garment-original"
      : "person-original";
  return `customer-uploads/${sessionId}/${basename}.${extension}`;
}

function normalizePurpose(
  value?: string | KioskCustomerUploadPurpose,
): KioskCustomerUploadPurpose {
  if (!value) {
    return KioskCustomerUploadPurpose.MODEL;
  }
  const upper = value.toString().trim().toUpperCase();
  if (upper === KioskCustomerUploadPurpose.MODEL) {
    return KioskCustomerUploadPurpose.MODEL;
  }
  if (upper === KioskCustomerUploadPurpose.GARMENT) {
    return KioskCustomerUploadPurpose.GARMENT;
  }
  throw new ApiErrorException(
    HttpStatus.BAD_REQUEST,
    KIOSK_ERROR_CODES.customerUploadInvalid,
    "Invalid customer upload purpose.",
  );
}

function constantTimeEqual(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  return (
    leftBytes.length === rightBytes.length &&
    timingSafeEqual(leftBytes, rightBytes)
  );
}
