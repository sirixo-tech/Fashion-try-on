import { type IntegrationCredentialScopeDto } from "./dto/integration.dto.js";
import { type IntegrationCredentialContext } from "./integration-token-auth.service.js";

export const INTEGRATION_SCOPES_METADATA = "selfx:integration:scopes";
export const INTEGRATION_CREDENTIAL_REQUEST_KEY = "integrationCredential";

export type IntegrationCredentialRequest = {
  [INTEGRATION_CREDENTIAL_REQUEST_KEY]?: IntegrationCredentialContext;
};

export type IntegrationRequiredScopes =
  readonly IntegrationCredentialScopeDto[];
