import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import { Inject, Injectable } from "@nestjs/common";

import { AUTH_CONFIG } from "./auth.constants.js";
import { type AuthConfig } from "./auth.config.js";

export interface RefreshTokenParts {
  sessionId: string;
  secret: string;
}

@Injectable()
export class RefreshTokenService {
  constructor(@Inject(AUTH_CONFIG) private readonly config: AuthConfig) {}

  create(sessionId: string): string {
    return `${sessionId}.${randomBytes(48).toString("base64url")}`;
  }

  parse(rawToken: string | undefined): RefreshTokenParts | null {
    if (!rawToken) {
      return null;
    }

    const [sessionId, secret, extra] = rawToken.split(".");
    if (!sessionId || !secret || extra !== undefined) {
      return null;
    }

    return { sessionId, secret };
  }

  digest(rawToken: string): string {
    return createHmac("sha256", this.config.refreshTokenPepper)
      .update(rawToken)
      .digest("base64url");
  }

  verifyDigest(rawToken: string, expectedDigest: string): boolean {
    const actual = Buffer.from(this.digest(rawToken));
    const expected = Buffer.from(expectedDigest);
    return (
      actual.length === expected.length && timingSafeEqual(actual, expected)
    );
  }
}
