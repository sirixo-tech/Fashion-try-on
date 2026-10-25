import "reflect-metadata";
import { describe, expect, it, vi } from "vitest";
import { ShopifyReconciliationService } from "./shopify-reconciliation.service.js";
describe("Shopify reconciliation scheduler", () => {
  it("selects bounded active OAuth-owned Store jobs and continues after one failure", async () => {
    const prisma = {
      integration: {
        findMany: vi.fn().mockResolvedValue([{ id: "one" }, { id: "two" }]),
      },
    };
    const oauth = {
      sync: vi
        .fn()
        .mockRejectedValueOnce(new Error("temporary"))
        .mockResolvedValueOnce({}),
    };
    await new ShopifyReconciliationService(
      prisma as never,
      oauth as never,
    ).tick();
    expect(prisma.integration.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 5,
        where: expect.objectContaining({
          type: "SHOPIFY",
          metadata: { path: ["connectionMode"], equals: "SHOPIFY_OAUTH" },
          organization: { status: "ACTIVE" },
          providerCredential: { isNot: null },
        }),
      }),
    );
    expect(oauth.sync.mock.calls).toEqual([
      [undefined, "one"],
      [undefined, "two"],
    ]);
  });
  it("does not overlap ticks while a batch is still running", async () => {
    let finish!: (jobs: never[]) => void;
    const findMany = vi.fn(
      () =>
        new Promise<never[]>((resolve) => {
          finish = resolve;
        }),
    );
    const service = new ShopifyReconciliationService(
      { integration: { findMany } } as never,
      {} as never,
    );
    const pending = service.tick();
    await service.tick();
    expect(findMany).toHaveBeenCalledOnce();
    finish([]);
    await pending;
  });
});
