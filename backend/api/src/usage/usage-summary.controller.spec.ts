import { HttpStatus } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import { ApiErrorException } from "../common/api-error.exception.js";
import { PLATFORM_PERMISSIONS } from "../platform/platform-permissions.js";
import { STORE_PERMISSION_CODES } from "../rbac/store-permissions.js";
import { UsageSummaryController } from "./usage-summary.controller.js";

describe("UsageSummaryController", () => {
  it("allows platform users with usage view to read global usage", async () => {
    const usage = { summary: vi.fn().mockResolvedValue({ totals: {} }) };
    const controller = new UsageSummaryController(
      auth(),
      {
        hasPermission: vi.fn().mockResolvedValue(true),
        requirePermission: vi.fn(),
      } as never,
      { requireStorePermission: vi.fn() } as never,
      usage as never,
    );

    await expect(
      controller.summary(request(), { range: "7d" }),
    ).resolves.toEqual({ totals: {} });

    expect(usage.summary).toHaveBeenCalledWith({ range: "7d" });
  });

  it("allows Store users with analytics view to read their Store usage", async () => {
    const rbac = { requireStorePermission: vi.fn() };
    const usage = { summary: vi.fn().mockResolvedValue({ totals: {} }) };
    const controller = new UsageSummaryController(
      auth(),
      {
        hasPermission: vi.fn().mockResolvedValue(false),
        requirePermission: vi.fn(),
      } as never,
      rbac as never,
      usage as never,
    );

    await controller.summary(request(), { range: "30d", storeId: "store-a" });

    expect(rbac.requireStorePermission).toHaveBeenCalledWith(
      "user-1",
      "store-a",
      STORE_PERMISSION_CODES.analyticsView,
    );
    expect(usage.summary).toHaveBeenCalledWith({
      range: "30d",
      storeId: "store-a",
    });
  });

  it("rejects global usage for users without platform usage access", async () => {
    const usage = { summary: vi.fn() };
    const platformAuthorization = {
      hasPermission: vi.fn().mockResolvedValue(false),
      requirePermission: vi
        .fn()
        .mockRejectedValue(
          new ApiErrorException(
            HttpStatus.FORBIDDEN,
            "PLATFORM_PERMISSION_DENIED",
            "Platform permission denied.",
          ),
        ),
    };
    const controller = new UsageSummaryController(
      auth(),
      platformAuthorization as never,
      { requireStorePermission: vi.fn() } as never,
      usage as never,
    );

    await expect(
      controller.summary(request(), { range: "7d" }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        error: expect.objectContaining({ code: "PLATFORM_PERMISSION_DENIED" }),
      }),
    });
    expect(platformAuthorization.requirePermission).toHaveBeenCalledWith(
      "user-1",
      PLATFORM_PERMISSIONS.usageView,
    );
    expect(usage.summary).not.toHaveBeenCalled();
  });
});

function auth() {
  return {
    requireAccessUser: vi.fn().mockResolvedValue({ id: "user-1" }),
  } as never;
}

function request() {
  return { headers: { authorization: "Bearer token" } } as never;
}
