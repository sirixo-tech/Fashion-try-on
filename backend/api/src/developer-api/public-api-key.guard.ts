import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { type FastifyRequest } from "fastify";

import { type ApiKeyScope } from "./dto/developer-api-key.dto.js";
import {
  PUBLIC_API_CREDENTIAL_REQUEST_KEY,
  PUBLIC_API_SCOPES_METADATA,
  type PublicApiCredentialRequest,
} from "./public-api-key.constants.js";
import { PublicApiKeyAuthService } from "./public-api-key-auth.service.js";

@Injectable()
export class PublicApiKeyGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly publicApiKeyAuth: PublicApiKeyAuthService,
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
    request[PUBLIC_API_CREDENTIAL_REQUEST_KEY] =
      await this.publicApiKeyAuth.verifyRequest(request, requiredScopes);
    return true;
  }
}
