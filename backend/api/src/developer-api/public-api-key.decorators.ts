import {
  applyDecorators,
  createParamDecorator,
  ExecutionContext,
  SetMetadata,
  UseGuards,
} from "@nestjs/common";

import { type ApiKeyScope } from "./dto/developer-api-key.dto.js";
import {
  PUBLIC_API_CREDENTIAL_REQUEST_KEY,
  PUBLIC_API_SCOPES_METADATA,
  type PublicApiCredentialRequest,
} from "./public-api-key.constants.js";
import { PublicApiKeyGuard } from "./public-api-key.guard.js";
import { type PublicApiCredentialContext } from "./public-api-key-auth.service.js";

export function RequirePublicApiScopes(...scopes: ApiKeyScope[]) {
  return applyDecorators(
    SetMetadata(PUBLIC_API_SCOPES_METADATA, scopes),
    UseGuards(PublicApiKeyGuard),
  );
}

export const PublicApiCredential = createParamDecorator(
  (_data: unknown, context: ExecutionContext) =>
    publicApiCredentialFromRequest(
      context.switchToHttp().getRequest<PublicApiCredentialRequest>(),
    ),
);

export function publicApiCredentialFromRequest(
  request: PublicApiCredentialRequest,
): PublicApiCredentialContext | undefined {
  return request[PUBLIC_API_CREDENTIAL_REQUEST_KEY];
}
