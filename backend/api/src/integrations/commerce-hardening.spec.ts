import "reflect-metadata";
import { describe, expect, it, vi } from "vitest";
import { ShopifyLinkService } from "./shopify-link.service.js";
import { ShopifyBillingController } from "./shopify-billing.controller.js";

describe("Commerce security boundaries", () => {
  it("requires app-service authentication on every billing endpoint", () => {
    const auth = {
      requireServiceToken: vi.fn(() => {
        throw new Error("unauthorized");
      }),
    };
    const billing = {
      prepare: vi.fn(),
      list: vi.fn(),
      attach: vi.fn(),
      confirm: vi.fn(),
      pendingUsage: vi.fn(),
      acknowledgeUsage: vi.fn(),
    };
    const controller = new ShopifyBillingController(
      auth as never,
      billing as never,
    );
    const attempts = [
      () => controller.prepare(undefined, {} as never),
      () => controller.list(undefined, {} as never),
      () => controller.attach(undefined, "id", {} as never),
      () => controller.confirm(undefined, "id", {} as never),
      () => controller.usage(undefined, {} as never),
      () => controller.acknowledge(undefined, "id", {} as never),
    ];
    attempts.forEach((attempt) => expect(attempt).toThrow("unauthorized"));
    Object.values(billing).forEach((method) =>
      expect(method).not.toHaveBeenCalled(),
    );
  });
  it("disconnects only the bound Store and revokes credentials while retaining its identity", async () => {
    const integration = {
      id: "integration",
      organizationId: "store",
      externalAccountId: "gid://shopify/Shop/1",
    };
    const tx = {
      $queryRaw: vi.fn(),
      $executeRaw: vi.fn(),
      integration: {
        findFirst: vi.fn().mockResolvedValue(integration),
        update: vi.fn(),
      },
      shopifyBillingAgreement: { count: vi.fn().mockResolvedValue(0) },
      integrationCredential: { updateMany: vi.fn() },
      integrationProviderCredential: { deleteMany: vi.fn() },
      shopifyLinkSession: { deleteMany: vi.fn() },
      auditLog: { create: vi.fn() },
    };
    const service = new ShopifyLinkService({
      $transaction: (fn: (db: typeof tx) => Promise<unknown>) => fn(tx),
    } as never);
    const input = {
      storeId: "store",
      shopDomain: "merchant.myshopify.com",
      externalAccountId: "gid://shopify/Shop/1",
    };
    await service.disconnect(input);
    expect(tx.integration.findFirst).toHaveBeenCalledWith({
      where: {
        organizationId: "store",
        type: "SHOPIFY",
        externalAccountId: input.externalAccountId,
        metadata: { path: ["shopDomain"], equals: input.shopDomain },
      },
    });
    expect(tx.integrationCredential.updateMany).toHaveBeenCalledWith({
      where: { integrationId: "integration", status: "ACTIVE" },
      data: { status: "REVOKED", revokedAt: expect.any(Date) },
    });
    expect(tx.integration.update.mock.calls[0]?.[0].data).not.toHaveProperty(
      "externalAccountId",
    );
    expect(tx.integration.update.mock.calls[0]?.[0].data).toMatchObject({
      status: "DISCONNECTED",
      catalogSyncLeaseToken: null,
    });
    tx.integration.update.mockClear();
    tx.shopifyBillingAgreement.count.mockResolvedValue(1);
    await expect(service.disconnect(input)).rejects.toMatchObject({
      response: { error: { code: "SHOPIFY_BILLING_CANCEL_REQUIRED" } },
    });
    expect(tx.integration.update).not.toHaveBeenCalled();
    tx.integration.findFirst.mockResolvedValue(null);
    await expect(
      service.disconnect({ ...input, storeId: "another-store" }),
    ).rejects.toThrow();
    expect(tx.integration.update).not.toHaveBeenCalled();
  });
});
