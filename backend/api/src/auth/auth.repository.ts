import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";

import { createSelfxId } from "@selfx/database";

import { PrismaService } from "../database/prisma.service.js";
import {
  type AuthRepositoryPort,
  type AuthSessionRecord,
  type AuthSessionWithUserRecord,
  type AuthUserRecord,
} from "./auth.types.js";

@Injectable()
export class PrismaAuthRepository implements AuthRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async findUserByEmail(email: string): Promise<AuthUserRecord | null> {
    return this.prisma.user.findUnique({
      where: { email },
      include: activePlatformAccessInclude,
    });
  }

  async findUserById(userId: string): Promise<AuthUserRecord | null> {
    return this.prisma.user.findUnique({
      where: { id: userId },
      include: activePlatformAccessInclude,
    });
  }

  async updateUserLogin(userId: string, loggedInAt: Date): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { lastLoginAt: loggedInAt },
    });
  }

  async createUserSession(input: {
    id: string;
    userId: string;
    refreshTokenHash: string;
    expiresAt: Date;
    lastUsedAt: Date;
    deviceLabel?: string;
    userAgentJson?: Record<string, unknown>;
  }): Promise<AuthSessionRecord> {
    return this.prisma.userSession.create({
      data: {
        id: input.id,
        userId: input.userId,
        refreshTokenHash: input.refreshTokenHash,
        expiresAt: input.expiresAt,
        lastUsedAt: input.lastUsedAt,
        deviceLabel: input.deviceLabel,
        userAgentJson: input.userAgentJson as Prisma.InputJsonValue | undefined,
      },
    });
  }

  async findSessionWithUser(
    sessionId: string,
  ): Promise<AuthSessionWithUserRecord | null> {
    return this.prisma.userSession.findUnique({
      where: { id: sessionId },
      include: { user: { include: activePlatformAccessInclude } },
    });
  }

  async rotateSessionToken(input: {
    sessionId: string;
    currentRefreshTokenHash: string;
    nextRefreshTokenHash: string;
    lastUsedAt: Date;
  }): Promise<boolean> {
    const result = await this.prisma.userSession.updateMany({
      where: {
        id: input.sessionId,
        refreshTokenHash: input.currentRefreshTokenHash,
        revokedAt: null,
      },
      data: {
        refreshTokenHash: input.nextRefreshTokenHash,
        lastUsedAt: input.lastUsedAt,
      },
    });
    return result.count === 1;
  }

  async revokeSession(sessionId: string, revokedAt: Date): Promise<boolean> {
    const result = await this.prisma.userSession.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt },
    });
    return result.count === 1;
  }

  async revokeAllUserSessions(
    userId: string,
    revokedAt: Date,
  ): Promise<number> {
    const result = await this.prisma.userSession.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt },
    });
    return result.count;
  }

  async createAuditLog(input: {
    id?: string;
    actorUserId?: string;
    action: string;
    resourceType: string;
    resourceId?: string;
    requestId?: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        id: input.id ?? createSelfxId(),
        actorUserId: input.actorUserId,
        action: input.action,
        resourceType: input.resourceType,
        resourceId: input.resourceId,
        requestId: input.requestId,
        metadata: input.metadata as Prisma.InputJsonValue | undefined,
      },
    });
  }
}

const activePlatformAccessInclude = {
  platformRoleAssignments: {
    where: { status: "ACTIVE" },
    select: { status: true },
  },
  platformAccessRoleAssignments: {
    where: { status: "ACTIVE" },
    select: { status: true },
  },
} satisfies Prisma.UserInclude;
