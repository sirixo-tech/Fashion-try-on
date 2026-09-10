import { describe, expect, it } from "vitest";

import {
  SelfxSecretCipher,
  loadSelfxSecretCipherConfig,
} from "./selfx-secret.server";

describe("SelfxSecretCipher", () => {
  it("encrypts a secret and binds it to the Shopify shop context", () => {
    const cipher = new SelfxSecretCipher({
      key: Buffer.alloc(32, 7),
      keyVersion: "v1",
    });
    const encrypted = cipher.encrypt("selfx_shopify_secret", "shop-a");

    expect(encrypted).not.toContain("selfx_shopify_secret");
    expect(cipher.decrypt(encrypted, "shop-a")).toBe("selfx_shopify_secret");
    expect(() => cipher.decrypt(encrypted, "shop-b")).toThrow();
  });

  it("requires an exact 32-byte Base64 key", () => {
    expect(() =>
      loadSelfxSecretCipherConfig({
        SELFX_SHOPIFY_CREDENTIAL_ENCRYPTION_KEY:
          Buffer.alloc(16).toString("base64"),
      }),
    ).toThrow(/32-byte/);
  });
});
