import { describe, expect, it, vi } from "vitest";

import { IntegrationTokenGuard } from "./integration-token.guard.js";
import {
  INTEGRATION_CREDENTIAL_REQUEST_KEY,
  INTEGRATION_SCOPES_METADATA,
  type IntegrationCredentialRequest,
} from "./integration-token.constants.js";

describe("IntegrationTokenGuard", () => {
  it("verifies route scopes and attaches integration context to the request", async () => {
    const request: IntegrationCredentialRequest & {
      headers: { "x-selfx-integration-token": string };
    } = { headers: { "x-selfx-integration-token": "selfx_shopify_secret" } };
    const credential = {
      credentialId: "credential-1",
      integrationId: "integration-1",
      integrationType: "SHOPIFY",
      tokenPrefix: "selfx_shopify_secret",
      storeId: "store-1",
      storeName: "Store One",
      externalAccountId: "demo.myshopify.com",
      externalAccountName: "Demo Shop",
      scopes: ["catalog:sync"],
    };
    const integrationTokenAuth = {
      verifyRequest: vi.fn().mockResolvedValue(credential),
    };
    const reflector = {
      getAllAndOverride: vi.fn().mockReturnValue(["catalog:sync"]),
    };
    const guard = new IntegrationTokenGuard(
      reflector as never,
      integrationTokenAuth as never,
    );

    await expect(guard.canActivate(context(request))).resolves.toBe(true);

    expect(reflector.getAllAndOverride).toHaveBeenCalledWith(
      INTEGRATION_SCOPES_METADATA,
      [handler, controller],
    );
    expect(integrationTokenAuth.verifyRequest).toHaveBeenCalledWith(request, [
      "catalog:sync",
    ]);
    expect(request[INTEGRATION_CREDENTIAL_REQUEST_KEY]).toBe(credential);
  });
});

function handler() {
  return undefined;
}

function controller() {
  return undefined;
}

function context(request: object) {
  return {
    getHandler: () => handler,
    getClass: () => controller,
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as never;
}
