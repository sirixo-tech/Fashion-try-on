import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export type EncryptedProviderSecret = {
  encryptedPayload: string;
  initializationVector: string;
  authenticationTag: string;
};

export function encryptProviderSecret(
  payload: unknown,
  key: Buffer,
): EncryptedProviderSecret {
  const initializationVector = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, initializationVector);
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(payload), "utf8"),
    cipher.final(),
  ]);
  return {
    encryptedPayload: encrypted.toString("base64"),
    initializationVector: initializationVector.toString("base64"),
    authenticationTag: cipher.getAuthTag().toString("base64"),
  };
}

export function decryptProviderSecret<T>(
  encrypted: EncryptedProviderSecret,
  key: Buffer,
): T {
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(encrypted.initializationVector, "base64"),
  );
  decipher.setAuthTag(Buffer.from(encrypted.authenticationTag, "base64"));
  const plain = Buffer.concat([
    decipher.update(Buffer.from(encrypted.encryptedPayload, "base64")),
    decipher.final(),
  ]);
  return JSON.parse(plain.toString("utf8")) as T;
}
