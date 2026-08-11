import { validate } from "class-validator";
import { JwtService } from "@nestjs/jwt";
import { UserStatus } from "@prisma/client";
import { beforeEach, describe, expect, it } from "vitest";

import { createSelfxId } from "@selfx/database";

import { ApiErrorException } from "../common/api-error.exception.js";
import { AUTH_ERROR_CODES } from "./auth.constants.js";
import { type AuthConfig } from "./auth.config.js";
import { AuthService, normalizeEmail } from "./auth.service.js";
import {
  type AuthRepositoryPort,
  type AuthSessionRecord,
  type AuthSessionWithUserRecord,
  type AuthUserRecord,
} from "./auth.types.js";
import { LoginDto } from "./dto/login.dto.js";
import { PasswordService } from "./password.service.js";
import { AuthRateLimiterService } from "./rate-limiter.service.js";
import { RefreshTokenService } from "./refresh-token.service.js";

const BASE_CONFIG: AuthConfig = {
  nodeEnv: "test",
  jwtAccessSecret: "test_jwt_access_secret_abcdefghijklmnopqrstuvwxyz",
  accessTokenTtlSeconds: 900,
  refreshTokenPepper: "test_refresh_pepper_abcdefghijklmnopqrstuvwxyz",
  refreshSessionTtlSeconds: 60 * 60,
  refreshCookieName: "selfx_refresh_token",
  cookieSecure: false,
  cookieSameSite: "lax",
  corsAllowedOrigins: ["http://localhost:3002"],
  loginRateLimitMax: 5,
  loginRateLimitWindowMs: 60_000,
  refreshRateLimitMax: 20,
  refreshRateLimitWindowMs: 60_000,
};

describe("PasswordService", () => {
  it("hashes and verifies passwords with Argon2id", async () => {
    const passwords = new PasswordService();
    const hash = await passwords.hashPassword("CorrectPassword123!");

    expect(hash).not.toBe("CorrectPassword123!");
    expect(hash).toContain("argon2id");
    await expect(
      passwords.verifyPassword(hash, "CorrectPassword123!"),
    ).resolves.toBe(true);
    await expect(passwords.verifyPassword(hash, "wrong")).resolves.toBe(false);
  });
});

describe("AuthService", () => {
  let repository: FakeAuthRepository;
  let passwords: PasswordService;
  let auth: AuthService;

  beforeEach(() => {
    repository = new FakeAuthRepository();
    passwords = new PasswordService();
    auth = createAuthService(repository, passwords);
  });

  it("logs in with correct credentials without returning password hashes", async () => {
    const user = await createUser(repository, passwords);

    const result = await auth.login(
      user.email,
      "CorrectPassword123!",
      requestMetadata(),
    );

    expect(result.accessToken).toEqual(expect.any(String));
    expect(result.refreshToken).toContain(".");
    expect(result.user).toEqual({
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      status: UserStatus.ACTIVE,
    });
    expect(JSON.stringify(result)).not.toContain(user.passwordHash);
    expect(repository.sessions).toHaveLength(1);
    expect(repository.sessions[0]?.refreshTokenHash).not.toBe(
      result.refreshToken,
    );
    expect(repository.auditLogs.map((log) => log.action)).toContain(
      "AUTH_LOGIN_SUCCESS",
    );
  });

  it("rejects wrong passwords and unknown users with the same stable error", async () => {
    await createUser(repository, passwords);

    await expectAuthCode(
      auth.login("admin@selfx.local", "WrongPassword123!", requestMetadata()),
      AUTH_ERROR_CODES.invalidCredentials,
    );
    await expectAuthCode(
      auth.login("unknown@selfx.local", "WrongPassword123!", requestMetadata()),
      AUTH_ERROR_CODES.invalidCredentials,
    );
  });

  it("rejects disabled users", async () => {
    await createUser(repository, passwords, { status: UserStatus.DISABLED });

    await expectAuthCode(
      auth.login("admin@selfx.local", "CorrectPassword123!", requestMetadata()),
      AUTH_ERROR_CODES.userDisabled,
    );
  });

  it("validates access tokens and rejects expired or malformed tokens", async () => {
    const user = await createUser(repository, passwords);
    const login = await auth.login(
      user.email,
      "CorrectPassword123!",
      requestMetadata(),
    );

    await expect(auth.me(`Bearer ${login.accessToken}`)).resolves.toEqual({
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      status: UserStatus.ACTIVE,
    });

    const expired = await auth.signAccessTokenForTest(user.id, -1);
    await expectAuthCode(
      auth.me(`Bearer ${expired}`),
      AUTH_ERROR_CODES.accessTokenInvalid,
    );
    await expectAuthCode(
      auth.me("Bearer not-a-jwt"),
      AUTH_ERROR_CODES.accessTokenInvalid,
    );
  });

  it("refreshes successfully, rotates the token, and rejects old refresh reuse", async () => {
    const user = await createUser(repository, passwords);
    const login = await auth.login(
      user.email,
      "CorrectPassword123!",
      requestMetadata(),
    );

    const refreshed = await auth.refresh(login.refreshToken, requestMetadata());

    expect(refreshed.accessToken).toEqual(expect.any(String));
    expect(refreshed.refreshToken).not.toBe(login.refreshToken);
    await expectAuthCode(
      auth.refresh(login.refreshToken, requestMetadata()),
      AUTH_ERROR_CODES.refreshTokenInvalid,
    );
  });

  it("rejects malformed, revoked, and expired refresh sessions", async () => {
    const user = await createUser(repository, passwords);
    const login = await auth.login(
      user.email,
      "CorrectPassword123!",
      requestMetadata(),
    );

    await expectAuthCode(
      auth.refresh("malformed", requestMetadata()),
      AUTH_ERROR_CODES.refreshTokenInvalid,
    );

    await auth.logout(login.refreshToken);
    await expectAuthCode(
      auth.refresh(login.refreshToken, requestMetadata()),
      AUTH_ERROR_CODES.refreshTokenInvalid,
    );

    const expiredLogin = await auth.login(
      user.email,
      "CorrectPassword123!",
      requestMetadata(),
    );
    repository.sessions[1]!.expiresAt = new Date(Date.now() - 1000);
    await expectAuthCode(
      auth.refresh(expiredLogin.refreshToken, requestMetadata()),
      AUTH_ERROR_CODES.refreshTokenInvalid,
    );
  });

  it("logs out the current session", async () => {
    const user = await createUser(repository, passwords);
    const login = await auth.login(
      user.email,
      "CorrectPassword123!",
      requestMetadata(),
    );

    await auth.logout(login.refreshToken);

    expect(repository.sessions[0]?.revokedAt).toBeInstanceOf(Date);
    await expectAuthCode(
      auth.refresh(login.refreshToken, requestMetadata()),
      AUTH_ERROR_CODES.refreshTokenInvalid,
    );
  });

  it("logs out all sessions for the access-token user", async () => {
    const user = await createUser(repository, passwords);
    const first = await auth.login(
      user.email,
      "CorrectPassword123!",
      requestMetadata(),
    );
    await auth.login(user.email, "CorrectPassword123!", requestMetadata());

    const result = await auth.logoutAll(`Bearer ${first.accessToken}`);

    expect(result.revokedSessions).toBe(2);
    expect(repository.sessions.every((session) => session.revokedAt)).toBe(
      true,
    );
  });

  it("rate limits repeated login attempts", async () => {
    auth = createAuthService(repository, passwords, {
      ...BASE_CONFIG,
      loginRateLimitMax: 1,
    });

    await expectAuthCode(
      auth.login("missing@selfx.local", "WrongPassword123!", requestMetadata()),
      AUTH_ERROR_CODES.invalidCredentials,
    );
    await expectAuthCode(
      auth.login("missing@selfx.local", "WrongPassword123!", requestMetadata()),
      AUTH_ERROR_CODES.rateLimited,
    );
  });
});

describe("LoginDto", () => {
  it("validates the login request shape", async () => {
    const dto = new LoginDto();
    dto.email = "not-an-email";
    dto.password = "short";

    const errors = await validate(dto);

    expect(errors.map((error) => error.property)).toEqual(
      expect.arrayContaining(["email", "password"]),
    );
  });
});

function createAuthService(
  repository: AuthRepositoryPort,
  passwords: PasswordService,
  config = BASE_CONFIG,
): AuthService {
  const refreshTokens = new RefreshTokenService(config);
  return new AuthService(
    repository,
    config,
    passwords,
    refreshTokens,
    new JwtService(),
    new AuthRateLimiterService(config),
  );
}

async function createUser(
  repository: FakeAuthRepository,
  passwords: PasswordService,
  options: Partial<AuthUserRecord> = {},
): Promise<AuthUserRecord> {
  const user: AuthUserRecord = {
    id: options.id ?? createSelfxId(),
    email: normalizeEmail(options.email ?? "admin@selfx.local"),
    passwordHash:
      options.passwordHash ??
      (await passwords.hashPassword("CorrectPassword123!")),
    displayName: options.displayName ?? "SelfX Admin",
    status: options.status ?? UserStatus.ACTIVE,
    emailVerifiedAt: null,
    lastLoginAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  repository.users.push(user);
  return user;
}

function requestMetadata() {
  return {
    ipAddress: "127.0.0.1",
    userAgent: "vitest",
    origin: "http://localhost:3002",
  };
}

async function expectAuthCode(
  promise: Promise<unknown>,
  code: string,
): Promise<void> {
  try {
    await promise;
    throw new Error(`Expected ${code}`);
  } catch (error) {
    expect(error).toBeInstanceOf(ApiErrorException);
    expect((error as ApiErrorException).getResponse()).toMatchObject({
      error: { code },
    });
  }
}

class FakeAuthRepository implements AuthRepositoryPort {
  readonly users: AuthUserRecord[] = [];
  readonly sessions: AuthSessionRecord[] = [];
  readonly auditLogs: Array<{
    action: string;
    actorUserId?: string;
    resourceType: string;
    resourceId?: string;
    metadata?: Record<string, unknown>;
  }> = [];

  async findUserByEmail(email: string): Promise<AuthUserRecord | null> {
    return this.users.find((user) => user.email === email) ?? null;
  }

  async findUserById(userId: string): Promise<AuthUserRecord | null> {
    return this.users.find((user) => user.id === userId) ?? null;
  }

  async updateUserLogin(userId: string, loggedInAt: Date): Promise<void> {
    const user = await this.findUserById(userId);
    if (user) {
      user.lastLoginAt = loggedInAt;
    }
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
    const session: AuthSessionRecord = {
      id: input.id,
      userId: input.userId,
      refreshTokenHash: input.refreshTokenHash,
      expiresAt: input.expiresAt,
      revokedAt: null,
      lastUsedAt: input.lastUsedAt,
      deviceLabel: input.deviceLabel ?? null,
      userAgentJson: input.userAgentJson,
      createdAt: new Date(),
    };
    this.sessions.push(session);
    return session;
  }

  async findSessionWithUser(
    sessionId: string,
  ): Promise<AuthSessionWithUserRecord | null> {
    const session = this.sessions.find((item) => item.id === sessionId);
    const user = session
      ? this.users.find((item) => item.id === session.userId)
      : undefined;
    return session && user ? { ...session, user } : null;
  }

  async rotateSessionToken(input: {
    sessionId: string;
    currentRefreshTokenHash: string;
    nextRefreshTokenHash: string;
    lastUsedAt: Date;
  }): Promise<boolean> {
    const session = this.sessions.find(
      (item) =>
        item.id === input.sessionId &&
        item.refreshTokenHash === input.currentRefreshTokenHash &&
        !item.revokedAt,
    );
    if (!session) {
      return false;
    }
    session.refreshTokenHash = input.nextRefreshTokenHash;
    session.lastUsedAt = input.lastUsedAt;
    return true;
  }

  async revokeSession(sessionId: string, revokedAt: Date): Promise<boolean> {
    const session = this.sessions.find(
      (item) => item.id === sessionId && !item.revokedAt,
    );
    if (!session) {
      return false;
    }
    session.revokedAt = revokedAt;
    return true;
  }

  async revokeAllUserSessions(
    userId: string,
    revokedAt: Date,
  ): Promise<number> {
    let count = 0;
    for (const session of this.sessions) {
      if (session.userId === userId && !session.revokedAt) {
        session.revokedAt = revokedAt;
        count += 1;
      }
    }
    return count;
  }

  async createAuditLog(input: {
    action: string;
    actorUserId?: string;
    resourceType: string;
    resourceId?: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    this.auditLogs.push(input);
  }
}
