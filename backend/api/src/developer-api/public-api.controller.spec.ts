import { describe, expect, it } from "vitest";

import { PublicApiController } from "./public-api.controller.js";

describe("PublicApiController", () => {
  it("returns safe credential context for the current Public API key", () => {
    const controller = new PublicApiController(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    const response = controller.me({
      apiKeyId: "key-1",
      keyPrefix: "selfx_test_abcdefghijkl",
      storeId: "store-1",
      storeName: "Store One",
      environment: "TEST",
      scopes: ["tryon:create", "tryon:read"],
    });

    expect(response).toMatchObject({
      authenticated: true,
      keyPrefix: "selfx_test_abcdefghijkl",
      environment: "TEST",
      scopes: ["tryon:create", "tryon:read"],
      store: {
        id: "store-1",
        name: "Store One",
      },
    });
    expect(response).not.toHaveProperty("apiKeyId");
    expect(response.serverTime).toEqual(expect.any(String));
  });
});
