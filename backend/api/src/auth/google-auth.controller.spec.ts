import "reflect-metadata";
import { describe, expect, it, vi } from "vitest";
import { GoogleAuthController } from "./google-auth.controller.js";
const request = {
  headers: {
    origin: "https://selfx.example",
    authorization: "Bearer fixture",
    "user-agent": "test",
  },
  cookies: {
    selfx_google_browser: "browser-secret",
    selfx_google_link: "link-proof",
  },
  ip: "127.0.0.1",
} as never;
function setup() {
  const google = {
    config: { webOrigin: "https://selfx.example" },
    start: vi.fn().mockResolvedValue({
      authorizationUrl: "https://accounts.google.com/authorize?state=opaque",
      browser: "browser-secret",
    }),
    finish: vi
      .fn()
      .mockResolvedValue({ userId: "actor", next: "/app/developer" }),
    link: vi.fn().mockResolvedValue({ ok: true }),
  };
  const auth = {
    loginWithGoogle: vi.fn().mockResolvedValue({
      refreshToken: "never-include-in-url",
      refreshTokenExpiresAt: new Date(Date.now() + 60000),
    }),
    requireAccessUser: vi.fn().mockResolvedValue({ id: "actor" }),
  };
  const security = { assertTrustedOrigin: vi.fn() };
  const reply = {
    header: vi.fn().mockReturnThis(),
    setCookie: vi.fn().mockReturnThis(),
    clearCookie: vi.fn().mockReturnThis(),
    redirect: vi.fn().mockReturnThis(),
    code: vi.fn().mockReturnThis(),
    send: vi.fn().mockReturnThis(),
  };
  return {
    google,
    auth,
    security,
    reply,
    controller: new GoogleAuthController(
      google as never,
      auth as never,
      security as never,
      {
        refreshCookieName: "selfx_refresh_token",
        cookieSecure: true,
        cookieSameSite: "lax",
      } as never,
    ),
  };
}
describe("Google browser authentication boundary", () => {
  it("starts only from a trusted origin and exposes no browser-binding secret in JSON", async () => {
    const c = setup();
    expect(
      await c.controller.start({ mode: "login" }, request, c.reply as never),
    ).toEqual({
      authorizationUrl: "https://accounts.google.com/authorize?state=opaque",
    });
    expect(c.reply.setCookie).toHaveBeenCalledWith(
      "selfx_google_browser",
      "browser-secret",
      expect.objectContaining({
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        path: "/api/v1/auth",
        maxAge: 600,
      }),
    );
    c.security.assertTrustedOrigin.mockImplementation(() => {
      throw new Error("untrusted");
    });
    await expect(
      c.controller.start({ mode: "signup" }, request, c.reply as never),
    ).rejects.toThrow();
    expect(c.google.start).toHaveBeenCalledTimes(1);
  });
  it("sets the normal HttpOnly SelfX session and completes without credentials in the redirect", async () => {
    const c = setup();
    await c.controller.callback(
      { state: "opaque", code: "provider-code", newGoogleField: "ignored" },
      request,
      c.reply as never,
    );
    expect(c.google.finish).toHaveBeenCalledWith(
      { state: "opaque", code: "provider-code", error: undefined },
      "browser-secret",
      expect.any(Object),
    );
    expect(c.auth.loginWithGoogle).toHaveBeenCalledWith(
      "actor",
      expect.any(Object),
    );
    expect(c.reply.setCookie).toHaveBeenCalledWith(
      "selfx_refresh_token",
      "never-include-in-url",
      expect.objectContaining({
        httpOnly: true,
        secure: true,
        path: "/api/v1/auth",
      }),
    );
    expect(c.reply.redirect).toHaveBeenCalledWith(
      "https://selfx.example/auth/google/complete?next=%2Fapp%2Fdeveloper",
      302,
    );
  });
  it("returns a matching-email link request to password login without issuing a session", async () => {
    const c = setup();
    c.google.finish.mockResolvedValue({
      linkProof: "opaque-link",
      next: "/app/dashboard",
    } as never);
    await c.controller.callback(
      { state: "opaque", code: "code" },
      request,
      c.reply as never,
    );
    expect(c.reply.setCookie).toHaveBeenCalledWith(
      "selfx_google_link",
      "opaque-link",
      expect.objectContaining({ httpOnly: true }),
    );
    expect(c.reply.redirect).toHaveBeenCalledWith(
      "https://selfx.example/login?google=link_required&next=%2Fapp%2Fdashboard",
      302,
    );
    expect(c.auth.loginWithGoogle).not.toHaveBeenCalled();
  });
  it("contains provider/internal errors and invalid callback parameters", async () => {
    const c = setup();
    c.google.finish.mockRejectedValue(
      new Error("secret provider code and token"),
    );
    await c.controller.callback(
      { state: "opaque", code: "code" },
      request,
      c.reply as never,
    );
    expect(c.reply.redirect).toHaveBeenCalledWith(
      "https://selfx.example/login?google=failed",
      302,
    );
    await c.controller.callback(
      { state: ["bad", "array"] },
      request,
      c.reply as never,
    );
    expect(c.google.finish).toHaveBeenCalledTimes(1);
  });
  it("requires trusted origin and a current SelfX access user to link", async () => {
    const c = setup();
    await c.controller.link(
      { password: "fresh-password" },
      request,
      c.reply as never,
    );
    expect(c.auth.requireAccessUser).toHaveBeenCalledWith("Bearer fixture");
    expect(c.google.link).toHaveBeenCalledWith(
      "link-proof",
      { id: "actor" },
      "fresh-password",
      "127.0.0.1",
    );
    expect(c.reply.clearCookie).toHaveBeenCalledWith("selfx_google_link", {
      path: "/api/v1/auth",
    });
  });
});
