import { describe, expect, it, vi } from "vitest";

import { PublicApiKeyGuard } from "./public-api-key.guard.js";
import {
  PUBLIC_API_CREDENTIAL_REQUEST_KEY,
  PUBLIC_API_RATE_LIMIT_METADATA,
  PUBLIC_API_SCOPES_METADATA,
  type PublicApiCredentialRequest,
} from "./public-api-key.constants.js";
import { PublicApiRateLimitExceededException } from "./public-api-rate-limit.service.js";

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
    const rateLimits = {
      consume: vi.fn().mockResolvedValue({
        allowed: true,
        bucket: "try_on_create",
        headers: { "X-RateLimit-Bucket": "try_on_create" },
      }),
    };
    const reflector = {
      getAllAndOverride: vi
        .fn()
        .mockReturnValueOnce(["tryon:create"])
        .mockReturnValueOnce("try_on_create"),
    };
    const guard = new PublicApiKeyGuard(
      reflector as never,
      publicApiKeyAuth as never,
      rateLimits as never,
    );
    const reply = { header: vi.fn() };

    await expect(guard.canActivate(context(request, reply))).resolves.toBe(
      true,
    );

    expect(reflector.getAllAndOverride).toHaveBeenCalledWith(
      PUBLIC_API_SCOPES_METADATA,
      [handler, controller],
    );
    expect(reflector.getAllAndOverride).toHaveBeenCalledWith(
      PUBLIC_API_RATE_LIMIT_METADATA,
      [handler, controller],
    );
    expect(publicApiKeyAuth.verifyRequest).toHaveBeenCalledWith(request, [
      "tryon:create",
    ]);
    expect(rateLimits.consume).toHaveBeenCalledWith({
      apiKeyId: "key-1",
      bucket: "try_on_create",
    });
    expect(reply.header).toHaveBeenCalledWith(
      "X-RateLimit-Bucket",
      "try_on_create",
    );
    expect(request[PUBLIC_API_CREDENTIAL_REQUEST_KEY]).toBe(credential);
  });

  it("returns a clean 429 when the API key exceeds a route bucket", async () => {
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
    const rateLimits = {
      consume: vi.fn().mockResolvedValue({
        allowed: false,
        bucket: "upload",
        retryAfterSeconds: 42,
        headers: {
          "X-RateLimit-Bucket": "upload",
          "X-RateLimit-Remaining": "0",
        },
      }),
    };
    const reflector = {
      getAllAndOverride: vi
        .fn()
        .mockReturnValueOnce(["tryon:create"])
        .mockReturnValueOnce("upload"),
    };
    const guard = new PublicApiKeyGuard(
      reflector as never,
      publicApiKeyAuth as never,
      rateLimits as never,
    );
    const reply = { header: vi.fn() };

    await expect(
      guard.canActivate(context(request, reply)),
    ).rejects.toBeInstanceOf(PublicApiRateLimitExceededException);

    expect(reply.header).toHaveBeenCalledWith("X-RateLimit-Bucket", "upload");
    expect(reply.header).toHaveBeenCalledWith("X-RateLimit-Remaining", "0");
    expect(reply.header).toHaveBeenCalledWith("Retry-After", "42");
    expect(request[PUBLIC_API_CREDENTIAL_REQUEST_KEY]).toBeUndefined();
  });
});

function handler() {
  return undefined;
}

function controller() {
  return undefined;
}

function context(request: object, response: object = { header: vi.fn() }) {
  return {
    getHandler: () => handler,
    getClass: () => controller,
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
  } as never;
}
