import { describe, expect, it, vi } from "vitest";

import { StoreDeveloperApiController } from "./store-developer-api.controller.js";

describe("StoreDeveloperApiController", () => {
  const request = {
    headers: { authorization: "Bearer test" },
  } as never;

  it("derives the Store for a new API key from the authenticated Store context", async () => {
    const createKey = vi
      .fn()
      .mockResolvedValue({ apiKey: {}, secret: "secret" });
    const getCurrentStore = vi
      .fn()
      .mockResolvedValue({ store: { id: "store-1" } });
    const controller = new StoreDeveloperApiController(
      {
        requireAccessUser: vi
          .fn()
          .mockResolvedValue({ id: "user-1", authSessionId: "session-1" }),
      } as never,
      { getCurrentStore } as never,
      {
        requireStoreResourcePermission: vi.fn().mockResolvedValue(undefined),
      } as never,
      { assertStoreHasFeature: vi.fn().mockResolvedValue(undefined) } as never,
      { createKey } as never,
      {} as never,
      {} as never,
    );

    await controller.createKey(request, {
      name: "Production integration",
      environment: "LIVE",
      scopes: ["tryon:create"],
      storeId: "attacker-selected-store",
    } as never);

    expect(createKey).toHaveBeenCalledWith(
      "user-1",
      expect.objectContaining({
        name: "Production integration",
        storeId: "store-1",
      }),
    );
    expect(getCurrentStore).toHaveBeenCalledWith("user-1", "session-1");
  });

  it("checks the PUBLIC_API plan entitlement before granting Store API access", async () => {
    const assertStoreHasFeature = vi.fn().mockResolvedValue(undefined);
    const requireStoreResourcePermission = vi.fn().mockResolvedValue(undefined);
    const listKeys = vi.fn().mockResolvedValue({ data: [], pagination: {} });
    const controller = new StoreDeveloperApiController(
      {
        requireAccessUser: vi.fn().mockResolvedValue({ id: "user-1" }),
      } as never,
      {
        getCurrentStore: vi
          .fn()
          .mockResolvedValue({ store: { id: "store-1" } }),
      } as never,
      { requireStoreResourcePermission } as never,
      { assertStoreHasFeature } as never,
      { listKeys } as never,
      {} as never,
      {} as never,
    );

    await controller.listKeys(request, {} as never);

    expect(assertStoreHasFeature).toHaveBeenCalledWith("store-1", "PUBLIC_API");
    expect(requireStoreResourcePermission).toHaveBeenCalledWith(
      "user-1",
      "store-1",
      "developer_api.view",
    );
    expect(listKeys).toHaveBeenCalledWith(
      expect.objectContaining({ storeId: "store-1" }),
    );
  });
});
