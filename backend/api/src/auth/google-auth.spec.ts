import "reflect-metadata";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OAuth2Client } from "google-auth-library";
import {
  loadGoogleAuthConfig,
  googleReturnPath,
} from "./google-auth.config.js";
import { GoogleIdentityClient } from "./google-identity.client.js";
import { googleCallbackInput } from "./google-auth.controller.js";

const env = {
  NODE_ENV: "production",
  SELFX_GOOGLE_AUTH_ENABLED: "true",
  GOOGLE_AUTH_CLIENT_ID: "fixture-client",
  GOOGLE_AUTH_CLIENT_SECRET: "fixture-secret",
  SELFX_PUBLIC_WEB_BASE_URL: "https://selfx.example",
  GOOGLE_AUTH_REDIRECT_URI: "https://selfx.example/api/v1/auth/google/callback",
};
afterEach(() => vi.restoreAllMocks());
describe("Google auth configuration and redirects", () => {
  it("is off unless explicitly enabled and validates production configuration", () => {
    expect(loadGoogleAuthConfig({})).toBeNull();
    expect(loadGoogleAuthConfig(env)?.webOrigin).toBe("https://selfx.example");
    for (const change of [
      { GOOGLE_AUTH_CLIENT_SECRET: "" },
      { SELFX_PUBLIC_WEB_BASE_URL: "http://selfx.example" },
      {
        GOOGLE_AUTH_REDIRECT_URI:
          "https://api.example/api/v1/auth/google/callback",
      },
      { SELFX_PUBLIC_WEB_BASE_URL: "https://selfx.example/redirect" },
    ])
      expect(() => loadGoogleAuthConfig({ ...env, ...change })).toThrow();
  });
  it.each([
    "https://evil.test",
    "//evil.test",
    "/\\evil.test",
    "/login",
    "/app\r\nLocation: bad",
  ])("rejects unsafe continuation %s", (value) =>
    expect(googleReturnPath(value)).toBe("/app/dashboard"),
  );
  it("preserves an internal Shopify continuation and ignores unused Google callback parameters", () => {
    const path = "/app/integrations/shopify/link?token=fixture";
    expect(googleReturnPath(path)).toBe(path);
    expect(
      googleCallbackInput({
        state: "state",
        code: "code",
        scope: "openid",
        future: "ignored",
      }),
    ).toEqual({ state: "state", code: "code", error: undefined });
    expect(() => googleCallbackInput({ state: ["a", "b"] })).toThrow();
  });
});
describe("Google ID verification", () => {
  function provider(payload: Record<string, unknown>) {
    vi.spyOn(OAuth2Client.prototype, "getToken").mockResolvedValue({
      tokens: { id_token: "never-persist-this-token" },
    } as never);
    vi.spyOn(OAuth2Client.prototype, "verifyIdToken").mockResolvedValue({
      getPayload: () => payload,
    } as never);
    return new GoogleIdentityClient();
  }
  const payload = {
    sub: "google-subject",
    email: "Owner@Example.test",
    email_verified: true,
    iss: "https://accounts.google.com",
    nonce: "expected-nonce",
    name: "Owner",
  };
  it("uses code+PKCE, checks audience and normalizes the verified identity", async () => {
    const client = provider(payload);
    await expect(
      client.verify(
        loadGoogleAuthConfig(env)!,
        "one-time-code",
        "verifier",
        "expected-nonce",
      ),
    ).resolves.toEqual({
      subject: "google-subject",
      email: "owner@example.test",
      name: "Owner",
    });
    expect(OAuth2Client.prototype.getToken).toHaveBeenCalledWith({
      code: "one-time-code",
      codeVerifier: "verifier",
    });
    expect(OAuth2Client.prototype.verifyIdToken).toHaveBeenCalledWith({
      idToken: "never-persist-this-token",
      audience: "fixture-client",
    });
  });
  it.each([
    { nonce: "wrong" },
    { email_verified: false },
    { iss: "https://evil.test" },
    { sub: "" },
    { email: "" },
  ])("rejects malformed identity %j", async (change) => {
    await expect(
      provider({ ...payload, ...change }).verify(
        loadGoogleAuthConfig(env)!,
        "code",
        "verifier",
        "expected-nonce",
      ),
    ).rejects.toThrow();
  });
  it("rejects invalid signatures, expired tokens or wrong audience rejected by Google's verifier", async () => {
    const client = provider(payload);
    vi.mocked(OAuth2Client.prototype.verifyIdToken).mockRejectedValue(
      new Error("invalid signature/expired/audience"),
    );
    await expect(
      client.verify(
        loadGoogleAuthConfig(env)!,
        "code",
        "verifier",
        "expected-nonce",
      ),
    ).rejects.toThrow();
  });
});
