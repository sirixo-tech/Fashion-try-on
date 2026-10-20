import { describe, expect, it, vi } from "vitest";
import { ApiErrorException } from "../common/api-error.exception.js";
import { DeveloperApiKeyController } from "./developer-api-key.controller.js";
const request = { headers: { authorization: "Bearer fixture" } } as never;
function setup(permissions: string[] = []) {
  const keys = {
    listKeys: vi.fn().mockResolvedValue({ data: [] }),
    createKey: vi.fn().mockResolvedValue({ secret: "fixture" }),
    revokeKey: vi.fn().mockResolvedValue({ status: "REVOKED" }),
  };
  const platform = {
    hasPermission: vi.fn(async (_: string, code: string) =>
      permissions.includes(code),
    ),
    requirePermission: vi
      .fn()
      .mockRejectedValue(
        new ApiErrorException(
          403,
          "PLATFORM_PERMISSION_DENIED",
          "Permission denied.",
        ),
      ),
  };
  return {
    keys,
    platform,
    controller: new DeveloperApiKeyController(
      {
        requireAccessUser: vi.fn().mockResolvedValue({ id: "actor" }),
      } as never,
      platform as never,
      keys as never,
    ),
  };
}
describe("Platform-only Developer API keys", () => {
  it.each([undefined, "store-a", "store-b"])(
    "denies Store key listing regardless of Store filter %s",
    async (storeId) => {
      const c = setup();
      await expect(
        c.controller.list(request, { storeId }),
      ).rejects.toMatchObject({
        response: { error: { code: "PLATFORM_PERMISSION_DENIED" } },
      });
      expect(c.keys.listKeys).not.toHaveBeenCalled();
    },
  );
  it("denies Store create/revoke before resource access", async () => {
    const c = setup();
    await expect(
      c.controller.create(request, {
        storeId: "store-a",
        name: "Key",
        environment: "TEST",
        scopes: ["tryon:create"],
      }),
    ).rejects.toThrow();
    await expect(c.controller.revoke(request, "unknown-key")).rejects.toThrow();
    expect(c.keys.createKey).not.toHaveBeenCalled();
    expect(c.keys.revokeKey).not.toHaveBeenCalled();
  });
  it("permits Platform viewers to list but not create/revoke", async () => {
    const c = setup(["DEVELOPER_API_VIEW"]);
    await c.controller.list(request, { storeId: "store-a" });
    expect(c.keys.listKeys).toHaveBeenCalledWith({ storeId: "store-a" });
    await expect(c.controller.revoke(request, "key")).rejects.toThrow();
    await expect(
      c.controller.create(request, {
        storeId: "store-a",
        name: "Key",
        environment: "TEST",
        scopes: ["tryon:create"],
      }),
    ).rejects.toThrow();
  });
  it("permits Platform managers and attributes key creation", async () => {
    const c = setup(["DEVELOPER_API_MANAGE"]);
    const dto = {
      storeId: "store-a",
      name: "Key",
      environment: "TEST" as const,
      scopes: ["tryon:create" as const],
    };
    await c.controller.create(request, dto);
    await c.controller.revoke(request, "key");
    expect(c.keys.createKey).toHaveBeenCalledWith("actor", dto);
    expect(c.keys.revokeKey).toHaveBeenCalledWith("actor", "key");
  });
});
