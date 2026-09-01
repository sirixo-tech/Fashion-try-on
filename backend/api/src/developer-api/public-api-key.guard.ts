import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { type FastifyReply, type FastifyRequest } from "fastify";

import { type ApiKeyScope } from "./dto/developer-api-key.dto.js";
import {
  PUBLIC_API_CREDENTIAL_REQUEST_KEY,
  PUBLIC_API_RATE_LIMIT_METADATA,
  PUBLIC_API_SCOPES_METADATA,
  type PublicApiCredentialRequest,
} from "./public-api-key.constants.js";
import { PublicApiKeyAuthService } from "./public-api-key-auth.service.js";
import {
  PublicApiRateLimitExceededException,
  PublicApiRateLimitService,
  type PublicApiRateLimitBucket,
} from "./public-api-rate-limit.service.js";

@Injectable()
export class PublicApiKeyGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly publicApiKeyAuth: PublicApiKeyAuthService,
    private readonly rateLimits: PublicApiRateLimitService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredScopes =
      this.reflector.getAllAndOverride<readonly ApiKeyScope[]>(
        PUBLIC_API_SCOPES_METADATA,
        [context.getHandler(), context.getClass()],
      ) ?? [];
    const request = context
      .switchToHttp()
      .getRequest<FastifyRequest & PublicApiCredentialRequest>();
    const response = context.switchToHttp().getResponse<FastifyReply>();
    const credential = await this.publicApiKeyAuth.verifyRequest(
      request,
      requiredScopes,
    );
    const bucket =
      this.reflector.getAllAndOverride<PublicApiRateLimitBucket>(
        PUBLIC_API_RATE_LIMIT_METADATA,
        [context.getHandler(), context.getClass()],
      ) ?? "general";
    const rateLimit = await this.rateLimits.consume({
      apiKeyId: credential.apiKeyId,
      bucket,
    });
    for (const [name, value] of Object.entries(rateLimit.headers)) {
      response.header(name, value);
    }
    if (!rateLimit.allowed) {
      if (rateLimit.retryAfterSeconds) {
        response.header("Retry-After", String(rateLimit.retryAfterSeconds));
      }
      throw new PublicApiRateLimitExceededException(
        rateLimit.retryAfterSeconds ?? 60,
      );
    }
    request[PUBLIC_API_CREDENTIAL_REQUEST_KEY] = credential;
    return true;
  }
}
