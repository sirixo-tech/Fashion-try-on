import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import { KioskAssignmentScope, TryOnSessionStatus, type KioskDevice } from "@prisma/client";

import { createSelfxId } from "@selfx/database";

import { ApiErrorException } from "../common/api-error.exception.js";
import { PrismaService } from "../database/prisma.service.js";
import { ObjectStorageService } from "../storage/object-storage.js";
import {
  KIOSK_CONFIG,
  KIOSK_CUSTOMER_UPLOAD_SIGNED_URL_MAX_TTL_SECONDS,
  KIOSK_CUSTOMER_UPLOAD_TOKEN_BYTES,
  KIOSK_ERROR_CODES,
  KIOSK_TRY_ON_SHARE_TTL_SECONDS,
} from "./kiosk.constants.js";
import type { KioskConfig } from "./kiosk.config.js";
import type {
  KioskTryOnShareResponseDto,
  PublicTryOnShareResponseDto,
} from "./dto/kiosk-try-on.dto.js";

type KioskDeviceContext = Pick<
  KioskDevice,
  "id" | "assignmentScope" | "organizationId" | "storeId"
>;

interface RateBucket {
  count: number;
  resetAt: number;
}

@Injectable()
export class KioskTryOnShareService {
  private readonly publicBuckets = new Map<string, RateBucket>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: ObjectStorageService,
    @Inject(KIOSK_CONFIG) private readonly config: KioskConfig,
  ) {}

  async createForDevice(
    device: KioskDeviceContext,
    sessionId: string,
  ): Promise<KioskTryOnShareResponseDto> {
    const now = new Date();
    const session = await this.prisma.tryOnSession.findFirst({
      where: {
        id: sessionId,
        kioskDeviceId: device.id,
        status: TryOnSessionStatus.ACTIVE,
      },
      select: {
        id: true,
        assignmentScope: true,
        organizationId: true,
        storeId: true,
        kioskDeviceId: true,
        looks: {
          where: {
            expiresAt: { gt: now },
            resultAsset: { deletedAt: null, expiresAt: { gt: now } },
          },
          select: { id: true },
          take: 1,
        },
      },
    });

    if (!session) {
      throw new ApiErrorException(
        HttpStatus.NOT_FOUND,
        KIOSK_ERROR_CODES.tryOnShareInvalid,
        "Try-On session was not found.",
      );
    }
    if (session.looks.length === 0) {
      throw new ApiErrorException(
        HttpStatus.CONFLICT,
        KIOSK_ERROR_CODES.tryOnShareNoLooks,
        "No generated looks are available to share yet.",
      );
    }

    const capability = randomBytes(KIOSK_CUSTOMER_UPLOAD_TOKEN_BYTES).toString(
      "base64url",
    );
    const expiresAt = new Date(now.getTime() + KIOSK_TRY_ON_SHARE_TTL_SECONDS * 1000);
    await this.prisma.tryOnShareCapability.create({
      data: {
        id: createSelfxId(),
        sessionId: session.id,
        capabilityDigest: this.digestCapability(capability),
        assignmentScope: session.assignmentScope,
        organizationId: session.organizationId,
        storeId:
          session.assignmentScope === KioskAssignmentScope.STORE
            ? session.storeId
            : null,
        kioskDeviceId: session.kioskDeviceId,
        expiresAt,
      },
    });

    return {
      shareUrl: `${this.config.publicWebBaseUrl}/looks/${capability}`,
      expiresAt: expiresAt.toISOString(),
    };
  }

  async publicLooks(
    capability: string,
    ipAddress: string,
  ): Promise<PublicTryOnShareResponseDto> {
    this.assertPublicAllowed(`looks:${ipAddress}:${this.safeBucket(capability)}`);
    const now = new Date();
    const share = await this.requireActiveShare(capability, now);

    const looks = await this.prisma.tryOnLook.findMany({
      where: {
        sessionId: share.sessionId,
        assignmentScope: share.assignmentScope,
        organizationId: share.organizationId,
        storeId: share.storeId,
        kioskDeviceId: share.kioskDeviceId,
        expiresAt: { gt: now },
        resultAsset: { deletedAt: null, expiresAt: { gt: now } },
      },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        createdAt: true,
        expiresAt: true,
        resultAsset: {
          select: { storageKey: true, expiresAt: true },
        },
        product: {
          select: { name: true },
        },
      },
    });
    const remainingShareSeconds = Math.max(
      1,
      Math.floor((share.expiresAt.getTime() - now.getTime()) / 1000),
    );

    return {
      expiresAt: share.expiresAt.toISOString(),
      serverTime: now.toISOString(),
      looks: looks.map((look) => ({
        lookId: look.id,
        imageReadUrl: this.storage.createReadUrl({
          key: look.resultAsset.storageKey,
          expiresInSeconds: Math.min(
            remainingShareSeconds,
            KIOSK_CUSTOMER_UPLOAD_SIGNED_URL_MAX_TTL_SECONDS,
          ),
        }),
        createdAt: look.createdAt.toISOString(),
        expiresAt:
          look.expiresAt < look.resultAsset.expiresAt
            ? look.expiresAt.toISOString()
            : look.resultAsset.expiresAt.toISOString(),
        productName: look.product?.name,
      })),
    };
  }

  async publicLookDownloadUrl(
    capability: string,
    lookId: string,
    ipAddress: string,
  ): Promise<string> {
    this.assertPublicAllowed(
      `looks-download:${ipAddress}:${this.safeBucket(capability)}`,
    );
    const now = new Date();
    const share = await this.requireActiveShare(capability, now);
    const look = await this.prisma.tryOnLook.findFirst({
      where: {
        id: lookId,
        sessionId: share.sessionId,
        assignmentScope: share.assignmentScope,
        organizationId: share.organizationId,
        storeId: share.storeId,
        kioskDeviceId: share.kioskDeviceId,
        expiresAt: { gt: now },
        resultAsset: { deletedAt: null, expiresAt: { gt: now } },
      },
      select: {
        resultAsset: {
          select: { storageKey: true, contentType: true, expiresAt: true },
        },
      },
    });
    if (!look) {
      throw this.invalidShare();
    }
    const remainingShareSeconds = Math.max(
      1,
      Math.floor((share.expiresAt.getTime() - now.getTime()) / 1000),
    );
    return this.storage.createReadUrl({
      key: look.resultAsset.storageKey,
      expiresInSeconds: Math.min(
        remainingShareSeconds,
        KIOSK_CUSTOMER_UPLOAD_SIGNED_URL_MAX_TTL_SECONDS,
      ),
      responseContentDisposition: attachmentDispositionForLook(
        lookId,
        look.resultAsset.contentType,
      ),
      responseContentType: look.resultAsset.contentType ?? undefined,
    });
  }

  private async requireActiveShare(capability: string, now: Date) {
    const digest = this.digestCapability(capability);
    const share = await this.prisma.tryOnShareCapability.findUnique({
      where: { capabilityDigest: digest },
      select: {
        capabilityDigest: true,
        sessionId: true,
        expiresAt: true,
        revokedAt: true,
        assignmentScope: true,
        organizationId: true,
        storeId: true,
        kioskDeviceId: true,
      },
    });

    if (!share || !constantTimeEqual(share.capabilityDigest, digest)) {
      throw this.invalidShare();
    }
    if (share.revokedAt || share.expiresAt <= now) {
      throw new ApiErrorException(
        HttpStatus.GONE,
        KIOSK_ERROR_CODES.tryOnShareExpired,
        "This link has expired.",
      );
    }
    return share;
  }

  private digestCapability(capability: string): string {
    return createHmac("sha256", this.config.customerUploadTokenPepper)
      .update("try-on-share:")
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
    if (current.count > 60) {
      throw new ApiErrorException(
        HttpStatus.TOO_MANY_REQUESTS,
        KIOSK_ERROR_CODES.rateLimited,
        "Too many requests. Try again later.",
      );
    }
  }

  private safeBucket(value: string): string {
    return this.digestCapability(value).slice(0, 16);
  }

  private invalidShare(): ApiErrorException {
    return new ApiErrorException(
      HttpStatus.NOT_FOUND,
      KIOSK_ERROR_CODES.tryOnShareInvalid,
      "This link has expired or is invalid.",
    );
  }
}

function constantTimeEqual(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  return (
    leftBytes.length === rightBytes.length &&
    timingSafeEqual(leftBytes, rightBytes)
  );
}

function attachmentDispositionForLook(
  lookId: string,
  contentType: string | null,
): string {
  const filename = `selfx-look-${lookId}.${extensionForContentType(contentType)}`;
  return `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(
    filename,
  )}`;
}

function extensionForContentType(contentType: string | null): string {
  const normalized = contentType?.toLowerCase().split(";")[0]?.trim();
  if (normalized === "image/png") {
    return "png";
  }
  if (normalized === "image/webp") {
    return "webp";
  }
  return "jpg";
}
