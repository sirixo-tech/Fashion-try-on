import { beforeEach, describe, expect, it, vi } from "vitest";
import { StorePlanSelectionController } from "./store-plan-selection.controller.js";

describe("Store plan selection authorization", () => {
  const auth = { requireAccessUser: vi.fn() };
  const rbac = {
    requireStorePaymentPermission: vi.fn(),
    effectivePermissions: vi.fn(),
  };
  const impersonation = { resolveStoreContext: vi.fn() };
  const plans = {
    workspace: vi.fn(),
    choose: vi.fn(),
    payment: vi.fn(),
    payUsage: vi.fn(),
    cancel: vi.fn(),
    disablePayg: vi.fn(),
  };
  const controller = new StorePlanSelectionController(
    auth as never,
    rbac as never,
    impersonation as never,
    plans as never,
  );
  const request = { headers: { authorization: "Bearer fixture" } } as never;
  const choice = {
    planId: "plan",
    clientRequestId: "request",
    planUpdatedAt: new Date().toISOString(),
    acceptTerms: true,
  };
  beforeEach(() => {
    vi.resetAllMocks();
    auth.requireAccessUser.mockResolvedValue({
      id: "actor",
      authSessionId: "session",
    });
    impersonation.resolveStoreContext.mockResolvedValue({
      impersonationSession: null,
    });
    rbac.requireStorePaymentPermission.mockResolvedValue(undefined);
    rbac.effectivePermissions.mockResolvedValue({
      paymentAccess: { view: true, manage: true },
    });
    plans.workspace.mockResolvedValue({ billingOwner: "SELFX" });
  });
  it("checks explicit Store scope and payment management permission before selecting a plan", async () => {
    await controller.choose(request, "store-a", choice);
    expect(impersonation.resolveStoreContext).toHaveBeenCalledWith(
      "actor",
      "store-a",
      "session",
    );
    expect(rbac.requireStorePaymentPermission).toHaveBeenCalledWith(
      "actor",
      "store-a",
      true,
    );
    expect(plans.choose).toHaveBeenCalledWith("store-a", "actor", choice);
  });
  it("requires Store payment management permission to disable usage billing", async () => {
    await controller.disablePayg(request, "store-a");
    expect(rbac.requireStorePaymentPermission).toHaveBeenCalledWith(
      "actor",
      "store-a",
      true,
    );
    expect(plans.disablePayg).toHaveBeenCalledWith("store-a", "actor");
    rbac.requireStorePaymentPermission.mockRejectedValueOnce(
      new Error("Forbidden"),
    );
    await expect(controller.disablePayg(request, "store-b")).rejects.toThrow(
      "Forbidden",
    );
    expect(plans.disablePayg).toHaveBeenCalledTimes(1);
  });
  it("denies cross-Store and view-only payment mutations", async () => {
    rbac.requireStorePaymentPermission.mockRejectedValue(
      new Error("Store denied"),
    );
    await expect(
      controller.choose(request, "other-store", choice),
    ).rejects.toThrow("Store denied");
    await expect(
      controller.pay(request, "other-store", "payment"),
    ).rejects.toThrow();
    await expect(
      controller.check(request, "other-store", "payment"),
    ).rejects.toThrow();
    await expect(
      controller.cancel(request, "other-store", "payment"),
    ).rejects.toThrow();
    expect(plans.choose).not.toHaveBeenCalled();
    expect(plans.payUsage).not.toHaveBeenCalled();
    expect(plans.payment).not.toHaveBeenCalled();
    expect(plans.cancel).not.toHaveBeenCalled();
  });
  it("blocks financial actions during Store impersonation", async () => {
    impersonation.resolveStoreContext.mockResolvedValue({
      impersonationSession: { id: "impersonation" },
    });
    await expect(
      controller.choose(request, "store-a", choice),
    ).rejects.toMatchObject({
      response: { error: { code: "PAYMENT_IMPERSONATION_RESTRICTED" } },
    });
    expect(plans.choose).not.toHaveBeenCalled();
    expect(await controller.workspace(request, "store-a")).toMatchObject({
      canManage: false,
    });
  });
});
