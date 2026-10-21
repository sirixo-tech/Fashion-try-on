import "reflect-metadata";
import fastifyCookie from "@fastify/cookie";
import { HttpStatus, Module, ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from "@nestjs/platform-fastify";
import request from "supertest";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { ApiErrorException } from "../common/api-error.exception.js";
import { AUTH_CONFIG } from "./auth.constants.js";
import { AuthService } from "./auth.service.js";
import { BrowserSecurityService } from "./browser-security.service.js";
import { GoogleAuthController } from "./google-auth.controller.js";
import { GoogleAuthService } from "./google-auth.service.js";

const web = "https://selfx.example";
const next = "/app/integrations/shopify/link?token=continuation-fixture";
const callback =
  "/api/v1/auth/google/callback?state=state-fixture&code=code-fixture&iss=https%3A%2F%2Faccounts.google.com";
const expires = new Date("2030-01-01T00:00:00Z");
const google = {
  config: { webOrigin: web } as { webOrigin: string } | null,
  finish: vi.fn(),
};
const auth = { loginWithGoogle: vi.fn() };

describe("Google callback HTTP redirects through NestJS and Fastify", () => {
  let app: NestFastifyApplication;
  beforeAll(async () => {
    @Module({
      controllers: [GoogleAuthController],
      providers: [
        { provide: GoogleAuthService, useValue: google },
        { provide: AuthService, useValue: auth },
        { provide: BrowserSecurityService, useValue: {} },
        {
          provide: AUTH_CONFIG,
          useValue: {
            refreshCookieName: "selfx_refresh_token",
            cookieSecure: true,
            cookieSameSite: "lax",
          },
        },
      ],
    })
    class GoogleCallbackTestModule {}
    app = await NestFactory.create<NestFastifyApplication>(
      GoogleCallbackTestModule,
      new FastifyAdapter(),
      { logger: false, abortOnError: false },
    );
    await app.register(fastifyCookie);
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });
  afterAll(async () => {
    await app?.close();
  });
  beforeEach(() => {
    vi.resetAllMocks();
    google.config = { webOrigin: web };
    google.finish.mockResolvedValue({ userId: "actor-fixture", next });
    auth.loginWithGoogle.mockResolvedValue({
      refreshToken: "refresh-secret-fixture",
      refreshTokenExpiresAt: expires,
    });
  });
  function get(path = callback) {
    return request(app.getHttpServer())
      .get(path)
      .set(
        "Cookie",
        "selfx_google_browser=browser-fixture; selfx_google_link=old-link-fixture",
      )
      .redirects(0);
  }
  function assertRedirect(
    response: { status: number; headers: Record<string, unknown> },
    location: string,
  ) {
    expect(response.status).toBe(HttpStatus.FOUND);
    expect(response.headers.location).toBe(location);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.headers["referrer-policy"]).toBe("no-referrer");
    const cookies = response.headers["set-cookie"] as string[];
    expect(cookies).toContainEqual(
      expect.stringContaining("selfx_google_browser=;"),
    );
    expect(JSON.stringify(response.headers.location)).not.toMatch(
      /refresh-secret|link-proof|code-fixture|state-fixture/,
    );
    return cookies;
  }
  it("redirects successful login and sends the existing protected refresh cookie", async () => {
    const response = await get();
    const cookies = assertRedirect(
      response,
      `${web}/auth/google/complete?next=${encodeURIComponent(next)}`,
    );
    const refresh = cookies.find((cookie) =>
      cookie.startsWith("selfx_refresh_token="),
    )!;
    for (const part of [
      "selfx_refresh_token=refresh-secret-fixture",
      "Path=/api/v1/auth",
      "HttpOnly",
      "Secure",
      "SameSite=Lax",
      `Expires=${expires.toUTCString()}`,
    ])
      expect(refresh).toContain(part);
    expect(cookies).toContainEqual(
      expect.stringContaining("selfx_google_link=;"),
    );
    expect(google.finish).toHaveBeenCalledWith(
      { state: "state-fixture", code: "code-fixture", error: undefined },
      "browser-fixture",
      expect.any(Object),
    );
    expect(auth.loginWithGoogle).toHaveBeenCalledWith(
      "actor-fixture",
      expect.any(Object),
    );
  });
  it("redirects account linking with an HttpOnly link cookie and no new session", async () => {
    google.finish.mockResolvedValue({ linkProof: "link-proof-fixture", next });
    const cookies = assertRedirect(
      await get(),
      `${web}/login?google=link_required&next=${encodeURIComponent(next)}`,
    );
    const link = cookies.find((cookie) =>
      cookie.startsWith("selfx_google_link="),
    )!;
    for (const part of [
      "selfx_google_link=link-proof-fixture",
      "Max-Age=600",
      "HttpOnly",
      "Secure",
      "SameSite=Lax",
      "Path=/api/v1/auth",
    ])
      expect(link).toContain(part);
    expect(
      cookies.some((cookie) => cookie.startsWith("selfx_refresh_token=")),
    ).toBe(false);
    expect(auth.loginWithGoogle).not.toHaveBeenCalled();
  });
  it.each(["cancelled", "signup_required", "failed"])(
    "redirects a %s outcome without issuing a session",
    async (reason) => {
      google.finish.mockResolvedValue({ reason, next });
      const cookies = assertRedirect(
        await get(),
        `${web}/login?google=${reason}&next=${encodeURIComponent(next)}`,
      );
      expect(
        cookies.some((cookie) => cookie.startsWith("selfx_refresh_token=")),
      ).toBe(false);
      expect(auth.loginWithGoogle).not.toHaveBeenCalled();
    },
  );
  it.each([
    { code: "AUTH_GOOGLE_SIGNUP_REQUIRED", reason: "signup_required" },
    { code: "AUTH_GOOGLE_CANCELLED", reason: "cancelled" },
    { code: "AUTH_GOOGLE_REQUEST_INVALID", reason: "failed" },
  ])(
    "redirects thrown $code errors with the right fallback",
    async ({ code, reason }) => {
      google.finish.mockRejectedValue(
        new ApiErrorException(400, code, "Callback fixture error"),
      );
      const cookies = assertRedirect(
        await get(),
        `${web}/login?google=${reason}`,
      );
      expect(cookies).toContainEqual(
        expect.stringContaining("selfx_google_link=;"),
      );
      expect(auth.loginWithGoogle).not.toHaveBeenCalled();
    },
  );
  it("redirects session failures without exposing sensitive error details", async () => {
    auth.loginWithGoogle.mockRejectedValue(
      new Error("private session details"),
    );
    const response = await get();
    assertRedirect(response, `${web}/login?google=failed`);
    expect(response.text).not.toContain("private session details");
  });
  it("redirects malformed callback input before contacting Google", async () => {
    assertRedirect(
      await get("/api/v1/auth/google/callback?state=a&state=b"),
      `${web}/login?google=failed`,
    );
    expect(google.finish).not.toHaveBeenCalled();
  });
  it("retains the non-redirect 404 response when Google is disabled", async () => {
    google.config = null;
    const response = await get();
    expect(response.status).toBe(404);
    expect(response.headers.location).toBeUndefined();
    expect(response.body).toMatchObject({
      error: { code: "AUTH_GOOGLE_UNAVAILABLE" },
    });
    expect(google.finish).not.toHaveBeenCalled();
  });
});
