import { type ShopifyProduct } from "./contracts.js";

export function shopifyProduct(
  overrides: Partial<ShopifyProduct> = {},
): ShopifyProduct {
  return {
    id: "gid://shopify/Product/1",
    title: "Black Tee",
    handle: "black-tee",
    description: "A black tee",
    status: "ACTIVE",
    updatedAt: "2026-09-07T09:00:00.000Z",
    onlineStoreUrl: "https://shop.example/products/black-tee",
    featuredMedia: null,
    variants: [
      {
        id: "gid://shopify/ProductVariant/1",
        title: "Medium",
        sku: "TEE-BLK-M",
        price: "29.99",
        availableForSale: true,
        image: null,
      },
    ],
    ...overrides,
  };
}
