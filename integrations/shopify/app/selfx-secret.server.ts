import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const envelopePrefix = "selfxenc";
const envelopeVersion = "v1";

export type SelfxSecretCipherConfig = {
  key: Buffer;
  keyVersion: string;
};

export class SelfxSecretCipher {
  constructor(private readonly config: SelfxSecretCipherConfig) {}

  encrypt(plaintext: string, context: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.config.key, iv);
    cipher.setAAD(Buffer.from(context, "utf8"));
    const ciphertext = Buffer.concat([
      cipher.update(plaintext, "utf8"),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();
    return [
      envelopePrefix,
      envelopeVersion,
      this.config.keyVersion,
      iv.toString("base64url"),
      tag.toString("base64url"),
      ciphertext.toString("base64url"),
    ].join(".");
  }

  decrypt(envelope: string, context: string): string {
    const [prefix, version, keyVersion, ivValue, tagValue, ciphertextValue] =
      envelope.split(".");
    if (
      prefix !== envelopePrefix ||
      version !== envelopeVersion ||
      keyVersion !== this.config.keyVersion ||
      !ivValue ||
      !tagValue ||
      !ciphertextValue
    ) {
      throw new Error("The stored SelfX credential cannot be decrypted.");
    }
    const decipher = createDecipheriv(
      "aes-256-gcm",
      this.config.key,
      Buffer.from(ivValue, "base64url"),
    );
    decipher.setAAD(Buffer.from(context, "utf8"));
    decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertextValue, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  }
}

export function loadSelfxSecretCipherConfig(
  env: NodeJS.ProcessEnv = process.env,
): SelfxSecretCipherConfig {
  const encodedKey = required(
    env.SELFX_SHOPIFY_CREDENTIAL_ENCRYPTION_KEY,
    "SELFX_SHOPIFY_CREDENTIAL_ENCRYPTION_KEY",
  );
  const key = Buffer.from(encodedKey, "base64");
  if (key.length !== 32) {
    throw new Error(
      "SELFX_SHOPIFY_CREDENTIAL_ENCRYPTION_KEY must be a Base64-encoded 32-byte key.",
    );
  }
  const keyVersion = required(
    env.SELFX_SHOPIFY_CREDENTIAL_ENCRYPTION_KEY_VERSION ?? "v1",
    "SELFX_SHOPIFY_CREDENTIAL_ENCRYPTION_KEY_VERSION",
  );
  if (!/^[A-Za-z0-9_-]{1,40}$/.test(keyVersion)) {
    throw new Error(
      "SELFX_SHOPIFY_CREDENTIAL_ENCRYPTION_KEY_VERSION is invalid.",
    );
  }
  return { key, keyVersion };
}

function required(value: string | undefined, name: string): string {
  const clean = value?.trim();
  if (!clean) throw new Error(`${name} is required.`);
  return clean;
}
