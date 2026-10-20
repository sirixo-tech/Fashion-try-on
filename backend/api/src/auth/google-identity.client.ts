import { Injectable } from "@nestjs/common";
import { OAuth2Client } from "google-auth-library";
import type { GoogleAuthConfig } from "./google-auth.config.js";

@Injectable()
export class GoogleIdentityClient {
  async verify(
    config: GoogleAuthConfig,
    code: string,
    verifier: string,
    nonce: string,
  ) {
    const client = new OAuth2Client({
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      redirectUri: config.redirectUri,
      transporterOptions: { timeout: 10_000, retry: false },
    });
    const { tokens } = await client.getToken({ code, codeVerifier: verifier });
    if (!tokens.id_token) throw new Error("GOOGLE_IDENTITY_INVALID");
    const ticket = await client.verifyIdToken({
      idToken: tokens.id_token,
      audience: config.clientId,
    });
    const payload = ticket.getPayload();
    if (
      !payload ||
      !payload.sub ||
      payload.sub.length > 255 ||
      !payload.email ||
      payload.email.length > 320 ||
      payload.email_verified !== true ||
      (payload as unknown as { nonce?: string }).nonce !== nonce ||
      !["accounts.google.com", "https://accounts.google.com"].includes(
        payload.iss,
      )
    ) {
      throw new Error("GOOGLE_IDENTITY_INVALID");
    }
    return {
      subject: payload.sub,
      email: payload.email.trim().toLowerCase(),
      name: (payload.name || payload.email.split("@")[0]!).slice(0, 160),
    };
  }
}
