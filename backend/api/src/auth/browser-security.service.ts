import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import { type FastifyRequest } from "fastify";

import { ApiErrorException } from "../common/api-error.exception.js";
import { AUTH_CONFIG, AUTH_ERROR_CODES } from "./auth.constants.js";
import { type AuthConfig } from "./auth.config.js";

@Injectable()
export class BrowserSecurityService {
  constructor(@Inject(AUTH_CONFIG) private readonly config: AuthConfig) {}

  assertTrustedOrigin(request: FastifyRequest): void {
    const origin = request.headers.origin;
    if (!origin) {
      return;
    }

    if (!this.config.corsAllowedOrigins.includes(origin)) {
      throw new ApiErrorException(
        HttpStatus.FORBIDDEN,
        AUTH_ERROR_CODES.csrfRejected,
        "Request origin is not allowed.",
      );
    }
  }
}
