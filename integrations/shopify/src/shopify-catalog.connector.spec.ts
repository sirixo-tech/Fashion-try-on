import { describe, expect, it, vi } from "vitest";

import { ShopifyCatalogConnector } from "./shopify-catalog.connector.js";
import { shopifyProduct } from "./test-fixtures.js";

describe("ShopifyCatalogConnector", () => {
  it("reads every Shopify page, submits bounded batches, then finalizes", async () => {
    const shopify = {
      listProductsPage: vi
        .fn()
        .mockResolvedValueOnce({
          currencyCode: "USD",
          products: [
            shopifyProduct(),
            shopifyProduct({
              id: "gid://shopify/Product/2",
              variants: [],
            }),
          ],
          endCursor: "page-1",
          hasNextPage: true,
        })
        .mockResolvedValueOnce({
          currencyCode: "USD",
          products: [
            shopifyProduct({
              id: "gid://shopify/Product/3",
              variants: [],
            }),
          ],
          endCursor: "page-2",
          hasNextPage: false,
        }),
    };
    const selfx = {
      sync: vi
        .fn()
        .mockResolvedValueOnce(response({ created: 2 }))
        .mockResolvedValueOnce(response({ created: 1 }))
        .mockResolvedValueOnce(response({ finalized: true, archived: 4 })),
    };
    const times = [
      new Date("2026-09-07T09:00:00.000Z"),
      new Date("2026-09-07T09:01:00.000Z"),
    ];
    const connector = new ShopifyCatalogConnector(shopify, selfx, 2, () =>
      times.shift()!,
    );

    const report = await connector.runFullSync();

    expect(shopify.listProductsPage).toHaveBeenNthCalledWith(1, null);
    expect(shopify.listProductsPage).toHaveBeenNthCalledWith(2, "page-1");
    expect(selfx.sync).toHaveBeenCalledTimes(3);
    expect(selfx.sync).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        mode: "FULL",
        sourceSnapshotAt: "2026-09-07T09:00:00.000Z",
        finalize: false,
        products: expect.arrayContaining([
          expect.objectContaining({
            externalProductId: "gid://shopify/Product/1",
          }),
          expect.objectContaining({
            externalProductId: "gid://shopify/Product/2",
          }),
        ]),
      }),
    );
    expect(selfx.sync).toHaveBeenLastCalledWith({
      mode: "FULL",
      sourceSnapshotAt: "2026-09-07T09:00:00.000Z",
      finalize: true,
      products: [],
    });
    expect(report).toMatchObject({
      source: "SHOPIFY",
      direction: "SHOPIFY_TO_SELFX",
      productsRead: 3,
      variantsRead: 1,
      submittedBatches: 2,
      created: 3,
      archived: 4,
      completedAt: "2026-09-07T09:01:00.000Z",
    });
  });

  it("never finalizes when Shopify pagination fails", async () => {
    const shopify = {
      listProductsPage: vi
        .fn()
        .mockResolvedValueOnce({
          currencyCode: "USD",
          products: [shopifyProduct()],
          endCursor: "page-1",
          hasNextPage: true,
        })
        .mockRejectedValueOnce(new Error("Shopify unavailable")),
    };
    const selfx = { sync: vi.fn().mockResolvedValue(response({ created: 1 })) };
    const connector = new ShopifyCatalogConnector(shopify, selfx, 1);

    await expect(connector.runFullSync()).rejects.toThrow(
      "Shopify unavailable",
    );
    expect(selfx.sync).toHaveBeenCalledTimes(1);
    expect(selfx.sync.mock.calls[0]?.[0]).toMatchObject({ finalize: false });
  });
});

function response(
  overrides: Partial<{
    finalized: boolean;
    created: number;
    updated: number;
    archived: number;
    ignoredAsStale: number;
  }> = {},
) {
  return {
    direction: "COMMERCE_TO_SELFX" as const,
    sourceOfTruth: "COMMERCE_PLATFORM" as const,
    finalized: false,
    created: 0,
    updated: 0,
    archived: 0,
    ignoredAsStale: 0,
    processedAt: "2026-09-07T09:00:00.000Z",
    ...overrides,
  };
}
