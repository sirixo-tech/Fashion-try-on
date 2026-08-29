import { type PublicApiCredentialContext } from "./public-api-key-auth.service.js";

export const PUBLIC_API_SCOPES_METADATA = "selfx:public-api:scopes";
export const PUBLIC_API_CREDENTIAL_REQUEST_KEY = "publicApiCredential";

export type PublicApiCredentialRequest = {
  [PUBLIC_API_CREDENTIAL_REQUEST_KEY]?: PublicApiCredentialContext;
};
