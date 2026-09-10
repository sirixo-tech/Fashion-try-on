import { describe, expect, it, vi } from "vitest";

import { STORE_PERMISSION_CODES } from "../rbac/store-permissions.js";
import { AdminShopifyLinkController } from "./admin-shopify-link.controller.js";

describe("AdminShopifyLinkController", () => {
  it("requires a signed-in SelfX user before showing link details", async () => {
    const auth = {
      requireAccessUser: vi.fn().mockResolvedValue({ id: "user-1" }),
    };
    const links = {
      describe: vi.fn().mockResolvedValue({ status: "PENDING" }),
    };
    const controller = new AdminShopifyLinkController(
      auth as never,
      {} as never,
      {} as never,
      links as never,
    );

    await controller.describe(
      { headers: { authorization: "Bearer staff-token" } } as never,
      "a".repeat(43),
    );

    expect(auth.requireAccessUser).toHaveBeenCalledWith("Bearer staff-token");
    expect(links.describe).toHaveBeenCalledWith("a".repeat(43));
  });

  it("checks Store integration permission before approving a link", async () => {
    const rbac = { requireStorePermission: vi.fn() };
    const links = {
      approve: vi.fn().mockResolvedValue({ status: "APPROVED" }),
    };
    const controller = new AdminShopifyLinkController(
      {
        requireAccessUser: vi.fn().mockResolvedValue({ id: "user-1" }),
      } as never,
      { hasPermission: vi.fn().mockResolvedValue(false) } as never,
      rbac as never,
      links as never,
    );

    await controller.approve(
      { headers: { authorization: "Bearer staff-token" } } as never,
      "a".repeat(43),
      { storeId: "0198a9b3-d0bc-7000-8000-000000000001" },
    );

    expect(rbac.requireStorePermission).toHaveBeenCalledWith(
      "user-1",
      "0198a9b3-d0bc-7000-8000-000000000001",
      STORE_PERMISSION_CODES.integrationsManage,
    );
    expect(links.approve).toHaveBeenCalledWith(
      "user-1",
      "a".repeat(43),
      "0198a9b3-d0bc-7000-8000-000000000001",
    );
  });

  it("allows a platform integration manager without Store membership", async () => {
    const rbac = { requireStorePermission: vi.fn() };
    const links = {
      approve: vi.fn().mockResolvedValue({ status: "APPROVED" }),
    };
    const controller = new AdminShopifyLinkController(
      {
        requireAccessUser: vi.fn().mockResolvedValue({ id: "admin-1" }),
      } as never,
      { hasPermission: vi.fn().mockResolvedValue(true) } as never,
      rbac as never,
      links as never,
    );

    await controller.approve({ headers: {} } as never, "b".repeat(43), {
      storeId: "0198a9b3-d0bc-7000-8000-000000000001",
    });

    expect(rbac.requireStorePermission).not.toHaveBeenCalled();
    expect(links.approve).toHaveBeenCalledOnce();
  });
});
