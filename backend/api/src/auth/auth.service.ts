import { createHash } from "node:crypto";

import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { type UserStatus } from "@prisma/client";

import { createSelfxId } from "@selfx/database";

import { ApiErrorException } from "../common/api-error.exception.js";
import {
  AUTH_AUDIT_ACTIONS,
  AUTH_CONFIG,
  AUTH_ERROR_CODES,
  AUTH_REPOSITORY,
} from "./auth.constants.js";
import { type AuthConfig } from "./auth.config.js";
import { AuthRateLimiterService } from "./rate-limiter.service.js";
import {
  type AuthRepositoryPort,
  type AuthResult,
  type AuthUserRecord,
  type AuthUserResponse,
  type LogoutAllResult,
  type RequestMetadata,
} from "./auth.types.js";
import { PasswordService } from "./password.service.js";
import { RefreshTokenService } from "./refresh-token.service.js";

interface AccessTokenPayload {
  sub: string;
  typ: "access";
}

@Injectable()
export class AuthService {
  private readonly dummyPasswordHash: Promise<string>;

  constructor(
    @Inject(AUTH_REPOSITORY) private readonly repository: AuthRepositoryPort,
    @Inject(AUTH_CONFIG) private readonly config: AuthConfig,
    private readonly passwords: PasswordService,
    private readonly refreshTokens: RefreshTokenService,
    private readonly jwt: JwtService,
    private readonly rateLimiter: AuthRateLimiterService,
  ) {
    this.dummyPasswordHash = this.passwords.hashPassword(
      "SelfX dummy password for uniform auth timing",
    );
  }

  async login(
    email: string,
    password: string,
    metadata: RequestMetadata,
  ): Promise<AuthResult> {
    const normalizedEmail = normalizeEmail(email);
    this.rateLimiter.assertLoginAllowed(metadata.ipAddress, normalizedEmail);

    const user = await this.repository.findUserByEmail(normalizedEmail);
    const passwordHash = user?.passwordHash ?? (await this.dummyPasswordHash);
    const passwordMatches = await this.passwords.verifyPassword(
      passwordHash,
      password,
    );

    if (!user || !passwordMatches) {
      await this.auditLoginFailure(normalizedEmail, "invalid_credentials");
      throwInvalidCredentials();
    }

    if (!isActiveUser(user.status)) {
      await this.audit(AUTH_AUDIT_ACTIONS.loginFailed, {
        actorUserId: user.id,
        resourceType: "user",
        resourceId: user.id,
        metadata: { reason: "user_not_active", status: user.status },
      });
      throw new ApiErrorException(
        HttpStatus.FORBIDDEN,
        AUTH_ERROR_CODES.userDisabled,
        "User is disabled or suspended.",
      );
    }

    const result = await this.issueTokens(user, metadata);
    await this.repository.updateUserLogin(user.id, new Date());
    await this.audit(AUTH_AUDIT_ACTIONS.loginSuccess, {
      actorUserId: user.id,
      resourceType: "user",
      resourceId: user.id,
      metadata: safeRequestMetadata(metadata),
    });
    return result;
  }

  async refresh(
    rawRefreshToken: string | undefined,
    metadata: RequestMetadata,
  ): Promise<AuthResult> {
    this.rateLimiter.assertRefreshAllowed(metadata.ipAddress);

    const parts = this.refreshTokens.parse(rawRefreshToken);
    if (!parts || !rawRefreshToken) {
      await this.auditRefreshRejected("malformed_token");
      throwInvalidRefreshToken();
    }

    const session = await this.repository.findSessionWithUser(parts.sessionId);
    if (!session || session.revokedAt || session.expiresAt <= new Date()) {
      await this.auditRefreshRejected("inactive_session", parts.sessionId);
      throwInvalidRefreshToken();
    }

    if (!isActiveUser(session.user.status)) {
      await this.repository.revokeSession(session.id, new Date());
      await this.auditRefreshRejected("user_not_active", session.id);
      throw new ApiErrorException(
        HttpStatus.FORBIDDEN,
        AUTH_ERROR_CODES.userDisabled,
        "User is disabled or suspended.",
      );
    }

    if (
      !this.refreshTokens.verifyDigest(
        rawRefreshToken,
        session.refreshTokenHash,
      )
    ) {
      await this.auditRefreshRejected("digest_mismatch", session.id);
      throwInvalidRefreshToken();
    }

    const nextRefreshToken = this.refreshTokens.create(session.id);
    const rotated = await this.repository.rotateSessionToken({
      sessionId: session.id,
      currentRefreshTokenHash: session.refreshTokenHash,
      nextRefreshTokenHash: this.refreshTokens.digest(nextRefreshToken),
      lastUsedAt: new Date(),
    });
    if (!rotated) {
      await this.auditRefreshRejected("rotation_conflict", session.id);
      throwInvalidRefreshToken();
    }

    await this.audit(AUTH_AUDIT_ACTIONS.refreshSuccess, {
      actorUserId: session.user.id,
      resourceType: "user_session",
      resourceId: session.id,
      metadata: safeRequestMetadata(metadata),
    });

    return this.createAccessResult(
      session.user,
      nextRefreshToken,
      session.expiresAt,
    );
  }

  async logout(rawRefreshToken: string | undefined): Promise<void> {
    const parts = this.refreshTokens.parse(rawRefreshToken);
    if (!parts) {
      throwInvalidRefreshToken();
    }

    const session = await this.repository.findSessionWithUser(parts.sessionId);
    if (!session || !rawRefreshToken) {
      throwInvalidRefreshToken();
    }

    if (
      session.revokedAt ||
      !this.refreshTokens.verifyDigest(
        rawRefreshToken,
        session.refreshTokenHash,
      )
    ) {
      throwInvalidRefreshToken();
    }

    await this.repository.revokeSession(session.id, new Date());
    await this.audit(AUTH_AUDIT_ACTIONS.logout, {
      actorUserId: session.user.id,
      resourceType: "user_session",
      resourceId: session.id,
    });
  }

  async logoutAll(accessToken: string | undefined): Promise<LogoutAllResult> {
    const user = await this.requireAccessUser(accessToken);
    const revokedSessions = await this.repository.revokeAllUserSessions(
      user.id,
      new Date(),
    );
    await this.audit(AUTH_AUDIT_ACTIONS.logoutAll, {
      actorUserId: user.id,
      resourceType: "user",
      resourceId: user.id,
      metadata: { revoked_sessions: revokedSessions },
    });
    return { revokedSessions };
  }

  async me(accessToken: string | undefined): Promise<AuthUserResponse> {
    const user = await this.requireAccessUser(accessToken);
    return sanitizeUser(user);
  }

  async signAccessTokenForTest(
    userId: string,
    ttlSeconds?: number,
  ): Promise<string> {
    return this.jwt.signAsync(
      { sub: userId, typ: "access" } satisfies AccessTokenPayload,
      {
        secret: this.config.jwtAccessSecret,
        expiresIn: ttlSeconds ?? this.config.accessTokenTtlSeconds,
      },
    );
  }

  async requireAccessUser(
    accessToken: string | undefined,
  ): Promise<AuthUserRecord> {
    const token = extractBearerToken(accessToken);
    if (!token) {
      throwInvalidAccessToken();
    }

    let payload: AccessTokenPayload;
    try {
      payload = await this.jwt.verifyAsync<AccessTokenPayload>(token, {
        secret: this.config.jwtAccessSecret,
      });
    } catch {
      throwInvalidAccessToken();
    }

    if (payload.typ !== "access" || !payload.sub) {
      throwInvalidAccessToken();
    }

    const user = await this.repository.findUserById(payload.sub);
    if (!user) {
      throwInvalidAccessToken();
    }

    if (!isActiveUser(user.status)) {
      throw new ApiErrorException(
        HttpStatus.FORBIDDEN,
        AUTH_ERROR_CODES.userDisabled,
        "User is disabled or suspended.",
      );
    }

    return user;
  }

  private async issueTokens(
    user: AuthUserRecord,
    metadata: RequestMetadata,
  ): Promise<AuthResult> {
    const sessionId = createSelfxId();
    const refreshToken = this.refreshTokens.create(sessionId);
    const now = new Date();
    const refreshTokenExpiresAt = new Date(
      now.getTime() + this.config.refreshSessionTtlSeconds * 1000,
    );

    await this.repository.createUserSession({
      id: sessionId,
      userId: user.id,
      refreshTokenHash: this.refreshTokens.digest(refreshToken),
      expiresAt: refreshTokenExpiresAt,
      lastUsedAt: now,
      userAgentJson: safeRequestMetadata(metadata),
    });

    return this.createAccessResult(user, refreshToken, refreshTokenExpiresAt);
  }

  private async createAccessResult(
    user: AuthUserRecord,
    refreshToken: string,
    refreshTokenExpiresAt: Date,
  ): Promise<AuthResult> {
    const accessToken = await this.jwt.signAsync(
      { sub: user.id, typ: "access" } satisfies AccessTokenPayload,
      {
        secret: this.config.jwtAccessSecret,
        expiresIn: this.config.accessTokenTtlSeconds,
      },
    );
    const accessTokenExpiresAt = new Date(
      Date.now() + this.config.accessTokenTtlSeconds * 1000,
    ).toISOString();

    return {
      accessToken,
      accessTokenExpiresAt,
      refreshToken,
      refreshTokenExpiresAt,
      user: sanitizeUser(user),
    };
  }

  private async auditLoginFailure(
    email: string,
    reason: string,
  ): Promise<void> {
    await this.audit(AUTH_AUDIT_ACTIONS.loginFailed, {
      resourceType: "auth",
      metadata: {
        reason,
        email_sha256: createHash("sha256").update(email).digest("hex"),
      },
    });
  }

  private async auditRefreshRejected(
    reason: string,
    sessionId?: string,
  ): Promise<void> {
    await this.audit(AUTH_AUDIT_ACTIONS.refreshRejected, {
      resourceType: sessionId ? "user_session" : "auth",
      resourceId: sessionId,
      metadata: { reason },
    });
  }

  private async audit(
    action: string,
    input: {
      actorUserId?: string;
      resourceType: string;
      resourceId?: string;
      metadata?: Record<string, unknown>;
    },
  ): Promise<void> {
    await this.repository.createAuditLog({
      id: createSelfxId(),
      action,
      actorUserId: input.actorUserId,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      metadata: input.metadata,
    });
  }
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function sanitizeUser(user: AuthUserRecord): AuthUserResponse {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    status: user.status,
  };
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

function isActiveUser(status: UserStatus): boolean {
  return status === "ACTIVE";
}

function safeRequestMetadata(
  metadata: RequestMetadata,
): Record<string, unknown> {
  return {
    ip_address: metadata.ipAddress,
    user_agent: metadata.userAgent,
    origin: metadata.origin,
  };
}

function throwInvalidCredentials(): never {
  throw new ApiErrorException(
    HttpStatus.UNAUTHORIZED,
    AUTH_ERROR_CODES.invalidCredentials,
    "Invalid email or password.",
  );
}

function throwInvalidAccessToken(): never {
  throw new ApiErrorException(
    HttpStatus.UNAUTHORIZED,
    AUTH_ERROR_CODES.accessTokenInvalid,
    "Access token is invalid or expired.",
  );
}

function throwInvalidRefreshToken(): never {
  throw new ApiErrorException(
    HttpStatus.UNAUTHORIZED,
    AUTH_ERROR_CODES.refreshTokenInvalid,
    "Refresh session is invalid or expired.",
  );
}
