import { createPublicKey, verify, type JsonWebKey } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { OAuth2Client } from "google-auth-library";
import { customerConfig } from "./customer.config.js";

export type CustomerProviderIdentity = {
  subject: string;
  email: string | null;
  name: string | null;
};
@Injectable()
export class CustomerIdentityClient {
  private appleKeys: { expires: number; keys: JsonWebKey[] } | null = null;
  async verify(
    provider: "GOOGLE" | "APPLE",
    token: string,
    nonce?: string,
  ): Promise<CustomerProviderIdentity> {
    const config = customerConfig();
    if (provider === "GOOGLE") {
      if (!config.googleClientIds.length)
        throw new Error("CUSTOMER_OAUTH_UNAVAILABLE");
      const ticket = await new OAuth2Client({
        transporterOptions: { timeout: 10000, retry: false },
      }).verifyIdToken({ idToken: token, audience: config.googleClientIds });
      const payload = ticket.getPayload();
      if (
        !payload?.sub ||
        payload.sub.length > 320 ||
        !payload.email ||
        payload.email.length > 320 ||
        !payload.email_verified ||
        !["accounts.google.com", "https://accounts.google.com"].includes(
          payload.iss,
        )
      )
        throw new Error("CUSTOMER_OAUTH_INVALID");
      return {
        subject: payload.sub,
        email: payload.email.trim().toLowerCase(),
        name: payload.name?.slice(0, 160) ?? null,
      };
    }
    if (!config.appleClientIds.length || !nonce)
      throw new Error("CUSTOMER_OAUTH_UNAVAILABLE");
    const parts = token.split(".");
    if (parts.length !== 3) throw new Error("CUSTOMER_OAUTH_INVALID");
    const header = JSON.parse(
      Buffer.from(parts[0]!, "base64url").toString(),
    ) as { alg?: string; kid?: string };
    if (header.alg !== "RS256" || !header.kid)
      throw new Error("CUSTOMER_OAUTH_INVALID");
    if (!this.appleKeys || this.appleKeys.expires <= Date.now()) {
      const response = await fetch("https://appleid.apple.com/auth/keys", {
        signal: AbortSignal.timeout(10000),
        redirect: "error",
      });
      if (!response.ok) throw new Error("CUSTOMER_OAUTH_UNAVAILABLE");
      const body = (await response.json()) as { keys: JsonWebKey[] };
      if (!Array.isArray(body.keys) || body.keys.length > 20)
        throw new Error("CUSTOMER_OAUTH_INVALID");
      this.appleKeys = { expires: Date.now() + 3600000, keys: body.keys };
    }
    const key = this.appleKeys.keys.find(
      (value) =>
        (value as JsonWebKey & { kid?: string }).kid === header.kid &&
        value.kty === "RSA",
    );
    if (
      !key ||
      !verify(
        "RSA-SHA256",
        Buffer.from(`${parts[0]}.${parts[1]}`),
        createPublicKey({ key, format: "jwk" }),
        Buffer.from(parts[2]!, "base64url"),
      )
    )
      throw new Error("CUSTOMER_OAUTH_INVALID");
    const payload = JSON.parse(
      Buffer.from(parts[1]!, "base64url").toString(),
    ) as Record<string, unknown>;
    const now = Date.now() / 1000;
    if (
      payload.iss !== "https://appleid.apple.com" ||
      typeof payload.aud !== "string" ||
      !config.appleClientIds.includes(payload.aud) ||
      typeof payload.exp !== "number" ||
      payload.exp <= now ||
      typeof payload.iat !== "number" ||
      payload.iat > now + 60 ||
      payload.nonce !== nonce ||
      typeof payload.sub !== "string" ||
      !payload.sub ||
      payload.sub.length > 320
    )
      throw new Error("CUSTOMER_OAUTH_INVALID");
    const email =
      typeof payload.email === "string" &&
      payload.email.length <= 320 &&
      [true, "true"].includes(payload.email_verified as boolean | string)
        ? payload.email.trim().toLowerCase()
        : null;
    return { subject: payload.sub, email, name: null };
  }
}
