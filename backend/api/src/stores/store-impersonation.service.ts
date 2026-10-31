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
  authSessionInvalid: "IMPERSONATION_AUTH_SESSION_INVALID",
} as const;

type SessionWithStore = {
  id: string;
  actorUserId: string | null;
  actorUserSessionId: string | null;
  targetStoreId: string;
  effectiveRoleCode: string;
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
    actorUserSessionId: string | null | undefined,
    targetStoreId: string,
    effectiveRoleCode: "store-admin" | "staff" = "store-admin",
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
    const actorSession = actorUserSessionId
      ? await this.prisma.userSession.findFirst({
          where: {
            id: actorUserSessionId,
            userId: actorUserId,
            revokedAt: null,
            expiresAt: { gt: now },
          },
          select: { id: true, expiresAt: true },
        })
      : null;
    if (!actorSession) {
      throw new ApiErrorException(
        HttpStatus.UNAUTHORIZED,
        STORE_IMPERSONATION_ERROR_CODES.authSessionInvalid,
        "Sign in again before starting Store impersonation.",
      );
    }
    const sessionId = createSelfxId();
    const session = await this.prisma.$transaction(async (tx) => {
      const previous = await tx.impersonationSession.findMany({
        where: {
          actorUserId,
          status: ImpersonationSessionStatus.ACTIVE,
          endedAt: null,
        },
        select: { id: true, targetStoreId: true },
      });
      if (previous.length) {
        await tx.impersonationSession.updateMany({
          where: { id: { in: previous.map((entry) => entry.id) } },
          data: { status: ImpersonationSessionStatus.ENDED, endedAt: now },
        });
        await Promise.all(
          previous.map((entry) =>
            tx.auditLog.create({
              data: {
                id: createSelfxId(),
                actorUserId,
                action: "IMPERSONATION_SESSION_ENDED",
                resourceType: "impersonation_session",
                resourceId: entry.id,
                metadata: { target_store_id: entry.targetStoreId },
              },
            }),
          ),
        );
      }
      const created = await tx.impersonationSession.create({
        data: {
          id: sessionId,
          actorUserId,
          actorUserSessionId: actorSession.id,
          targetStoreId,
          effectiveRoleCode,
          startedAt: now,
          expiresAt: actorSession.expiresAt,
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
            effective_role_code: effectiveRoleCode,
          },
        },
      });
      return created;
    });

    return { session: mapSession(session) };
  }

  async currentSession(
    actorUserId: string,
    actorUserSessionId: string | null | undefined,
    sessionId?: string,
  ): Promise<CurrentStoreImpersonationSessionResponseDto> {
    const session = actorUserSessionId
      ? await this.findActiveSession(actorUserId, actorUserSessionId, sessionId)
      : null;

    return { session: session ? mapSession(session) : null };
  }

  async resolveStoreContext(
    actorUserId: string,
    requestedStoreId: string,
    actorUserSessionId?: string | null,
  ): Promise<StoreImpersonationContext> {
    const session = actorUserSessionId
      ? await this.findActiveSession(actorUserId, actorUserSessionId)
      : null;
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
    actorUserSessionId: string | null | undefined,
    sessionId: string,
  ): Promise<StoreImpersonationSessionResponseDto> {
    await this.expireStaleSessions();
    if (!actorUserSessionId) {
      throw new ApiErrorException(
        HttpStatus.UNAUTHORIZED,
        STORE_IMPERSONATION_ERROR_CODES.authSessionInvalid,
        "Sign in again before ending Store impersonation.",
      );
    }
    const existing = await this.prisma.impersonationSession.findFirst({
      where: { id: sessionId, actorUserId, actorUserSessionId },
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
        OR: [
          { expiresAt: { lte: new Date() } },
          { actorUserSessionId: null },
          { actorUserSession: { is: { revokedAt: { not: null } } } },
          { actorUserSession: { is: { expiresAt: { lte: new Date() } } } },
        ],
      },
      data: { status: ImpersonationSessionStatus.EXPIRED },
    });
  }

  private async findActiveSession(
    actorUserId: string,
    actorUserSessionId: string,
    sessionId?: string,
  ): Promise<SessionWithStore | null> {
    await this.expireStaleSessions();
    return this.prisma.impersonationSession.findFirst({
      where: {
        actorUserId,
        actorUserSessionId,
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
    effectiveRoleCode: session.effectiveRoleCode,
    status: session.status,
    startedAt: session.startedAt.toISOString(),
    expiresAt: session.expiresAt.toISOString(),
    endedAt: session.endedAt?.toISOString() ?? null,
  };
}
