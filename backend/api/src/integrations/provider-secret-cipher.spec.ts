import { randomBytes } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  decryptProviderSecret,
  encryptProviderSecret,
} from "./provider-secret-cipher.js";

describe("provider secret encryption", () => {
  it("round trips provider tokens without storing plaintext", () => {
    const key = randomBytes(32);
    const secret = {
      accessToken: "shpat_access_secret",
      refreshToken: "shprt_refresh_secret",
    };
    const encrypted = encryptProviderSecret(secret, key);

    expect(JSON.stringify(encrypted)).not.toContain("shpat_access_secret");
    expect(JSON.stringify(encrypted)).not.toContain("shprt_refresh_secret");
    expect(decryptProviderSecret(encrypted, key)).toEqual(secret);
  });

  it("rejects decryption with a different key", () => {
    const encrypted = encryptProviderSecret(
      { token: "secret" },
      randomBytes(32),
    );
    expect(() => decryptProviderSecret(encrypted, randomBytes(32))).toThrow();
  });
});
