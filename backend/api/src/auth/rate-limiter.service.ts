import { HttpStatus, Inject, Injectable } from "@nestjs/common";

import { ApiErrorException } from "../common/api-error.exception.js";
import { AUTH_CONFIG, AUTH_ERROR_CODES } from "./auth.constants.js";
import { type AuthConfig } from "./auth.config.js";

interface RateBucket {
  count: number;
  resetAt: number;
}

@Injectable()
export class AuthRateLimiterService {
  private readonly buckets = new Map<string, RateBucket>();

  constructor(@Inject(AUTH_CONFIG) private readonly config: AuthConfig) {}

  assertLoginAllowed(ipAddress: string, email: string): void {
    this.assertAllowed(
      `login:${ipAddress}:${email.toLowerCase()}`,
      this.config.loginRateLimitMax,
      this.config.loginRateLimitWindowMs,
    );
  }

  assertRefreshAllowed(ipAddress: string): void {
    this.assertAllowed(
      `refresh:${ipAddress}`,
      this.config.refreshRateLimitMax,
      this.config.refreshRateLimitWindowMs,
    );
  }

  private assertAllowed(key: string, max: number, windowMs: number): void {
    const now = Date.now();
    const current = this.buckets.get(key);

    if (!current || current.resetAt <= now) {
      this.buckets.set(key, { count: 1, resetAt: now + windowMs });
      return;
    }

    current.count += 1;
    if (current.count > max) {
      throw new ApiErrorException(
        HttpStatus.TOO_MANY_REQUESTS,
        AUTH_ERROR_CODES.rateLimited,
        "Too many authentication attempts. Try again later.",
      );
    }
  }
}
