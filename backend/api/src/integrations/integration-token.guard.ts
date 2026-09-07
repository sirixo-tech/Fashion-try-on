import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { type FastifyRequest } from "fastify";

import {
  INTEGRATION_CREDENTIAL_REQUEST_KEY,
  INTEGRATION_SCOPES_METADATA,
  type IntegrationCredentialRequest,
  type IntegrationRequiredScopes,
} from "./integration-token.constants.js";
import { IntegrationTokenAuthService } from "./integration-token-auth.service.js";

@Injectable()
export class IntegrationTokenGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly integrationTokenAuth: IntegrationTokenAuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredScopes =
      this.reflector.getAllAndOverride<IntegrationRequiredScopes>(
        INTEGRATION_SCOPES_METADATA,
        [context.getHandler(), context.getClass()],
      ) ?? [];
    const request = context
      .switchToHttp()
      .getRequest<FastifyRequest & IntegrationCredentialRequest>();
    request[INTEGRATION_CREDENTIAL_REQUEST_KEY] =
      await this.integrationTokenAuth.verifyRequest(request, requiredScopes);
    return true;
  }
}
