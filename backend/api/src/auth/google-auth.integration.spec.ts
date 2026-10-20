import "reflect-metadata";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { JwtService } from "@nestjs/jwt";
import { createSelfxId } from "@selfx/database";
import { PrismaService } from "../database/prisma.service.js";
import { GoogleAuthService, googleDigest } from "./google-auth.service.js";
import { GoogleIdentityClient } from "./google-identity.client.js";
import { PrismaAuthRepository } from "./auth.repository.js";
import { PasswordService } from "./password.service.js";
import { AuthService } from "./auth.service.js";
import { RefreshTokenService } from "./refresh-token.service.js";
import { AuthRateLimiterService } from "./rate-limiter.service.js";
import type { AuthConfig } from "./auth.config.js";

const url = process.env.GOOGLE_AUTH_TEST_DATABASE_URL;
if (
  url &&
  (!["localhost", "127.0.0.1"].includes(new URL(url).hostname) ||
    !new URL(url).pathname.endsWith("_test"))
)
  throw new Error("Disposable localhost test database required.");
const metadata = {
  ipAddress: "127.0.0.1",
  userAgent: "Google auth regression",
  origin: "https://selfx.example",
};
describe.skipIf(!url)(
  "Google staff sign-in with PostgreSQL and simulated Google",
  () => {
    const db = new PrismaService({
      datasourceUrl: url ?? "postgresql://unused@localhost/unused_test",
    });
    const repo = new PrismaAuthRepository(db),
      passwords = new PasswordService();
    const verify = vi.fn<GoogleIdentityClient["verify"]>();
    const suffix = createSelfxId();
    const emails: string[] = [],
      requestIds: string[] = [];
    const old = new Map<string, string | undefined>();
    let google: GoogleAuthService, hash: string, auth: AuthService;
    const config: AuthConfig = {
      nodeEnv: "test",
      jwtAccessSecret: "google_test_jwt_secret_abcdefghijklmnopqrstuvwxyz",
      accessTokenTtlSeconds: 900,
      refreshTokenPepper:
        "google_test_refresh_secret_abcdefghijklmnopqrstuvwxyz",
      refreshSessionTtlSeconds: 3600,
      refreshCookieName: "selfx_refresh_token",
      cookieSecure: false,
      cookieSameSite: "lax",
      corsAllowedOrigins: [metadata.origin],
      loginRateLimitMax: 100,
      loginRateLimitWindowMs: 60000,
      refreshRateLimitMax: 100,
      refreshRateLimitWindowMs: 60000,
    };
    beforeAll(async () => {
      for (const [key, value] of Object.entries({
        SELFX_GOOGLE_AUTH_ENABLED: "true",
        GOOGLE_AUTH_CLIENT_ID: "fixture-client",
        GOOGLE_AUTH_CLIENT_SECRET: "fixture-secret",
        GOOGLE_AUTH_REDIRECT_URI:
          "https://selfx.example/api/v1/auth/google/callback",
        SELFX_PUBLIC_WEB_BASE_URL: "https://selfx.example",
      })) {
        old.set(key, process.env[key]);
        process.env[key] = value;
      }
      await db.$connect();
      hash = await passwords.hashPassword("Existing password 123!");
      google = new GoogleAuthService(
        db,
        repo,
        { verify } as unknown as GoogleIdentityClient,
        passwords,
        { assertLoginAllowed: vi.fn() } as never,
      );
      auth = new AuthService(
        repo,
        config,
        passwords,
        new RefreshTokenService(config),
        new JwtService(),
        new AuthRateLimiterService(config),
      );
    });
    afterAll(async () => {
      const users = await db.user.findMany({
        where: { email: { in: emails } },
        select: { id: true },
      });
      const ids = users.map((u) => u.id);
      const memberships = await db.organizationMembership.findMany({
        where: { userId: { in: ids } },
        select: { orgId: true },
      });
      const stores = memberships.map((m) => m.orgId);
      await db.userOAuthRequest.deleteMany({
        where: { id: { in: requestIds } },
      });
      await db.auditLog.deleteMany({
        where: {
          OR: [
            { actorUserId: { in: ids } },
            { organizationId: { in: stores } },
          ],
        },
      });
      await db.creditLedgerEntry.deleteMany({
        where: { organizationId: { in: stores } },
      });
      await db.storeSubscription.deleteMany({
        where: { organizationId: { in: stores } },
      });
      await db.storeMembershipRole.deleteMany({
        where: { orgId: { in: stores } },
      });
      await db.storeRolePermission.deleteMany({
        where: { role: { orgId: { in: stores } } },
      });
      await db.storeRole.deleteMany({
        where: { orgId: { in: stores } },
      });
      await db.organizationMembership.deleteMany({
        where: { userId: { in: ids } },
      });
      await db.organization.deleteMany({ where: { id: { in: stores } } });
      await db.user.deleteMany({ where: { id: { in: ids } } });
      await db.$disconnect();
      for (const [key, value] of old) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    });
    function identity(label: string) {
      const email = `${label}-${suffix}@google-auth.invalid`;
      emails.push(email);
      return {
        subject: `google-${label}-${suffix}`,
        email,
        name: "Google Owner",
      };
    }
    async function user(label: string) {
      const info = identity(label);
      const row = await db.user.create({
        data: {
          id: createSelfxId(),
          email: info.email,
          passwordHash: hash,
          displayName: "Existing User",
        },
      });
      return { info, row };
    }
    async function flow(
      mode: "login" | "signup" = "login",
      next = "/app/dashboard",
    ) {
      const start = await google.start(mode, next, metadata.ipAddress);
      const state = new URL(start.authorizationUrl).searchParams.get("state")!;
      const row = await db.userOAuthRequest.findUniqueOrThrow({
        where: { stateHash: googleDigest(state) },
      });
      requestIds.push(row.id);
      return {
        ...start,
        state,
        row,
        finish: () =>
          google.finish(
            { state, code: "one-time-fixture-code" },
            start.browser,
            metadata,
          ),
      };
    }
    it("binds hashed state to browser, PKCE and a one-use expiry", async () => {
      const f = await flow();
      expect(f.row.stateHash).not.toBe(f.state);
      expect(f.row.browserHash).not.toBe(f.browser);
      expect(
        new URL(f.authorizationUrl).searchParams.get("code_challenge_method"),
      ).toBe("S256");
      await expect(
        google.finish(
          { state: f.state, code: "code" },
          "wrong-browser",
          metadata,
        ),
      ).rejects.toThrow();
      expect(verify).not.toHaveBeenCalled();
      await db.userOAuthRequest.update({
        where: { id: f.row.id },
        data: { expiresAt: new Date(0) },
      });
      await expect(f.finish()).rejects.toThrow();
    });
    it("requires signup for an unknown identity and consumes cancellation/failure without creating a user", async () => {
      const info = identity("unknown");
      verify.mockResolvedValue(info);
      const f = await flow(
        "login",
        "/app/integrations/shopify/link?token=fixture",
      );
      expect(await f.finish()).toMatchObject({
        reason: "signup_required",
        next: "/app/integrations/shopify/link?token=fixture",
      });
      await expect(f.finish()).rejects.toThrow();
      const cancelled = await flow();
      expect(
        await google.finish(
          { state: cancelled.state, error: "access_denied" },
          cancelled.browser,
          metadata,
        ),
      ).toMatchObject({ reason: "cancelled" });
      verify.mockRejectedValueOnce(
        new Error("provider failed with sensitive details"),
      );
      expect(await (await flow()).finish()).toMatchObject({ reason: "failed" });
      expect(
        await db.user.findUnique({ where: { email: info.email } }),
      ).toBeNull();
    });
    it("never links by email alone; requires matching account, browser, password and credentials version", async () => {
      const existing = await user("existing"),
        other = await user("other");
      verify.mockResolvedValue(existing.info);
      const result = await (await flow("signup")).finish();
      expect(result.linkProof).toBeTruthy();
      expect(
        await db.userExternalIdentity.count({
          where: { userId: existing.row.id },
        }),
      ).toBe(0);
      await expect(
        google.link(
          result.linkProof,
          other.row,
          "Existing password 123!",
          metadata.ipAddress,
        ),
      ).rejects.toThrow();
      await expect(
        google.link(
          result.linkProof,
          existing.row,
          "wrong",
          metadata.ipAddress,
        ),
      ).rejects.toThrow();
      await expect(
        google.link(
          result.linkProof?.split(".")[0] + ".wrong",
          existing.row,
          "Existing password 123!",
          metadata.ipAddress,
        ),
      ).rejects.toThrow();
      await google.link(
        result.linkProof,
        existing.row,
        "Existing password 123!",
        metadata.ipAddress,
      );
      await expect(
        google.link(
          result.linkProof,
          existing.row,
          "Existing password 123!",
          metadata.ipAddress,
        ),
      ).rejects.toThrow();
      expect(
        await db.userExternalIdentity.findFirst({
          where: { userId: existing.row.id },
        }),
      ).toMatchObject({ subject: existing.info.subject });
      expect(
        await db.user.findUnique({ where: { id: existing.row.id } }),
      ).toMatchObject({ passwordHash: hash });
      expect(
        await db.organizationMembership.count({
          where: { userId: existing.row.id },
        }),
      ).toBe(0);
      const changed = await user("changed");
      verify.mockResolvedValue(changed.info);
      const pending = await (await flow()).finish();
      await db.user.update({
        where: { id: changed.row.id },
        data: { credentialsVersion: { increment: 1 } },
      });
      await expect(
        google.link(
          pending.linkProof,
          changed.row,
          "Existing password 123!",
          metadata.ipAddress,
        ),
      ).rejects.toThrow();
    });
    it("creates one Store/owner/Starter trial and identity atomically without a password; subsequent login creates no Store", async () => {
      const info = identity("new");
      verify.mockResolvedValue(info);
      const f = await flow("signup");
      const result = await f.finish();
      expect(result.userId).toBeTruthy();
      const created = await db.user.findUniqueOrThrow({
        where: { id: result.userId },
      });
      expect(created.passwordHash).toBeNull();
      expect(created.emailVerifiedAt).not.toBeNull();
      const membership = await db.organizationMembership.findFirstOrThrow({
        where: { userId: created.id },
        include: { organization: true },
      });
      expect(membership.organization.status).toBe("ACTIVE");
      expect(membership.role).toBe("ORGANIZATION_OWNER");
      expect(
        await db.storeSubscription.findUnique({
          where: { organizationId: membership.orgId },
        }),
      ).toBeTruthy();
      expect(
        await db.platformRoleAssignment.count({
          where: { userId: created.id },
        }),
      ).toBe(0);
      const session = await auth.loginWithGoogle(created.id, metadata);
      expect(session.user.hasPlatformAccess).toBe(false);
      expect(await auth.refresh(session.refreshToken, metadata)).toMatchObject({
        user: { id: created.id },
      });
      await expect(
        auth.login(
          info.email,
          "SelfX dummy password for uniform auth timing",
          metadata,
        ),
      ).rejects.toThrow();
      expect(await (await flow()).finish()).toMatchObject({
        userId: created.id,
      });
      expect(
        await db.organizationMembership.count({
          where: { userId: created.id },
        }),
      ).toBe(1);
      await db.user.update({
        where: { id: created.id },
        data: { status: "DISABLED" },
      });
      await expect(
        auth.loginWithGoogle(created.id, metadata),
      ).rejects.toThrow();
      await expect(
        auth.refresh(session.refreshToken, metadata),
      ).rejects.toThrow();
    });
    it("serializes replay and concurrent signup into a single user and Store", async () => {
      const info = identity("concurrent");
      verify.mockResolvedValue(info);
      const f = await flow("signup");
      const replay = await Promise.allSettled([f.finish(), f.finish()]);
      expect(replay.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      const race = identity("signup-race");
      verify.mockResolvedValue(race);
      const a = await flow("signup"),
        b = await flow("signup");
      const results = await Promise.all([a.finish(), b.finish()]);
      expect(results[0]!.userId).toBe(results[1]!.userId);
      expect(await db.user.count({ where: { email: race.email } })).toBe(1);
      expect(
        await db.organizationMembership.count({
          where: { userId: results[0]!.userId },
        }),
      ).toBe(1);
    });
  },
);
