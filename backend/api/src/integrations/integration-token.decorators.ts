import {
  applyDecorators,
  createParamDecorator,
  ExecutionContext,
  SetMetadata,
  UseGuards,
} from "@nestjs/common";

import { type IntegrationCredentialScopeDto } from "./dto/integration.dto.js";
import {
  INTEGRATION_CREDENTIAL_REQUEST_KEY,
  INTEGRATION_SCOPES_METADATA,
  type IntegrationCredentialRequest,
} from "./integration-token.constants.js";
import { type IntegrationCredentialContext } from "./integration-token-auth.service.js";
import { IntegrationTokenGuard } from "./integration-token.guard.js";

export function RequireIntegrationScopes(
  ...scopes: IntegrationCredentialScopeDto[]
) {
  return applyDecorators(
    SetMetadata(INTEGRATION_SCOPES_METADATA, scopes),
    UseGuards(IntegrationTokenGuard),
  );
}

export const IntegrationCredential = createParamDecorator(
  (_data: unknown, context: ExecutionContext) =>
    integrationCredentialFromRequest(
      context.switchToHttp().getRequest<IntegrationCredentialRequest>(),
    ),
);

export function integrationCredentialFromRequest(
  request: IntegrationCredentialRequest,
): IntegrationCredentialContext | undefined {
  return request[INTEGRATION_CREDENTIAL_REQUEST_KEY];
}
