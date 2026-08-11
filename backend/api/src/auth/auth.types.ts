import { type UserStatus } from "@prisma/client";

export interface AuthUserRecord {
  id: string;
  email: string;
  passwordHash: string;
  displayName: string | null;
  status: UserStatus;
  emailVerifiedAt: Date | null;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface AuthSessionRecord {
  id: string;
  userId: string;
  refreshTokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
  lastUsedAt: Date | null;
  deviceLabel: string | null;
  userAgentJson: unknown;
  createdAt: Date;
}

export interface AuthSessionWithUserRecord extends AuthSessionRecord {
  user: AuthUserRecord;
}

export interface AuthUserResponse {
  id: string;
  email: string;
  displayName: string | null;
  status: UserStatus;
}

export interface RequestMetadata {
  ipAddress: string;
  userAgent: string | undefined;
  origin: string | undefined;
}

export interface AuthResult {
  accessToken: string;
  accessTokenExpiresAt: string;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
  user: AuthUserResponse;
}

export interface LogoutAllResult {
  revokedSessions: number;
}

export interface AuthRepositoryPort {
  findUserByEmail(email: string): Promise<AuthUserRecord | null>;
  findUserById(userId: string): Promise<AuthUserRecord | null>;
  updateUserLogin(userId: string, loggedInAt: Date): Promise<void>;
  createUserSession(input: {
    id: string;
    userId: string;
    refreshTokenHash: string;
    expiresAt: Date;
    lastUsedAt: Date;
    deviceLabel?: string;
    userAgentJson?: Record<string, unknown>;
  }): Promise<AuthSessionRecord>;
  findSessionWithUser(
    sessionId: string,
  ): Promise<AuthSessionWithUserRecord | null>;
  rotateSessionToken(input: {
    sessionId: string;
    currentRefreshTokenHash: string;
    nextRefreshTokenHash: string;
    lastUsedAt: Date;
  }): Promise<boolean>;
  revokeSession(sessionId: string, revokedAt: Date): Promise<boolean>;
  revokeAllUserSessions(userId: string, revokedAt: Date): Promise<number>;
  createAuditLog(input: {
    id: string;
    actorUserId?: string;
    action: string;
    resourceType: string;
    resourceId?: string;
    requestId?: string;
    metadata?: Record<string, unknown>;
  }): Promise<void>;
}
