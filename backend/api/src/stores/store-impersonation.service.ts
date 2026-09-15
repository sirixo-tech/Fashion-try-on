import { HttpStatus, Injectable } from "@nestjs/common";
import { ImpersonationSessionStatus, OrganizationStatus } from "@prisma/client";

import { createSelfxId } from "@selfx/database";

import { ApiErrorException } from "../common/api-error.exception.js";
import { PrismaService } from "../database/prisma.service.js";
import {
  type StoreImpersonationSessionDto,
  type StoreImpersonationSessionResponseDto,
  type CurrentStoreImpersonationSessionResponseDto,
} from "./dto/store-impersonation.dto.js";

export const STORE_IMPERSONATION_ERROR_CODES = {
  storeNotFound: "STORE_NOT_FOUND",
  sessionNotFound: "IMPERSONATION_SESSION_NOT_FOUND",
  storeMismatch: "IMPERSONATION_STORE_MISMATCH",
} as const;

const impersonationTtlMs = 30 * 60 * 1000;

type SessionWithStore = {
  id: string;
  actorUserId: string;
  targetStoreId: string;
  status: ImpersonationSessionStatus;
  startedAt: Date;
  expiresAt: Date;
  endedAt: Date | null;
  targetStore: {
    id: string;
    name: string;
    slug: string;
  };
};

export type StoreImpersonationContext = {
  actorUserId: string;
  effectiveStoreId: string;
  impersonationSession: StoreImpersonationSessionDto | null;
};

@Injectable()
export class StoreImpersonationService {
  constructor(private readonly prisma: PrismaService) {}

  async startSession(
    actorUserId: string,
    targetStoreId: string,
  ): Promise<StoreImpersonationSessionResponseDto> {
    const store = await this.prisma.organization.findFirst({
      where: {
        id: targetStoreId,
        status: { not: OrganizationStatus.ARCHIVED },
      },
      select: { id: true, name: true, slug: true },
    });
    if (!store) {
      throw new ApiErrorException(
        HttpStatus.NOT_FOUND,
        STORE_IMPERSONATION_ERROR_CODES.storeNotFound,
        "Store was not found.",
      );
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + impersonationTtlMs);
    const sessionId = createSelfxId();
    const session = await this.prisma.$transaction(async (tx) => {
      const created = await tx.impersonationSession.create({
        data: {
          id: sessionId,
          actorUserId,
          targetStoreId,
          startedAt: now,
          expiresAt,
        },
        include: sessionInclude(),
      });
      await tx.auditLog.create({
        data: {
          id: createSelfxId(),
          actorUserId,
          action: "IMPERSONATION_SESSION_STARTED",
          resourceType: "impersonation_session",
          resourceId: sessionId,
          metadata: {
            target_store_id: targetStoreId,
          },
        },
      });
      return created;
    });

    return { session: mapSession(session) };
  }

  async currentSession(
    actorUserId: string,
    sessionId?: string,
  ): Promise<CurrentStoreImpersonationSessionResponseDto> {
    const session = await this.findActiveSession(actorUserId, sessionId);

    return { session: session ? mapSession(session) : null };
  }

  async resolveStoreContext(
    actorUserId: string,
    requestedStoreId: string,
  ): Promise<StoreImpersonationContext> {
    const session = await this.findActiveSession(actorUserId);
    if (!session) {
      return {
        actorUserId,
        effectiveStoreId: requestedStoreId,
        impersonationSession: null,
      };
    }

    if (session.targetStoreId !== requestedStoreId) {
      throw new ApiErrorException(
        HttpStatus.FORBIDDEN,
        STORE_IMPERSONATION_ERROR_CODES.storeMismatch,
        "This impersonation session can only access its target Store.",
      );
    }

    return {
      actorUserId,
      effectiveStoreId: session.targetStoreId,
      impersonationSession: mapSession(session),
    };
  }

  async endSession(
    actorUserId: string,
    sessionId: string,
  ): Promise<StoreImpersonationSessionResponseDto> {
    await this.expireStaleSessions();
    const existing = await this.prisma.impersonationSession.findFirst({
      where: { id: sessionId, actorUserId },
      include: sessionInclude(),
    });
    if (!existing) {
      throw new ApiErrorException(
        HttpStatus.NOT_FOUND,
        STORE_IMPERSONATION_ERROR_CODES.sessionNotFound,
        "Impersonation session was not found.",
      );
    }
    if (existing.status !== ImpersonationSessionStatus.ACTIVE) {
      return { session: mapSession(existing) };
    }

    const endedAt = new Date();
    const session = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.impersonationSession.update({
        where: { id: sessionId },
        data: {
          status: ImpersonationSessionStatus.ENDED,
          endedAt,
        },
        include: sessionInclude(),
      });
      await tx.auditLog.create({
        data: {
          id: createSelfxId(),
          actorUserId,
          action: "IMPERSONATION_SESSION_ENDED",
          resourceType: "impersonation_session",
          resourceId: sessionId,
          metadata: {
            target_store_id: existing.targetStoreId,
          },
        },
      });
      return updated;
    });

    return { session: mapSession(session) };
  }

  private async expireStaleSessions(): Promise<void> {
    await this.prisma.impersonationSession.updateMany({
      where: {
        status: ImpersonationSessionStatus.ACTIVE,
        endedAt: null,
        expiresAt: { lte: new Date() },
      },
      data: { status: ImpersonationSessionStatus.EXPIRED },
    });
  }

  private async findActiveSession(
    actorUserId: string,
    sessionId?: string,
  ): Promise<SessionWithStore | null> {
    await this.expireStaleSessions();
    return this.prisma.impersonationSession.findFirst({
      where: {
        actorUserId,
        ...(sessionId ? { id: sessionId } : {}),
        status: ImpersonationSessionStatus.ACTIVE,
        endedAt: null,
        expiresAt: { gt: new Date() },
        targetStore: {
          status: { not: OrganizationStatus.ARCHIVED },
        },
      },
      include: sessionInclude(),
      orderBy: { startedAt: "desc" },
    });
  }
}

function sessionInclude() {
  return {
    targetStore: { select: { id: true, name: true, slug: true } },
  };
}

function mapSession(session: SessionWithStore): StoreImpersonationSessionDto {
  return {
    id: session.id,
    actorUserId: session.actorUserId,
    targetStoreId: session.targetStoreId,
    targetStoreName: session.targetStore.name,
    targetStoreSlug: session.targetStore.slug,
    status: session.status,
    startedAt: session.startedAt.toISOString(),
    expiresAt: session.expiresAt.toISOString(),
    endedAt: session.endedAt?.toISOString() ?? null,
  };
}
