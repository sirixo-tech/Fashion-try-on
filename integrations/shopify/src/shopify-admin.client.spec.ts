import { describe, expect, it, vi } from "vitest";

import { ShopifyAdminClient } from "./shopify-admin.server.js";

describe("ShopifyAdminClient", () => {
  it("reads the canonical shop identity without a mutation", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        data: {
          shop: {
            id: "gid://shopify/Shop/1",
            name: "Demo Shop",
            myshopifyDomain: "demo.myshopify.com",
          },
        },
      }),
    );
    const client = new ShopifyAdminClient({
      shopDomain: "demo.myshopify.com",
      accessToken: "secret-shop-token",
      apiVersion: "2026-07",
      productPageSize: 50,
      fetchImpl,
    });

    await expect(client.getShopIdentity()).resolves.toEqual({
      id: "gid://shopify/Shop/1",
      name: "Demo Shop",
      myshopifyDomain: "demo.myshopify.com",
    });
    const body = JSON.parse(
      String((fetchImpl.mock.calls[0]?.[1] as RequestInit).body),
    ) as { query: string };
    expect(body.query).not.toMatch(/\bmutation\b/i);
  });

  it("uses read-only GraphQL queries and paginates large variant sets", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          data: {
            shop: { currencyCode: "USD" },
            products: {
              nodes: [
                {
                  id: "gid://shopify/Product/1",
                  title: "Black Tee",
                  handle: "black-tee",
                  description: "A black tee",
                  status: "ACTIVE",
                  updatedAt: "2026-09-07T09:00:00.000Z",
                  onlineStoreUrl: null,
                  featuredMedia: null,
                  variants: {
                    nodes: [variant("1")],
                    pageInfo: {
                      hasNextPage: true,
                      endCursor: "variant-page-1",
                    },
                  },
                },
              ],
              pageInfo: { hasNextPage: false, endCursor: "product-page-1" },
            },
          },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          data: {
            product: {
              variants: {
                nodes: [variant("2")],
                pageInfo: { hasNextPage: false, endCursor: "variant-page-2" },
              },
            },
          },
        }),
      );
    const client = new ShopifyAdminClient({
      shopDomain: "demo.myshopify.com",
      accessToken: "secret-shop-token",
      apiVersion: "2026-07",
      productPageSize: 50,
      fetchImpl,
    });

    const page = await client.listProductsPage(null);

    expect(page.products[0]?.variants).toHaveLength(2);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    for (const call of fetchImpl.mock.calls) {
      expect(call[0]).toBe(
        "https://demo.myshopify.com/admin/api/2026-07/graphql.json",
      );
      const request = call[1] as RequestInit;
      expect(request.method).toBe("POST");
      expect(request.headers).toMatchObject({
        "X-Shopify-Access-Token": "secret-shop-token",
      });
      const body = JSON.parse(String(request.body)) as { query: string };
      expect(body.query.trimStart()).toMatch(/^query /);
      expect(body.query).not.toMatch(/\bmutation\b/i);
    }
  });

  it("reads one complete product for incremental webhook synchronization", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        data: {
          shop: { currencyCode: "USD" },
          product: {
            id: "gid://shopify/Product/1",
            title: "Black Tee",
            handle: "black-tee",
            description: "A black tee",
            status: "ACTIVE",
            updatedAt: "2026-09-07T09:00:00.000Z",
            onlineStoreUrl: null,
            featuredMedia: null,
            variants: {
              nodes: [variant("1")],
              pageInfo: { hasNextPage: false, endCursor: "variant-page-1" },
            },
          },
        },
      }),
    );
    const client = new ShopifyAdminClient({
      shopDomain: "demo.myshopify.com",
      accessToken: "secret-shop-token",
      apiVersion: "2026-07",
      productPageSize: 50,
      fetchImpl,
    });

    await expect(
      client.getProduct("gid://shopify/Product/1"),
    ).resolves.toMatchObject({
      currencyCode: "USD",
      product: {
        id: "gid://shopify/Product/1",
        variants: [{ title: "Variant 1" }],
      },
    });
    const body = JSON.parse(
      String((fetchImpl.mock.calls[0]?.[1] as RequestInit).body),
    ) as { query: string; variables: Record<string, unknown> };
    expect(body.query.trimStart()).toMatch(/^query /);
    expect(body.query).not.toMatch(/\bmutation\b/i);
    expect(body.variables.productId).toBe("gid://shopify/Product/1");
  });

  it("applies one operation deadline across webhook variant pages", async () => {
    const clock = vi
      .spyOn(Date, "now")
      .mockReturnValueOnce(1_000)
      .mockReturnValueOnce(1_000)
      .mockReturnValue(1_005);
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        data: {
          shop: { currencyCode: "USD" },
          product: {
            id: "gid://shopify/Product/1",
            title: "Black Tee",
            handle: "black-tee",
            description: "A black tee",
            status: "ACTIVE",
            updatedAt: "2026-09-07T09:00:00.000Z",
            onlineStoreUrl: null,
            featuredMedia: null,
            variants: {
              nodes: [variant("1")],
              pageInfo: { hasNextPage: true, endCursor: "variant-page-1" },
            },
          },
        },
      }),
    );
    const client = new ShopifyAdminClient({
      shopDomain: "demo.myshopify.com",
      accessToken: "secret-shop-token",
      apiVersion: "2026-07",
      productPageSize: 50,
      operationTimeoutMs: 3,
      fetchImpl,
    });

    await expect(client.getProduct("gid://shopify/Product/1")).rejects.toThrow(
      "Shopify Admin API operation timed out.",
    );
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    clock.mockRestore();
  });
});

function variant(id: string) {
  return {
    id: "gid://shopify/ProductVariant/" + id,
    title: "Variant " + id,
    sku: "SKU-" + id,
    price: "29.99",
    availableForSale: true,
    image: null,
  };
}

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
