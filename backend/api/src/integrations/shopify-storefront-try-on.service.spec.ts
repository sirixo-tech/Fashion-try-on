import { afterEach, describe, expect, it, vi } from "vitest";

import {
  SHOPIFY_STOREFRONT_TRY_ON_ERROR_CODES,
  SHOPIFY_STOREFRONT_TRY_ON_SESSION_LIFETIME_MS,
  ShopifyStorefrontTryOnService,
  hashSessionToken,
} from "./shopify-storefront-try-on.service.js";

const png1x1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
  "base64",
);

describe("ShopifyStorefrontTryOnService", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("creates a short-lived capability without storing the raw session token", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-11T00:00:00.000Z"));
    const prisma = new FakePrisma();
    const sessions = new FakeTryOnSessions();
    const storage = new FakeStorage();
    const service = serviceFor(prisma, sessions, storage);

    const created = await service.createSession({
      source: "shopify",
      shop: " Merchant.MyShopify.com ",
      externalProductId: "gid://shopify/Product/1001",
    });

    expect(created.session).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(created).not.toHaveProperty("sessionId");
    expect(created.expiresAt).toBe("2026-09-11T00:15:00.000Z");
    expect(prisma.createdCapability).toMatchObject({
      tokenHash: hashSessionToken(created.session),
      tryOnSessionId: "tryon-session-1",
      shopDomain: "merchant.myshopify.com",
      externalProductId: "gid://shopify/Product/1001",
      productHandle: "linen-shirt",
    });
    expect(JSON.stringify(prisma.createdCapability)).not.toContain(
      created.session,
    );
    expect(
      prisma.createdCapability!.expiresAt.getTime() -
        new Date("2026-09-11T00:00:00.000Z").getTime(),
    ).toBe(SHOPIFY_STOREFRONT_TRY_ON_SESSION_LIFETIME_MS);
    expect(sessions.createdSession?.expiresAt.toISOString()).toBe(
      "2026-09-11T00:15:00.000Z",
    );
    expect(storage.putObject).toHaveBeenCalledOnce();
  });

  it("fails safely when the Shopify integration is disconnected", async () => {
    const prisma = new FakePrisma();
    prisma.integrationConnected = false;
    const service = serviceFor(
      prisma,
      new FakeTryOnSessions(),
      new FakeStorage(),
    );

    await expect(
      service.createSession({
        source: "shopify",
        shop: "merchant.myshopify.com",
        externalProductId: "gid://shopify/Product/1001",
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        error: expect.objectContaining({
          code: SHOPIFY_STOREFRONT_TRY_ON_ERROR_CODES.productUnavailable,
        }),
      }),
    });
  });

  it("fails safely when the synced product is not VTO eligible", async () => {
    const prisma = new FakePrisma();
    prisma.product.vtoEnabled = false;
    const service = serviceFor(
      prisma,
      new FakeTryOnSessions(),
      new FakeStorage(),
    );

    await expect(
      service.createSession({
        source: "shopify",
        shop: "merchant.myshopify.com",
        externalProductId: "gid://shopify/Product/1001",
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        error: expect.objectContaining({
          code: SHOPIFY_STOREFRONT_TRY_ON_ERROR_CODES.productNotEnabled,
        }),
      }),
    });
  });
});

function serviceFor(
  prisma: FakePrisma,
  sessions: FakeTryOnSessions,
  storage: FakeStorage,
) {
  return new ShopifyStorefrontTryOnService(
    prisma as never,
    sessions as never,
    storage as never,
    {
      metadata: vi.fn(),
      assertConfigured: vi.fn(),
      process: vi.fn(),
    } as never,
  );
}

class FakePrisma {
  integrationConnected = true;
  product = {
    id: "product-1",
    name: "Linen Shirt",
    active: true,
    vtoEnabled: true,
    imageUrl: null,
    imageStorageKey: "catalog/product-1.png",
    imageContentType: "image/png",
    priceAmountCents: 12900,
    priceCurrency: "USD",
    productVertical: "GARMENT",
    garmentIntent: "AUTO",
    garmentCategory: "AUTO",
    garmentPhotoType: "AUTO",
  };
  createdCapability: Record<string, any> | null = null;

  integration = {
    findFirst: vi.fn(() =>
      this.integrationConnected
        ? { id: "integration-1", organizationId: "store-1" }
        : null,
    ),
  };

  externalProductMapping = {
    findFirst: vi.fn(() => ({
      externalProductId: "gid://shopify/Product/1001",
      externalHandle: "linen-shirt",
      externalSku: "LINEN-SHIRT",
      product: this.product,
    })),
  };

  shopifyStorefrontTryOnSession = {
    create: vi.fn(({ data }: { data: Record<string, any> }) => {
      this.createdCapability = data;
      return data;
    }),
  };
}

class FakeTryOnSessions {
  createdSession: { id: string; expiresAt: Date } | null = null;

  createSession = vi.fn(({ expiresAt }: { expiresAt: Date }) => {
    this.createdSession = { id: "tryon-session-1", expiresAt };
    return this.createdSession;
  });

  attachGarmentAsset = vi.fn(() => ({ id: "garment-asset-1" }));
  completeSession = vi.fn();
}

class FakeStorage {
  readObject = vi.fn(() => png1x1);
  putObject = vi.fn();
  deleteObject = vi.fn();
}
