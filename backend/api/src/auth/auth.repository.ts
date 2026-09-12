import { Injectable } from "@nestjs/common";
import {
  MembershipStatus,
  MembershipStoreScopeMode,
  OrganizationMembershipRole,
  OrganizationStatus,
  Prisma,
  UserStatus,
} from "@prisma/client";

import { createSelfxId } from "@selfx/database";

import { PrismaService } from "../database/prisma.service.js";
import { EntitlementsService } from "../entitlements/entitlements.service.js";
import { StoreRbacService } from "../rbac/store-rbac.service.js";
import {
  type AuthRepositoryPort,
  type AuthSessionRecord,
  type AuthSessionWithUserRecord,
  type AuthUserRecord,
  type SignupInput,
} from "./auth.types.js";

@Injectable()
export class PrismaAuthRepository implements AuthRepositoryPort {
  private readonly entitlements: EntitlementsService;
  private readonly rbac: StoreRbacService;

  constructor(private readonly prisma: PrismaService) {
    this.entitlements = new EntitlementsService(prisma);
    this.rbac = new StoreRbacService(prisma);
  }

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

  async createSelfServeSignup(
    input: SignupInput,
  ): Promise<AuthUserRecord | null> {
    return this.prisma.$transaction(async (tx) => {
      const existingUser = await tx.user.findUnique({
        where: { email: input.email },
        select: { id: true },
      });
      if (existingUser) {
        return null;
      }

      const now = new Date();
      const user = await tx.user.create({
        data: {
          id: createSelfxId(),
          email: input.email,
          passwordHash: input.passwordHash,
          displayName: input.displayName,
          status: UserStatus.ACTIVE,
          lastLoginAt: now,
        },
        include: activePlatformAccessInclude,
      });
      const storeName = storeNameForSignup(input.displayName, input.email);
      const organization = await tx.organization.create({
        data: {
          id: createSelfxId(),
          name: storeName,
          slug: await uniqueStoreSlug(tx, storeName, input.email),
          status: OrganizationStatus.ACTIVE,
          timezone: "UTC",
          settings: {
            source: "SELF_SERVE_SIGNUP",
            signup: jsonObjectFromRecord(input.metadata),
          } satisfies Prisma.InputJsonObject,
        },
      });

      await this.rbac.ensureStoreRbacInTransaction(tx, organization.id, true);
      await this.entitlements.ensureTrialCredits(organization.id, tx);

      await tx.organizationMembership.create({
        data: {
          id: createSelfxId(),
          orgId: organization.id,
          userId: user.id,
          role: OrganizationMembershipRole.ORGANIZATION_OWNER,
          storeScopeMode: MembershipStoreScopeMode.ALL_STORES,
          status: MembershipStatus.ACTIVE,
          joinedAt: now,
        },
      });

      return user;
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

function storeNameForSignup(displayName: string, email: string): string {
  const cleanName = displayName.trim() || email.split("@")[0] || "SelfX";
  const suffix = cleanName.toLowerCase().endsWith("store") ? "" : " Store";
  return `${cleanName}${suffix}`.slice(0, 200);
}

async function uniqueStoreSlug(
  tx: Prisma.TransactionClient,
  storeName: string,
  email: string,
): Promise<string> {
  const base = slugFromText(storeName) || slugFromText(email.split("@")[0] ?? "");
  const safeBase = (base || `store-${createSelfxId()}`).slice(0, 96);
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const slug =
      attempt === 0
        ? safeBase
        : `${safeBase}-${createSelfxId().replace(/-/g, "").slice(0, 8)}`;
    const existing = await tx.organization.findUnique({
      where: { slug },
      select: { id: true },
    });
    if (!existing) {
      return slug;
    }
  }
  return `store-${createSelfxId()}`;
}

function slugFromText(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "");
}

function jsonObjectFromRecord(
  value: Record<string, unknown> | undefined,
): Prisma.InputJsonObject {
  const json: Record<string, string | number | boolean> = {};
  for (const [key, item] of Object.entries(value ?? {})) {
    if (
      typeof item === "string" ||
      typeof item === "number" ||
      typeof item === "boolean"
    ) {
      json[key] = item;
    }
  }
  return json as Prisma.InputJsonObject;
}
