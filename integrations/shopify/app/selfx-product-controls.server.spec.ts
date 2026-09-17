import { describe, expect, it, vi } from "vitest";
import { SelfxProductControlsClient } from "./selfx-product-controls.server";
import { SelfxLinkApiError } from "./selfx-link.server";

const config = { apiBaseUrl: "https://selfx.test" } as never;

describe("Shopify product classification client", () => {
  it("updates the Shopify Try-On mode through the integration API", async () => {
    const request = vi
      .fn()
      .mockResolvedValue(Response.json({ tryOnMode: "BOTH" }));
    const result = await new SelfxProductControlsClient(
      config,
      "integration-secret",
      request,
    ).updateShopifySettings({ tryOnMode: "BOTH" });
    expect(result).toEqual({ tryOnMode: "BOTH" });
    expect(request).toHaveBeenCalledWith(
      "https://selfx.test/api/v1/integrations/settings/shopify",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ tryOnMode: "BOTH" }),
      }),
    );
  });

  it("sends the classification using the server-only integration credential", async () => {
    const product = {
      externalProductId: "gid://shopify/Product/1",
      productVertical: "JEWELLERY",
      jewelleryType: "RING",
    };
    const request = vi.fn().mockResolvedValue(Response.json(product));
    const result = await new SelfxProductControlsClient(
      config,
      "integration-secret",
      request,
    ).setProductKind(product);
    expect(result).toEqual(product);
    expect(request).toHaveBeenCalledWith(
      "https://selfx.test/api/v1/integrations/products/kind",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify(product),
        headers: expect.objectContaining({
          "x-selfx-integration-token": "integration-secret",
        }),
      }),
    );
  });

  it("passes search and offset to the scoped product listing", async () => {
    const page = { data: [], summary: { total: 0 }, hasMore: false };
    const request = vi.fn().mockResolvedValue(Response.json(page));
    await new SelfxProductControlsClient(
      config,
      "secret",
      request,
    ).listProducts(25, { search: "gold ring", offset: 50 });
    const url = new URL(request.mock.calls[0]?.[0]);
    expect(url.searchParams.get("search")).toBe("gold ring");
    expect(url.searchParams.get("offset")).toBe("50");
  });

  it("keeps backend validation errors actionable", async () => {
    const request = vi.fn().mockResolvedValue(
      Response.json(
        {
          error: {
            code: "INTEGRATION_PRODUCT_KIND_INVALID",
            message: "Jewellery type is required.",
          },
        },
        { status: 400 },
      ),
    );
    await expect(
      new SelfxProductControlsClient(config, "secret", request).setProductKind({
        externalProductId: "product-1",
        productVertical: "JEWELLERY",
        jewelleryType: null,
      }),
    ).rejects.toMatchObject({
      code: "INTEGRATION_PRODUCT_KIND_INVALID",
      message: "Jewellery type is required.",
    });
  });

  it("rejects invalid classification responses", async () => {
    const request = vi.fn().mockResolvedValue(Response.json({}));
    await expect(
      new SelfxProductControlsClient(config, "secret", request).setProductKind({
        externalProductId: "product-1",
        productVertical: "GARMENT",
        jewelleryType: null,
      }),
    ).rejects.toBeInstanceOf(SelfxLinkApiError);
  });
});
