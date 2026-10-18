import "reflect-metadata";
import { describe, expect, it, vi } from "vitest";
import {
  StorePaymentTestsController,
  StorePaymentTestCallbacksController,
} from "./store-payment-tests.controller.js";
const request = {
  headers: { authorization: "Bearer identity" },
  ip: "127.0.0.1",
} as never;
function setup(impersonating = false) {
  const rbac = { requireStorePaymentPermission: vi.fn() };
  const tests = {
    workspace: vi.fn(),
    start: vi.fn(),
    detail: vi.fn(),
    check: vi.fn(),
    callback: vi.fn(),
  };
  const controller = new StorePaymentTestsController(
    { requireAccessUser: vi.fn().mockResolvedValue({ id: "actor" }) } as never,
    rbac as never,
    {
      resolveStoreContext: vi
        .fn()
        .mockResolvedValue({ impersonationSession: impersonating ? {} : null }),
    } as never,
    tests as never,
  );
  return { rbac, tests, controller };
}
describe("Store payment testing boundary", () => {
  it("binds every request and actor to the explicit authorized Store", async () => {
    const { controller, rbac, tests } = setup();
    const input = { expectedVersion: 1, idempotencyKey: "retry-key-123" };
    await controller.workspace(request, "store-a");
    expect(rbac.requireStorePaymentPermission).toHaveBeenLastCalledWith(
      "actor",
      "store-a",
      false,
    );
    expect(tests.workspace).toHaveBeenCalledWith("store-a");
    await controller.start(request, "store-a", input);
    await controller.detail(request, "store-a", "test-a");
    await controller.check(request, "store-a", "test-a");
    expect(rbac.requireStorePaymentPermission).toHaveBeenLastCalledWith(
      "actor",
      "store-a",
      true,
    );
    expect(tests.start).toHaveBeenCalledWith("actor", input, "store-a");
    expect(tests.detail).toHaveBeenCalledWith("test-a", "store-a");
    expect(tests.check).toHaveBeenCalledWith("test-a", "actor", "store-a");
  });
  it.each(["workspace", "start", "detail", "check"] as const)(
    "denies %s before reading or executing tests",
    async (action) => {
      const { controller, rbac, tests } = setup();
      rbac.requireStorePaymentPermission.mockRejectedValue(
        new Error("No membership"),
      );
      const result =
        action === "workspace"
          ? controller.workspace(request, "store-b")
          : action === "start"
            ? controller.start(request, "store-b", {
                expectedVersion: 0,
                idempotencyKey: "retry-key-123",
              })
            : controller[action](request, "store-b", "test-a");
      await expect(result).rejects.toThrow("No membership");
      expect(tests[action]).not.toHaveBeenCalled();
    },
  );
  it("blocks testing and QR access during impersonation", async () => {
    const { controller, tests } = setup(true);
    await expect(
      controller.start(request, "store-a", {
        expectedVersion: 1,
        idempotencyKey: "retry-key-123",
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        error: expect.objectContaining({
          code: "PAYMENT_IMPERSONATION_RESTRICTED",
        }),
      }),
    });
    await expect(
      controller.detail(request, "store-a", "test-a"),
    ).rejects.toThrow();
    await expect(
      controller.check(request, "store-a", "test-a"),
    ).rejects.toThrow();
    expect(tests.start).not.toHaveBeenCalled();
  });
  it("passes callback signature and Store scope to the shared verification engine", async () => {
    const { tests } = setup();
    const callbacks = new StorePaymentTestCallbacksController(tests as never);
    await callbacks.callback(
      { headers: { "x-verify": "signature" }, ip: "127.0.0.1" } as never,
      "store-a",
      "test-a",
      { response: "encoded" },
    );
    expect(tests.callback).toHaveBeenCalledWith(
      "test-a",
      "encoded",
      "signature",
      "127.0.0.1",
      "store-a",
    );
  });
});
