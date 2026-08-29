import { describe, expect, it, vi } from "vitest";

import { PublicApiKeyGuard } from "./public-api-key.guard.js";
import {
  PUBLIC_API_CREDENTIAL_REQUEST_KEY,
  PUBLIC_API_SCOPES_METADATA,
  type PublicApiCredentialRequest,
} from "./public-api-key.constants.js";

describe("PublicApiKeyGuard", () => {
  it("verifies route scopes and attaches credential context to the request", async () => {
    const request: PublicApiCredentialRequest & {
      headers: { "x-selfx-api-key": string };
    } = { headers: { "x-selfx-api-key": "selfx_test_secret" } };
    const credential = {
      apiKeyId: "key-1",
      keyPrefix: "selfx_test_secret",
      storeId: "store-1",
      storeName: "Store One",
      environment: "TEST",
      scopes: ["tryon:create"],
    };
    const publicApiKeyAuth = {
      verifyRequest: vi.fn().mockResolvedValue(credential),
    };
    const reflector = {
      getAllAndOverride: vi.fn().mockReturnValue(["tryon:create"]),
    };
    const guard = new PublicApiKeyGuard(
      reflector as never,
      publicApiKeyAuth as never,
    );

    await expect(guard.canActivate(context(request))).resolves.toBe(true);

    expect(reflector.getAllAndOverride).toHaveBeenCalledWith(
      PUBLIC_API_SCOPES_METADATA,
      [handler, controller],
    );
    expect(publicApiKeyAuth.verifyRequest).toHaveBeenCalledWith(request, [
      "tryon:create",
    ]);
    expect(request[PUBLIC_API_CREDENTIAL_REQUEST_KEY]).toBe(credential);
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
