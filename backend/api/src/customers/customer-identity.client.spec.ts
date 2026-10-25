import "reflect-metadata";
import { generateKeyPairSync, sign } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OAuth2Client } from "google-auth-library";
import { CustomerIdentityClient } from "./customer-identity.client.js";
import { customerConfig } from "./customer.config.js";

describe("Customer identity validation", () => {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
  });
  const jwk = {
    ...publicKey.export({ format: "jwk" }),
    kid: "test-key",
    alg: "RS256",
    use: "sig",
  };
  const nonce = "test-nonce-hash";
  const payload = () => ({
    iss: "https://appleid.apple.com",
    aud: "com.selfx.customer",
    sub: "apple-subject",
    email: "Customer@Selfx.invalid",
    email_verified: "true",
    nonce,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 600,
  });
  function token(
    overrides: Record<string, unknown> = {},
    headerOverrides: Record<string, unknown> = {},
  ) {
    const header = Buffer.from(
      JSON.stringify({ alg: "RS256", kid: "test-key", ...headerOverrides }),
    ).toString("base64url");
    const body = Buffer.from(
      JSON.stringify({ ...payload(), ...overrides }),
    ).toString("base64url");
    const signature = sign(
      "RSA-SHA256",
      Buffer.from(`${header}.${body}`),
      privateKey,
    ).toString("base64url");
    return `${header}.${body}.${signature}`;
  }
  beforeEach(() => {
    vi.stubEnv("SELFX_CUSTOMER_AUTH_ENABLED", "true");
    vi.stubEnv(
      "SELFX_CUSTOMER_JWT_SECRET",
      "identity-test-distinct-secret-abcdefghijklmnopqrstuvwxyz",
    );
    vi.stubEnv(
      "SELFX_CUSTOMER_GOOGLE_CLIENT_IDS",
      "web-google-client, ios-google-client",
    );
    vi.stubEnv("SELFX_CUSTOMER_APPLE_CLIENT_IDS", "com.selfx.customer");
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue({ ok: true, json: async () => ({ keys: [jwk] }) }),
    );
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });
  it("checks Google audience using the official verifier and requires verified email/issuer", async () => {
    const verify = vi
      .spyOn(OAuth2Client.prototype, "verifyIdToken")
      .mockResolvedValue({
        getPayload: () => ({
          iss: "https://accounts.google.com",
          sub: "google-subject",
          email: "Customer@Selfx.invalid",
          email_verified: true,
          name: "Ava",
        }),
      } as never);
    expect(
      await new CustomerIdentityClient().verify("GOOGLE", "provider-token"),
    ).toEqual({
      subject: "google-subject",
      email: "customer@selfx.invalid",
      name: "Ava",
    });
    expect(verify).toHaveBeenCalledWith({
      idToken: "provider-token",
      audience: ["web-google-client", "ios-google-client"],
    });
    verify.mockResolvedValue({
      getPayload: () => ({
        iss: "https://accounts.google.com",
        sub: "subject",
        email: "customer@selfx.invalid",
        email_verified: false,
      }),
    } as never);
    await expect(
      new CustomerIdentityClient().verify("GOOGLE", "provider-token"),
    ).rejects.toThrow();
  });
  it("verifies Apple's signature, issuer, audience, time and bound nonce with cached official keys", async () => {
    const client = new CustomerIdentityClient();
    expect(await client.verify("APPLE", token(), nonce)).toEqual({
      subject: "apple-subject",
      email: "customer@selfx.invalid",
      name: null,
    });
    await client.verify("APPLE", token(), nonce);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(
      "https://appleid.apple.com/auth/keys",
      expect.objectContaining({ redirect: "error" }),
    );
    for (const overrides of [
      { iss: "https://attacker.invalid" },
      { aud: "another-app" },
      { exp: 1 },
      { iat: Math.floor(Date.now() / 1000) + 3600 },
      { nonce: "another-nonce" },
      { sub: "" },
    ]) {
      await expect(
        client.verify("APPLE", token(overrides), nonce),
      ).rejects.toThrow();
    }
  });
  it("rejects unsigned, tampered, unknown-key and algorithm-confusion tokens", async () => {
    const client = new CustomerIdentityClient();
    const valid = token();
    for (const value of [
      token({}, { alg: "none" }),
      token({}, { alg: "HS256" }),
      token({}, { kid: "unknown" }),
      `${valid.slice(0, -10)}AAAAAAAAAA`,
      "not-a-token",
    ]) {
      await expect(client.verify("APPLE", value, nonce)).rejects.toThrow();
    }
  });
  it("does not claim an unverified Apple email and refuses missing providers/nonces", async () => {
    expect(
      await new CustomerIdentityClient().verify(
        "APPLE",
        token({ email_verified: false }),
        nonce,
      ),
    ).toMatchObject({ email: null });
    await expect(
      new CustomerIdentityClient().verify("APPLE", token()),
    ).rejects.toThrow();
    vi.stubEnv("SELFX_CUSTOMER_GOOGLE_CLIENT_IDS", "");
    await expect(
      new CustomerIdentityClient().verify("GOOGLE", "token"),
    ).rejects.toThrow();
  });
  it("allows the disabled module to boot without secrets and requires separate production customer secrets", () => {
    expect(
      customerConfig({ SELFX_CUSTOMER_AUTH_ENABLED: "false" }).enabled,
    ).toBe(false);
    expect(() =>
      customerConfig({
        SELFX_CUSTOMER_AUTH_ENABLED: "true",
        SELFX_CUSTOMER_JWT_SECRET: "short",
      }),
    ).toThrow();
    expect(() =>
      customerConfig({
        SELFX_CUSTOMER_AUTH_ENABLED: "true",
        SELFX_CUSTOMER_JWT_SECRET: "same-secret-abcdefghijklmnopqrstuvwxyz",
        JWT_ACCESS_SECRET: "same-secret-abcdefghijklmnopqrstuvwxyz",
      }),
    ).toThrow();
    expect(() =>
      customerConfig({
        NODE_ENV: "production",
        SELFX_CUSTOMER_AUTH_ENABLED: "true",
        SELFX_CUSTOMER_JWT_SECRET: "CHANGE_ME_abcdefghijklmnopqrstuvwxyz",
      }),
    ).toThrow();
  });
});
