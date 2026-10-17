import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { Injectable } from "@nestjs/common";

export interface MailEnvelope {
  version: string;
  iv: string;
  tag: string;
  data: string;
}

@Injectable()
export class MailCrypto {
  private keys() {
    const current = process.env.SELFX_MAIL_ENCRYPTION_KEY;
    const version = process.env.SELFX_MAIL_ENCRYPTION_KEY_VERSION ?? "v1";
    const previous = JSON.parse(
      process.env.SELFX_MAIL_PREVIOUS_ENCRYPTION_KEYS ?? "{}",
    ) as Record<string, string>;
    if (!current || !/^[\w-]{1,32}$/.test(version))
      throw new Error("MAIL_KEY_UNAVAILABLE");
    return { version, values: { ...previous, [version]: current } };
  }
  ready() {
    try {
      const { version } = this.keys();
      this.key(version);
      return true;
    } catch {
      return false;
    }
  }
  private key(version: string) {
    const raw = this.keys().values[version];
    if (!raw || !/^[A-Za-z0-9+/]{43}=$/.test(raw))
      throw new Error("MAIL_KEY_UNAVAILABLE");
    const key = Buffer.from(raw, "base64");
    if (key.length !== 32) throw new Error("MAIL_KEY_UNAVAILABLE");
    return key;
  }
  encrypt(value: unknown): MailEnvelope {
    const { version } = this.keys();
    const iv = randomBytes(12),
      cipher = createCipheriv("aes-256-gcm", this.key(version), iv);
    const data = Buffer.concat([
      cipher.update(JSON.stringify(value), "utf8"),
      cipher.final(),
    ]);
    return {
      version,
      iv: iv.toString("base64"),
      tag: cipher.getAuthTag().toString("base64"),
      data: data.toString("base64"),
    };
  }
  decrypt<T>(value: MailEnvelope): T {
    const cipher = createDecipheriv(
      "aes-256-gcm",
      this.key(value.version),
      Buffer.from(value.iv, "base64"),
    );
    cipher.setAuthTag(Buffer.from(value.tag, "base64"));
    return JSON.parse(
      Buffer.concat([
        cipher.update(Buffer.from(value.data, "base64")),
        cipher.final(),
      ]).toString("utf8"),
    ) as T;
  }
}
