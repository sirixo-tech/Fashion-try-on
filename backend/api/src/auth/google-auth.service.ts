import { createHash, randomBytes } from "node:crypto";
import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import { Prisma, type UserOAuthRequest } from "@prisma/client";
import { createSelfxId } from "@selfx/database";
import { ApiErrorException } from "../common/api-error.exception.js";
import { PrismaService } from "../database/prisma.service.js";
import { AUTH_REPOSITORY } from "./auth.constants.js";
import type {
  AuthRepositoryPort,
  AuthUserRecord,
  RequestMetadata,
} from "./auth.types.js";
import {
  googleReturnPath,
  loadGoogleAuthConfig,
} from "./google-auth.config.js";
import { GoogleIdentityClient } from "./google-identity.client.js";
import { PasswordService } from "./password.service.js";
import { AuthRateLimiterService } from "./rate-limiter.service.js";

const ttlMs = 10 * 60_000;
export const googleDigest = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const secret = () => randomBytes(32).toString("base64url");
const fail = (code: string, message: string): never => {
  throw new ApiErrorException(HttpStatus.BAD_REQUEST, code, message);
};

@Injectable()
export class GoogleAuthService {
  readonly config = loadGoogleAuthConfig();
  constructor(
    private readonly db: PrismaService,
    @Inject(AUTH_REPOSITORY) private readonly repository: AuthRepositoryPort,
    private readonly google: GoogleIdentityClient,
    private readonly passwords: PasswordService,
    private readonly limiter: AuthRateLimiterService,
  ) {}

  async start(mode: "login" | "signup", next: string | undefined, ip: string) {
    const config = this.requireConfig();
    this.limiter.assertLoginAllowed(ip, "google-start");
    const expired = await this.db.userOAuthRequest.findMany({
      where: { expiresAt: { lte: new Date() } },
      orderBy: [{ expiresAt: "asc" }, { id: "asc" }],
      take: 100,
      select: { id: true },
    });
    if (expired.length)
      await this.db.userOAuthRequest.deleteMany({
        where: { id: { in: expired.map((row) => row.id) } },
      });
    const state = secret(),
      browser = secret(),
      nonce = secret(),
      verifier = secret();
    await this.db.userOAuthRequest.create({
      data: {
        id: createSelfxId(),
        stateHash: googleDigest(state),
        browserHash: googleDigest(browser),
        nonce,
        codeVerifier: verifier,
        mode,
        returnPath: googleReturnPath(next),
        expiresAt: new Date(Date.now() + ttlMs),
      },
    });
    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.search = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: config.redirectUri,
      response_type: "code",
      scope: "openid email profile",
      state,
      nonce,
      code_challenge: createHash("sha256").update(verifier).digest("base64url"),
      code_challenge_method: "S256",
      prompt: "select_account",
    }).toString();
    return { authorizationUrl: url.href, browser };
  }

  async finish(
    input: { state?: string; code?: string; error?: string },
    browser: string | undefined,
    metadata: RequestMetadata,
  ) {
    const config = this.requireConfig();
    this.limiter.assertLoginAllowed(metadata.ipAddress, "google-callback");
    if (
      !input.state ||
      !browser ||
      input.state.length > 128 ||
      browser.length > 128
    )
      invalid();
    const stateHash = googleDigest(input.state!);
    const request = await this.db.$transaction(async (tx) => {
      const claimed = await tx.userOAuthRequest.updateMany({
        where: {
          stateHash,
          browserHash: googleDigest(browser!),
          consumedAt: null,
          expiresAt: { gt: new Date() },
        },
        data: { consumedAt: new Date() },
      });
      if (claimed.count !== 1) invalid();
      return tx.userOAuthRequest.findUniqueOrThrow({ where: { stateHash } });
    });
    if (input.error) return { reason: "cancelled", next: request.returnPath };
    if (!input.code || input.code.length > 4096) invalid();
    let identity: Awaited<ReturnType<GoogleIdentityClient["verify"]>>;
    try {
      identity = await this.google.verify(
        config,
        input.code!,
        request.codeVerifier,
        request.nonce,
      );
    } catch {
      return { reason: "failed", next: request.returnPath };
    }

    const linked = await this.db.userExternalIdentity.findUnique({
      where: {
        provider_subject: { provider: "GOOGLE", subject: identity!.subject },
      },
    });
    if (linked) return { userId: linked.userId, next: request.returnPath };
    let existing = await this.db.user.findUnique({
      where: { email: identity!.email },
    });
    if (!existing) {
      if (request.mode !== "signup")
        return { reason: "signup_required", next: request.returnPath };
      try {
        const created = await this.repository.createSelfServeSignup({
          email: identity!.email,
          displayName: identity!.name,
          passwordHash: null,
          googleIdentity: {
            subject: identity!.subject,
            email: identity!.email,
          },
          metadata: { source: "GOOGLE_SIGNUP" },
        });
        if (created) {
          await this.db.auditLog.create({
            data: {
              id: createSelfxId(),
              actorUserId: created.id,
              action: "AUTH_SIGNUP_SUCCESS",
              resourceType: "user",
              resourceId: created.id,
              metadata: { method: "GOOGLE" },
            },
          });
          return { userId: created.id, next: request.returnPath };
        }
      } catch (error) {
        if (
          !(error instanceof Prisma.PrismaClientKnownRequestError) ||
          error.code !== "P2002"
        )
          throw error;
      }
      // A concurrent signup must never create a second Store or overwrite an account.
      const concurrent = await this.db.userExternalIdentity.findUnique({
        where: {
          provider_subject: { provider: "GOOGLE", subject: identity!.subject },
        },
      });
      if (concurrent)
        return { userId: concurrent.userId, next: request.returnPath };
      existing = await this.db.user.findUnique({
        where: { email: identity!.email },
      });
    }
    if (!existing || existing.status !== "ACTIVE")
      fail("AUTH_USER_DISABLED", "Account is unavailable.");
    await this.db.userOAuthRequest.update({
      where: { id: request.id },
      data: {
        linkUserId: existing!.id,
        linkSubject: identity!.subject,
        linkEmail: identity!.email,
        linkCredentialsVersion: existing!.credentialsVersion,
      },
    });
    return { linkProof: `${request.id}.${browser}`, next: request.returnPath };
  }

  async link(
    proof: string | undefined,
    user: AuthUserRecord,
    password: string,
    ip: string,
  ) {
    this.requireConfig();
    this.limiter.assertLoginAllowed(ip, user.email);
    const [id, browser, extra] = proof?.split(".") ?? [];
    if (
      !id ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        id,
      ) ||
      !browser ||
      browser.length > 128 ||
      extra !== undefined
    )
      invalid();
    if (
      !user.passwordHash ||
      !(await this.passwords.verifyPassword(user.passwordHash, password))
    ) {
      fail(
        "AUTH_INVALID_CREDENTIALS",
        "Sign in with your existing password to connect Google.",
      );
    }
    await this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${user.id}::uuid FOR UPDATE`;
      const currentUser = await tx.user.findUniqueOrThrow({
        where: { id: user.id },
      });
      const pending = await tx.userOAuthRequest.findUnique({ where: { id } });
      if (!validLink(pending, browser!, currentUser)) invalid();
      const claimed = await tx.userOAuthRequest.updateMany({
        where: { id, linkedAt: null },
        data: { linkedAt: new Date() },
      });
      if (claimed.count !== 1) invalid();
      const existing = await tx.userExternalIdentity.findFirst({
        where: {
          OR: [
            { provider: "GOOGLE", subject: pending!.linkSubject! },
            { provider: "GOOGLE", userId: user.id },
          ],
        },
      });
      if (
        existing &&
        (existing.userId !== user.id ||
          existing.subject !== pending!.linkSubject)
      ) {
        fail(
          "AUTH_GOOGLE_LINK_CONFLICT",
          "This account is already connected to a different Google account.",
        );
      }
      if (!existing)
        await tx.userExternalIdentity.create({
          data: {
            id: createSelfxId(),
            provider: "GOOGLE",
            subject: pending!.linkSubject!,
            userId: user.id,
            emailAtLink: pending!.linkEmail!,
          },
        });
      await tx.auditLog.create({
        data: {
          id: createSelfxId(),
          actorUserId: user.id,
          action: "AUTH_GOOGLE_LINKED",
          resourceType: "user",
          resourceId: user.id,
        },
      });
    });
    return { ok: true as const };
  }

  private requireConfig() {
    if (!this.config)
      fail("AUTH_GOOGLE_UNAVAILABLE", "Google sign-in is not available yet.");
    return this.config!;
  }
}

function invalid(): never {
  return fail(
    "AUTH_GOOGLE_REQUEST_INVALID",
    "Google sign-in expired or could not be confirmed. Start again.",
  );
}
function validLink(
  request: UserOAuthRequest | null,
  browser: string,
  user: {
    id: string;
    email: string;
    status: string;
    credentialsVersion: number;
  },
) {
  return (
    request &&
    request.consumedAt &&
    !request.linkedAt &&
    request.expiresAt > new Date() &&
    request.browserHash === googleDigest(browser) &&
    request.linkUserId === user.id &&
    request.linkEmail === user.email &&
    request.linkSubject &&
    user.status === "ACTIVE" &&
    request.linkCredentialsVersion === user.credentialsVersion
  );
}
