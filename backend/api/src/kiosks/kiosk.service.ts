import {
  createHmac,
  randomBytes,
  randomInt,
  timingSafeEqual,
} from "node:crypto";

import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import {
  KioskAssignmentScope,
  KioskDeviceStatus,
  KioskPairingSessionStatus,
  OrganizationStatus,
  StoreStatus,
  type KioskDevice,
  type KioskDeviceConfiguration,
  type Organization,
  type Store,
} from "@prisma/client";

import { createSelfxId } from "@selfx/database";

import { ApiErrorException } from "../common/api-error.exception.js";
import { PrismaService } from "../database/prisma.service.js";
import {
  KIOSK_AUDIT_ACTIONS,
  KIOSK_CONFIG,
  KIOSK_DEVICE_REFRESH_TOKEN_BYTES,
  KIOSK_ERROR_CODES,
  KIOSK_PAIRING_CODE_PATTERN,
  KIOSK_PAIRING_STATUS_POLL_SECONDS,
  KIOSK_PROVISIONING_SECRET_BYTES,
} from "./kiosk.constants.js";
import { type KioskConfig } from "./kiosk.config.js";
import {
  type CreateKioskPairingSessionDto,
  type ExchangeKioskProvisioningDto,
  type KioskDeviceAuthResponseDto,
  type KioskDeviceListResponseDto,
  type KioskDeviceResponseDto,
  type KioskHeartbeatDto,
  type KioskPairingSessionResponseDto,
  type KioskPairingStatusResponseDto,
  type PairKioskDto,
  type RefreshKioskDeviceSessionDto,
  type UpdateKioskDeviceDto,
} from "./dto/kiosk.dto.js";

interface DeviceAccessTokenPayload {
  sub: string;
  typ: "kiosk_device_access";
}

type DeviceWithAssignment = KioskDevice & {
  organization: Pick<Organization, "id" | "name"> | null;
  store: Pick<Store, "id" | "name"> | null;
  configuration?: Pick<KioskDeviceConfiguration, "version"> | null;
};

interface RefreshTokenParts {
  sessionId: string;
  secret: string;
}

@Injectable()
export class KioskService {
  private readonly createBuckets = new Map<
    string,
    { count: number; resetAt: number }
  >();

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    @Inject(KIOSK_CONFIG) private readonly config: KioskConfig,
  ) {}

  async createPairingSession(
    input: CreateKioskPairingSessionDto,
    ipAddress: string,
  ): Promise<KioskPairingSessionResponseDto> {
    this.assertCreateSessionAllowed(ipAddress);
    await this.expireStalePairingSessions();

    const now = new Date();
    const expiresAt = new Date(
      now.getTime() + this.config.pairingTtlSeconds * 1000,
    );
    const provisioningSecret = randomOpaque(KIOSK_PROVISIONING_SECRET_BYTES);
    const pairingCode = await this.generateAvailablePairingCode(now);

    const session = await this.prisma.kioskPairingSession.create({
      data: {
        id: createSelfxId(),
        codeDigest: this.digestPairingCode(pairingCode),
        provisioningSecretHash:
          this.digestProvisioningSecret(provisioningSecret),
        status: KioskPairingSessionStatus.PENDING,
        expiresAt,
        installationId: input.installationId?.trim() || undefined,
        platform: input.platform?.trim() || undefined,
        appVersion: input.appVersion?.trim() || undefined,
      },
    });

    return {
      pairingSessionId: session.id,
      pairingCode,
      provisioningSecret,
      expiresAt: session.expiresAt.toISOString(),
      serverTime: now.toISOString(),
      ttlSeconds: this.config.pairingTtlSeconds,
      pollIntervalSeconds: KIOSK_PAIRING_STATUS_POLL_SECONDS,
    };
  }

  async getPairingStatus(
    sessionId: string,
    provisioningSecret: string | undefined,
  ): Promise<KioskPairingStatusResponseDto> {
    const now = new Date();
    const session = await this.prisma.kioskPairingSession.findUnique({
      where: { id: sessionId },
    });
    if (
      !session ||
      !provisioningSecret ||
      !constantTimeEqual(
        session.provisioningSecretHash,
        this.digestProvisioningSecret(provisioningSecret),
      )
    ) {
      throw new ApiErrorException(
        HttpStatus.UNAUTHORIZED,
        KIOSK_ERROR_CODES.provisioningSecretInvalid,
        "Provisioning session is invalid.",
      );
    }

    if (
      session.status === KioskPairingSessionStatus.PENDING &&
      session.expiresAt <= now
    ) {
      await this.prisma.kioskPairingSession.update({
        where: { id: session.id },
        data: { status: KioskPairingSessionStatus.EXPIRED },
      });
      return {
        status: "EXPIRED",
        serverTime: now.toISOString(),
        expiresAt: session.expiresAt.toISOString(),
      };
    }

    if (session.status === KioskPairingSessionStatus.CLAIMED) {
      return {
        status: "PAIRED",
        serverTime: now.toISOString(),
        expiresAt: session.expiresAt.toISOString(),
        provisioningGrant:
          !session.grantConsumedAt &&
          session.kioskDeviceId &&
          session.provisioningGrantHash
            ? this.createProvisioningGrant(
                session.id,
                session.provisioningSecretHash,
                session.kioskDeviceId,
              )
            : undefined,
      };
    }

    if (
      session.status === KioskPairingSessionStatus.EXPIRED ||
      session.status === KioskPairingSessionStatus.CANCELLED
    ) {
      return {
        status: "EXPIRED",
        serverTime: now.toISOString(),
        expiresAt: session.expiresAt.toISOString(),
      };
    }

    return {
      status: "WAITING",
      serverTime: now.toISOString(),
      expiresAt: session.expiresAt.toISOString(),
    };
  }

  async pairKiosk(
    actorUserId: string,
    input: PairKioskDto,
  ): Promise<KioskDeviceResponseDto> {
    const now = new Date();
    const pairingCode = canonicalPairingCode(input.pairingCode);
    const codeDigest = this.digestPairingCode(pairingCode);
    const assignment = await this.resolveAssignment(input);

    const device = await this.prisma.$transaction(async (tx) => {
      const session = await tx.kioskPairingSession.findFirst({
        where: {
          codeDigest,
          status: KioskPairingSessionStatus.PENDING,
          expiresAt: { gt: now },
        },
        orderBy: { createdAt: "desc" },
      });

      if (!session) {
        throw new ApiErrorException(
          HttpStatus.BAD_REQUEST,
          KIOSK_ERROR_CODES.pairingInvalid,
          "Pairing code expired or invalid.",
        );
      }

      const claimed = await tx.kioskPairingSession.updateMany({
        where: {
          id: session.id,
          status: KioskPairingSessionStatus.PENDING,
          expiresAt: { gt: now },
        },
        data: {
          status: KioskPairingSessionStatus.CLAIMED,
          claimedAt: now,
          claimedByUserId: actorUserId,
        },
      });
      if (claimed.count !== 1) {
        throw new ApiErrorException(
          HttpStatus.CONFLICT,
          KIOSK_ERROR_CODES.pairingAlreadyClaimed,
          "Pairing code expired or invalid.",
        );
      }

      const created = await tx.kioskDevice.create({
        data: {
          id: createSelfxId(),
          displayName: input.displayName.trim(),
          status: KioskDeviceStatus.ACTIVE,
          assignmentScope: input.assignmentScope,
          organizationId: assignment.organizationId,
          storeId: assignment.storeId,
          platform: session.platform,
          appVersion: session.appVersion,
          installationId: session.installationId,
          pairedAt: now,
        },
      });

      const provisioningGrant = this.createProvisioningGrant(
        session.id,
        session.provisioningSecretHash,
        created.id,
      );

      await tx.kioskPairingSession.update({
        where: { id: session.id },
        data: {
          kioskDeviceId: created.id,
          provisioningGrantHash:
            this.digestProvisioningSecret(provisioningGrant),
          grantIssuedAt: now,
        },
      });

      await tx.auditLog.create({
        data: {
          id: createSelfxId(),
          action: KIOSK_AUDIT_ACTIONS.paired,
          actorUserId,
          organizationId: assignment.organizationId,
          storeId: assignment.storeId,
          resourceType: "kiosk_device",
          resourceId: created.id,
          metadata: {
            assignment_scope: input.assignmentScope,
          },
        },
      });

      return tx.kioskDevice.findUniqueOrThrow({
        where: { id: created.id },
        include: assignmentInclude(),
      });
    });

    return mapDevice(device);
  }

  async exchangeProvisioningGrant(
    input: ExchangeKioskProvisioningDto,
  ): Promise<KioskDeviceAuthResponseDto> {
    const now = new Date();
    const session = await this.prisma.kioskPairingSession.findUnique({
      where: { id: input.pairingSessionId },
      include: { kioskDevice: { include: assignmentInclude() } },
    });

    if (
      !session ||
      !constantTimeEqual(
        session.provisioningSecretHash,
        this.digestProvisioningSecret(input.provisioningSecret),
      )
    ) {
      throw new ApiErrorException(
        HttpStatus.UNAUTHORIZED,
        KIOSK_ERROR_CODES.provisioningSecretInvalid,
        "Provisioning session is invalid.",
      );
    }
    if (
      session.status !== KioskPairingSessionStatus.CLAIMED ||
      !session.kioskDevice
    ) {
      throw new ApiErrorException(
        HttpStatus.BAD_REQUEST,
        KIOSK_ERROR_CODES.provisioningGrantInvalid,
        "Provisioning grant is invalid.",
      );
    }
    if (session.grantConsumedAt) {
      throw new ApiErrorException(
        HttpStatus.CONFLICT,
        KIOSK_ERROR_CODES.provisioningGrantConsumed,
        "Provisioning grant has already been used.",
      );
    }
    if (
      !session.provisioningGrantHash ||
      !constantTimeEqual(
        session.provisioningGrantHash,
        this.digestProvisioningSecret(input.provisioningGrant),
      )
    ) {
      throw new ApiErrorException(
        HttpStatus.UNAUTHORIZED,
        KIOSK_ERROR_CODES.provisioningGrantInvalid,
        "Provisioning grant is invalid.",
      );
    }

    const updated = await this.prisma.kioskPairingSession.updateMany({
      where: { id: session.id, grantConsumedAt: null },
      data: { grantConsumedAt: now },
    });
    if (updated.count !== 1) {
      throw new ApiErrorException(
        HttpStatus.CONFLICT,
        KIOSK_ERROR_CODES.provisioningGrantConsumed,
        "Provisioning grant has already been used.",
      );
    }

    return this.issueDeviceTokens(session.kioskDevice);
  }

  async refreshDeviceSession(
    input: RefreshKioskDeviceSessionDto,
  ): Promise<KioskDeviceAuthResponseDto> {
    const parts = parseRefreshToken(input.refreshToken);
    if (!parts) {
      throwDeviceInvalid();
    }

    const session = await this.prisma.kioskDeviceSession.findUnique({
      where: { id: parts.sessionId },
      include: { kioskDevice: { include: assignmentInclude() } },
    });
    if (
      !session ||
      session.revokedAt ||
      session.expiresAt <= new Date() ||
      !constantTimeEqual(
        session.refreshTokenHash,
        this.digestDeviceRefreshToken(input.refreshToken),
      )
    ) {
      throwDeviceInvalid();
    }
    assertDeviceActive(session.kioskDevice.status);

    const refreshToken = createRefreshToken(session.id);
    const refreshExpiresAt = new Date(
      Date.now() + this.config.deviceRefreshSessionTtlSeconds * 1000,
    );
    const nextSessionId = createSelfxId();

    const device = await this.prisma.$transaction(async (tx) => {
      await tx.kioskDeviceSession.update({
        where: { id: session.id },
        data: { revokedAt: new Date(), rotatedAt: new Date() },
      });
      await tx.kioskDeviceSession.create({
        data: {
          id: nextSessionId,
          kioskDeviceId: session.kioskDeviceId,
          refreshTokenHash: this.digestDeviceRefreshToken(
            rewriteRefreshSessionId(refreshToken, nextSessionId),
          ),
          expiresAt: refreshExpiresAt,
          lastUsedAt: new Date(),
        },
      });
      await tx.kioskDevice.update({
        where: { id: session.kioskDeviceId },
        data: { lastSeenAt: new Date() },
      });
      return tx.kioskDevice.findUniqueOrThrow({
        where: { id: session.kioskDeviceId },
        include: assignmentInclude(),
      });
    });

    return this.createAuthResponse(
      device,
      rewriteRefreshSessionId(refreshToken, nextSessionId),
      refreshExpiresAt,
    );
  }

  async requireDevice(
    authorization: string | undefined,
  ): Promise<DeviceWithAssignment> {
    const token = extractBearerToken(authorization);
    if (!token) {
      throwDeviceInvalid();
    }

    let payload: DeviceAccessTokenPayload;
    try {
      payload = await this.jwt.verifyAsync<DeviceAccessTokenPayload>(token, {
        secret: this.config.deviceJwtSecret,
      });
    } catch {
      throwDeviceInvalid();
    }

    if (payload.typ !== "kiosk_device_access" || !payload.sub) {
      throwDeviceInvalid();
    }

    const device = await this.prisma.kioskDevice.findUnique({
      where: { id: payload.sub },
      include: assignmentInclude(),
    });
    if (!device) {
      throw new ApiErrorException(
        HttpStatus.UNAUTHORIZED,
        KIOSK_ERROR_CODES.deviceUnpaired,
        "Kiosk device is not paired.",
      );
    }
    assertDeviceActive(device.status);
    return device;
  }

  async me(authorization: string | undefined): Promise<KioskDeviceResponseDto> {
    return mapDevice(await this.requireDevice(authorization));
  }

  async heartbeat(
    authorization: string | undefined,
    input: KioskHeartbeatDto,
  ): Promise<KioskDeviceResponseDto> {
    const device = await this.requireDevice(authorization);
    const updated = await this.prisma.kioskDevice.update({
      where: { id: device.id },
      data: {
        lastSeenAt: new Date(),
        ...(input.platform !== undefined ? { platform: input.platform } : {}),
        ...(input.appVersion !== undefined
          ? { appVersion: input.appVersion }
          : {}),
      },
      include: assignmentInclude(),
    });
    return mapDevice(updated);
  }

  async listDevices(): Promise<KioskDeviceListResponseDto> {
    const data = await this.prisma.kioskDevice.findMany({
      where: { status: { not: KioskDeviceStatus.DELETED } },
      include: assignmentInclude(),
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 100,
    });
    return { data: data.map(mapDevice) };
  }

  async assignmentOptions() {
    const [organizations, stores] = await Promise.all([
      this.prisma.organization.findMany({
        where: { status: OrganizationStatus.ACTIVE },
        select: { id: true, name: true, status: true },
        orderBy: { name: "asc" },
      }),
      this.prisma.store.findMany({
        select: { id: true, orgId: true, name: true, status: true },
        orderBy: { name: "asc" },
      }),
    ]);
    return {
      organizations,
      stores: stores.map((store) => ({
        id: store.id,
        organizationId: store.orgId,
        name: store.name,
        status: store.status,
      })),
    };
  }

  async updateDevice(
    actorUserId: string,
    deviceId: string,
    input: UpdateKioskDeviceDto,
  ): Promise<KioskDeviceResponseDto> {
    const displayName = input.displayName.trim();
    if (!displayName) {
      throw new ApiErrorException(
        HttpStatus.BAD_REQUEST,
        KIOSK_ERROR_CODES.deviceUpdateInvalid,
        "Kiosk name is required.",
      );
    }

    const device = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.kioskDevice.findUnique({
        where: { id: deviceId },
      });
      assertManageableDeviceExists(existing);

      const updated = await tx.kioskDevice.update({
        where: { id: deviceId },
        data: { displayName },
        include: assignmentInclude(),
      });
      await tx.auditLog.create({
        data: {
          id: createSelfxId(),
          action: KIOSK_AUDIT_ACTIONS.updated,
          actorUserId,
          organizationId: updated.organizationId,
          storeId: updated.storeId,
          resourceType: "kiosk_device",
          resourceId: updated.id,
          metadata: {
            changedFields: ["displayName"],
          },
        },
      });
      return updated;
    });
    return mapDevice(device);
  }

  async activateDevice(
    actorUserId: string,
    deviceId: string,
  ): Promise<KioskDeviceResponseDto> {
    const device = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.kioskDevice.findUnique({
        where: { id: deviceId },
      });
      assertManageableDeviceExists(existing);

      if (existing.status === KioskDeviceStatus.ACTIVE) {
        return tx.kioskDevice.findUniqueOrThrow({
          where: { id: deviceId },
          include: assignmentInclude(),
        });
      }

      if (existing.status !== KioskDeviceStatus.INACTIVE) {
        throw new ApiErrorException(
          HttpStatus.CONFLICT,
          KIOSK_ERROR_CODES.deviceRevoked,
          "Only inactive kiosk devices can be activated.",
        );
      }

      const updated = await tx.kioskDevice.update({
        where: { id: deviceId },
        data: { status: KioskDeviceStatus.ACTIVE, inactiveAt: null },
        include: assignmentInclude(),
      });
      await tx.auditLog.create({
        data: {
          id: createSelfxId(),
          action: KIOSK_AUDIT_ACTIONS.activated,
          actorUserId,
          organizationId: updated.organizationId,
          storeId: updated.storeId,
          resourceType: "kiosk_device",
          resourceId: updated.id,
        },
      });
      return updated;
    });
    return mapDevice(device);
  }

  async deactivateDevice(
    actorUserId: string,
    deviceId: string,
  ): Promise<KioskDeviceResponseDto> {
    const now = new Date();
    const device = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.kioskDevice.findUnique({
        where: { id: deviceId },
      });
      assertManageableDeviceExists(existing);

      if (existing.status === KioskDeviceStatus.INACTIVE) {
        return tx.kioskDevice.findUniqueOrThrow({
          where: { id: deviceId },
          include: assignmentInclude(),
        });
      }

      if (existing.status !== KioskDeviceStatus.ACTIVE) {
        throw new ApiErrorException(
          HttpStatus.CONFLICT,
          KIOSK_ERROR_CODES.deviceRevoked,
          "Only active kiosk devices can be deactivated.",
        );
      }

      const updated = await tx.kioskDevice.update({
        where: { id: deviceId },
        data: { status: KioskDeviceStatus.INACTIVE, inactiveAt: now },
        include: assignmentInclude(),
      });
      await tx.auditLog.create({
        data: {
          id: createSelfxId(),
          action: KIOSK_AUDIT_ACTIONS.deactivated,
          actorUserId,
          organizationId: updated.organizationId,
          storeId: updated.storeId,
          resourceType: "kiosk_device",
          resourceId: updated.id,
        },
      });
      return updated;
    });
    return mapDevice(device);
  }

  async revokeDevice(
    actorUserId: string,
    deviceId: string,
  ): Promise<KioskDeviceResponseDto> {
    const device = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.kioskDevice.findUnique({
        where: { id: deviceId },
      });
      assertManageableDeviceExists(existing);

      await tx.kioskDeviceSession.updateMany({
        where: { kioskDeviceId: deviceId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      const updated = await tx.kioskDevice.update({
        where: { id: deviceId },
        data: { status: KioskDeviceStatus.REVOKED, revokedAt: new Date() },
        include: assignmentInclude(),
      });
      await tx.auditLog.create({
        data: {
          id: createSelfxId(),
          action: KIOSK_AUDIT_ACTIONS.unpaired,
          actorUserId,
          organizationId: updated.organizationId,
          storeId: updated.storeId,
          resourceType: "kiosk_device",
          resourceId: updated.id,
        },
      });
      return updated;
    });
    return mapDevice(device);
  }

  async deleteDevice(
    actorUserId: string,
    deviceId: string,
  ): Promise<KioskDeviceResponseDto> {
    const now = new Date();
    const device = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.kioskDevice.findUnique({
        where: { id: deviceId },
      });
      assertManageableDeviceExists(existing);

      await tx.kioskDeviceSession.updateMany({
        where: { kioskDeviceId: deviceId, revokedAt: null },
        data: { revokedAt: now },
      });
      const updated = await tx.kioskDevice.update({
        where: { id: deviceId },
        data: {
          status: KioskDeviceStatus.DELETED,
          deletedAt: now,
          revokedAt: existing.revokedAt ?? now,
        },
        include: assignmentInclude(),
      });
      await tx.auditLog.create({
        data: {
          id: createSelfxId(),
          action: KIOSK_AUDIT_ACTIONS.deleted,
          actorUserId,
          organizationId: updated.organizationId,
          storeId: updated.storeId,
          resourceType: "kiosk_device",
          resourceId: updated.id,
        },
      });
      return updated;
    });
    return mapDevice(device);
  }

  private async issueDeviceTokens(
    device: DeviceWithAssignment,
  ): Promise<KioskDeviceAuthResponseDto> {
    const sessionId = createSelfxId();
    const refreshToken = createRefreshToken(sessionId);
    const refreshExpiresAt = new Date(
      Date.now() + this.config.deviceRefreshSessionTtlSeconds * 1000,
    );
    await this.prisma.kioskDeviceSession.create({
      data: {
        id: sessionId,
        kioskDeviceId: device.id,
        refreshTokenHash: this.digestDeviceRefreshToken(refreshToken),
        expiresAt: refreshExpiresAt,
        lastUsedAt: new Date(),
      },
    });
    return this.createAuthResponse(device, refreshToken, refreshExpiresAt);
  }

  private async createAuthResponse(
    device: DeviceWithAssignment,
    refreshToken: string,
    refreshExpiresAt: Date,
  ): Promise<KioskDeviceAuthResponseDto> {
    const accessToken = await this.jwt.signAsync(
      {
        sub: device.id,
        typ: "kiosk_device_access",
      } satisfies DeviceAccessTokenPayload,
      {
        secret: this.config.deviceJwtSecret,
        expiresIn: this.config.deviceAccessTokenTtlSeconds,
      },
    );
    return {
      accessToken,
      accessTokenExpiresAt: new Date(
        Date.now() + this.config.deviceAccessTokenTtlSeconds * 1000,
      ).toISOString(),
      refreshToken,
      refreshTokenExpiresAt: refreshExpiresAt.toISOString(),
      device: mapDevice(device),
    };
  }

  private async generateAvailablePairingCode(now: Date): Promise<string> {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const code = randomInt(0, 1_000_000).toString().padStart(6, "0");
      const exists = await this.prisma.kioskPairingSession.findFirst({
        where: {
          codeDigest: this.digestPairingCode(code),
          status: KioskPairingSessionStatus.PENDING,
          expiresAt: { gt: now },
        },
        select: { id: true },
      });
      if (!exists) {
        return code;
      }
    }
    throw new ApiErrorException(
      HttpStatus.SERVICE_UNAVAILABLE,
      KIOSK_ERROR_CODES.rateLimited,
      "Could not create a pairing code right now.",
    );
  }

  private async expireStalePairingSessions(): Promise<void> {
    await this.prisma.kioskPairingSession.updateMany({
      where: {
        status: KioskPairingSessionStatus.PENDING,
        expiresAt: { lte: new Date() },
      },
      data: { status: KioskPairingSessionStatus.EXPIRED },
    });
  }

  private async resolveAssignment(input: PairKioskDto): Promise<{
    organizationId: string | null;
    storeId: string | null;
  }> {
    if (input.assignmentScope === KioskAssignmentScope.PLATFORM) {
      if (input.organizationId || input.storeId) {
        throwAssignmentInvalid();
      }
      return { organizationId: null, storeId: null };
    }

    if (!input.organizationId) {
      throwAssignmentInvalid();
    }
    const organization = await this.prisma.organization.findUnique({
      where: { id: input.organizationId },
      select: { id: true, status: true },
    });
    if (!organization || organization.status !== OrganizationStatus.ACTIVE) {
      throwAssignmentInvalid();
    }

    if (input.assignmentScope === KioskAssignmentScope.ORGANIZATION) {
      if (input.storeId) {
        throwAssignmentInvalid();
      }
      return { organizationId: input.organizationId, storeId: null };
    }

    if (!input.storeId) {
      throwAssignmentInvalid();
    }
    const store = await this.prisma.store.findUnique({
      where: {
        orgId_id: { orgId: input.organizationId, id: input.storeId },
      },
      select: { id: true, status: true },
    });
    if (!store || store.status !== StoreStatus.ACTIVE) {
      throwAssignmentInvalid();
    }
    return { organizationId: input.organizationId, storeId: input.storeId };
  }

  private digestPairingCode(code: string): string {
    return hmac(this.config.pairingCodePepper, canonicalPairingCode(code));
  }

  private digestProvisioningSecret(secret: string): string {
    return hmac(this.config.provisioningSecretPepper, secret);
  }

  private digestDeviceRefreshToken(token: string): string {
    return hmac(this.config.deviceRefreshTokenPepper, token);
  }

  private createProvisioningGrant(
    sessionId: string,
    provisioningSecretHash: string,
    kioskDeviceId: string,
  ): string {
    return hmac(
      this.config.provisioningSecretPepper,
      `grant:${sessionId}:${provisioningSecretHash}:${kioskDeviceId}`,
    );
  }

  private assertCreateSessionAllowed(ipAddress: string): void {
    const now = Date.now();
    const key = `pairing:${ipAddress}`;
    const current = this.createBuckets.get(key);
    if (!current || current.resetAt <= now) {
      this.createBuckets.set(key, { count: 1, resetAt: now + 60_000 });
      return;
    }
    current.count += 1;
    if (current.count > 20) {
      throw new ApiErrorException(
        HttpStatus.TOO_MANY_REQUESTS,
        KIOSK_ERROR_CODES.rateLimited,
        "Too many pairing requests. Try again later.",
      );
    }
  }
}

export function canonicalPairingCode(value: string): string {
  const code = value.trim();
  if (!KIOSK_PAIRING_CODE_PATTERN.test(code)) {
    throw new ApiErrorException(
      HttpStatus.BAD_REQUEST,
      KIOSK_ERROR_CODES.pairingInvalid,
      "Pairing code expired or invalid.",
    );
  }
  return code;
}

export function mapDevice(
  device: DeviceWithAssignment,
): KioskDeviceResponseDto {
  return {
    id: device.id,
    displayName: device.displayName,
    status: device.status,
    assignment: {
      scope: device.assignmentScope,
      organizationId: device.organizationId,
      organizationName: device.organization?.name ?? null,
      storeId: device.storeId,
      storeName: device.store?.name ?? null,
    },
    platform: device.platform,
    appVersion: device.appVersion,
    installationId: device.installationId,
    pairedAt: device.pairedAt.toISOString(),
    lastSeenAt: device.lastSeenAt?.toISOString() ?? null,
    inactiveAt: device.inactiveAt?.toISOString() ?? null,
    revokedAt: device.revokedAt?.toISOString() ?? null,
    deletedAt: device.deletedAt?.toISOString() ?? null,
    createdAt: device.createdAt.toISOString(),
    updatedAt: device.updatedAt.toISOString(),
    latestConfigurationVersion: device.configuration?.version ?? 1,
  };
}

function assignmentInclude() {
  return {
    organization: { select: { id: true, name: true } },
    store: { select: { id: true, name: true } },
    configuration: { select: { version: true } },
  } as const;
}

function hmac(pepper: string, value: string): string {
  return createHmac("sha256", pepper).update(value).digest("base64url");
}

function randomOpaque(bytes: number): string {
  return randomBytes(bytes).toString("base64url");
}

function constantTimeEqual(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  return (
    leftBytes.length === rightBytes.length &&
    timingSafeEqual(leftBytes, rightBytes)
  );
}

function createRefreshToken(sessionId: string): string {
  return `${sessionId}.${randomBytes(KIOSK_DEVICE_REFRESH_TOKEN_BYTES).toString(
    "base64url",
  )}`;
}

function rewriteRefreshSessionId(token: string, sessionId: string): string {
  const [, secret] = token.split(".");
  return `${sessionId}.${secret}`;
}

function parseRefreshToken(token: string): RefreshTokenParts | null {
  const [sessionId, secret, extra] = token.split(".");
  if (!sessionId || !secret || extra !== undefined) {
    return null;
  }
  return { sessionId, secret };
}

function extractBearerToken(
  headerValue: string | undefined,
): string | undefined {
  if (!headerValue) {
    return undefined;
  }
  const [scheme, token, extra] = headerValue.split(" ");
  if (scheme !== "Bearer" || !token || extra !== undefined) {
    return undefined;
  }
  return token;
}

function throwAssignmentInvalid(): never {
  throw new ApiErrorException(
    HttpStatus.BAD_REQUEST,
    KIOSK_ERROR_CODES.assignmentInvalid,
    "Kiosk assignment is invalid.",
  );
}

function throwDeviceInvalid(): never {
  throw new ApiErrorException(
    HttpStatus.UNAUTHORIZED,
    KIOSK_ERROR_CODES.deviceTokenInvalid,
    "Device token is invalid.",
  );
}

function throwDeviceRevoked(): never {
  throw new ApiErrorException(
    HttpStatus.FORBIDDEN,
    KIOSK_ERROR_CODES.deviceRevoked,
    "Kiosk device has been revoked.",
  );
}

function throwDeviceInactive(): never {
  throw new ApiErrorException(
    HttpStatus.FORBIDDEN,
    KIOSK_ERROR_CODES.deviceInactive,
    "Kiosk device is inactive.",
  );
}

function throwDeviceDeleted(): never {
  throw new ApiErrorException(
    HttpStatus.FORBIDDEN,
    KIOSK_ERROR_CODES.deviceDeleted,
    "Kiosk device has been deleted.",
  );
}

function assertDeviceActive(status: KioskDeviceStatus): void {
  switch (status) {
    case KioskDeviceStatus.ACTIVE:
      return;
    case KioskDeviceStatus.INACTIVE:
      throwDeviceInactive();
    case KioskDeviceStatus.DELETED:
      throwDeviceDeleted();
    case KioskDeviceStatus.REVOKED:
      throwDeviceRevoked();
  }
}

function assertManageableDeviceExists<T extends Pick<KioskDevice, "status">>(
  device: T | null,
): asserts device is T {
  if (!device || device.status === KioskDeviceStatus.DELETED) {
    throw new ApiErrorException(
      HttpStatus.NOT_FOUND,
      KIOSK_ERROR_CODES.deviceUnpaired,
      "Kiosk device was not found.",
    );
  }
}
