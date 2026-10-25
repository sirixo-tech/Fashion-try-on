import { describe, expect, it, vi } from "vitest";

import { ShopifyCatalogConnector } from "./shopify-catalog.connector.js";
import { shopifyProduct } from "./test-fixtures.js";

describe("ShopifyCatalogConnector", () => {
  it("resumes from the last acknowledged page and retains the source snapshot", async () => {
    let saved:
      | import("./shopify-catalog.connector.js").ShopifyCatalogSyncCheckpoint
      | undefined;
    const writer = {
      sync: vi.fn().mockResolvedValue(response({ created: 1 })),
    };
    const reader = {
      listProductsPage: vi
        .fn()
        .mockResolvedValueOnce({
          currencyCode: "USD",
          products: [shopifyProduct()],
          endCursor: "acknowledged",
          hasNextPage: true,
        })
        .mockRejectedValueOnce(new Error("offline")),
    };
    await expect(
      new ShopifyCatalogConnector(reader, writer, 25).runFullSync(
        undefined,
        async (state) => {
          saved = state;
        },
      ),
    ).rejects.toThrow("offline");
    expect(saved?.cursor).toBe("acknowledged");
    expect(writer.sync.mock.calls.some((call) => call[0]?.finalize)).toBe(
      false,
    );
    const retry = {
      listProductsPage: vi
        .fn()
        .mockResolvedValue({
          currencyCode: "USD",
          products: [],
          endCursor: null,
          hasNextPage: false,
        }),
    };
    const result = await new ShopifyCatalogConnector(
      retry,
      writer,
      25,
    ).runFullSync(saved);
    expect(retry.listProductsPage).toHaveBeenCalledWith("acknowledged");
    expect(result.sourceSnapshotAt).toBe(saved?.sourceSnapshotAt);
    expect(result.productsRead).toBe(1);
  });
  it("retries terminal finalization without rescanning a completed scan", async () => {
    const reader = { listProductsPage: vi.fn() };
    const writer = {
      sync: vi.fn().mockResolvedValue(response({ finalized: true })),
    };
    await new ShopifyCatalogConnector(reader, writer, 25).runFullSync({
      sourceSnapshotAt: "2026-10-25T00:00:00.000Z",
      cursor: null,
      scanComplete: true,
      totals: {
        productsRead: 10,
        variantsRead: 0,
        submittedBatches: 1,
        created: 10,
        updated: 0,
        archived: 0,
        ignoredAsStale: 0,
        skippedWithoutImage: 0,
      },
    });
    expect(reader.listProductsPage).not.toHaveBeenCalled();
    expect(writer.sync).toHaveBeenCalledOnce();
    expect(writer.sync).toHaveBeenCalledWith(
      expect.objectContaining({ finalize: true, products: [] }),
    );
  });
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
      variantsRead: 0,
      submittedBatches: 2,
      created: 3,
      archived: 4,
      skippedWithoutImage: 0,
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
    skippedWithoutImage: number;
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
    skippedWithoutImage: 0,
    processedAt: "2026-09-07T09:00:00.000Z",
    ...overrides,
  };
}
