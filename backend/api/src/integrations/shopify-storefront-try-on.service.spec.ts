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
      locale: "es-MX",
      visitorToken: "v".repeat(43),
      visitorTryOnLimit: 3,
      visitorTryOnLimitPeriod: "DAY",
      monthlyStoreTryOnLimit: 20,
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
      storefrontLocale: "es",
      visitorTryOnLimit: 3,
      visitorLimitPeriod: "DAY",
      monthlyStoreTryOnLimit: 20,
    });
    expect(prisma.createdCapability?.visitorTokenHash).toMatch(
      /^[a-f0-9]{64}$/,
    );
    expect(created.locale).toBe("es");
    expect(created.product).toMatchObject({
      name: "Linen Shirt",
      priceAmountCents: 12900,
      priceCurrency: "USD",
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

  it("matches numeric Shopify product IDs against canonical GID mappings", async () => {
    const prisma = new FakePrisma();
    const service = serviceFor(
      prisma,
      new FakeTryOnSessions(),
      new FakeStorage(),
    );

    const created = await service.createSession({
      source: "shopify",
      shop: "merchant.myshopify.com",
      externalProductId: "1001",
    });

    expect(created.product.externalProductId).toBe(
      "gid://shopify/Product/1001",
    );
    expect(prisma.externalProductMapping.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([
            { externalProductId: "gid://shopify/Product/1001" },
            { externalProductId: "1001" },
          ]),
        }),
      }),
    );
  });

  it("can match legacy numeric Shopify product mappings from GID storefront input", async () => {
    const prisma = new FakePrisma();
    prisma.externalProductMapping.findFirst.mockReturnValue({
      externalProductId: "1001",
      externalHandle: "linen-shirt",
      externalSku: "LINEN-SHIRT",
      product: prisma.product,
    });
    const service = serviceFor(
      prisma,
      new FakeTryOnSessions(),
      new FakeStorage(),
    );

    const created = await service.createSession({
      source: "shopify",
      shop: "merchant.myshopify.com",
      externalProductId: "gid://shopify/Product/1001",
    });

    expect(created.product.externalProductId).toBe("1001");
    expect(prisma.externalProductMapping.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([
            { externalProductId: "gid://shopify/Product/1001" },
            { externalProductId: "1001" },
          ]),
        }),
      }),
    );
  });

  it("normalizes Shopify handles at the storefront API boundary", async () => {
    const prisma = new FakePrisma();
    const service = serviceFor(
      prisma,
      new FakeTryOnSessions(),
      new FakeStorage(),
    );

    await service.createSession({
      source: "shopify",
      shop: "merchant.myshopify.com",
      productHandle: " Linen-Shirt ",
    });

    expect(prisma.externalProductMapping.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([{ externalHandle: "linen-shirt" }]),
        }),
      }),
    );
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

  it("opens a typed jewellery session without asking the shopper for a type", async () => {
    const prisma = new FakePrisma();
    prisma.tryOnMode = "BOTH";
    prisma.product.productVertical = "JEWELLERY";
    prisma.product.jewelleryType = "RING";
    const jewellery = {
      assertStoreCanRunJewelleryTryOn: vi.fn(),
      prepareRunFoundation: vi.fn(),
    };
    const service = serviceFor(
      prisma,
      new FakeTryOnSessions(),
      new FakeStorage(),
      jewellery,
    );
    const created = await service.createSession({
      source: "shopify",
      shop: "merchant.myshopify.com",
      externalProductId: "gid://shopify/Product/1001",
    });
    expect(created.product).toMatchObject({
      tryOnVertical: "JEWELLERY",
      jewelleryType: "RING",
    });
    expect(jewellery.assertStoreCanRunJewelleryTryOn).toHaveBeenCalledWith(
      "store-1",
    );
  });

  it("rejects an enabled jewellery product without a supported type", async () => {
    const prisma = new FakePrisma();
    prisma.product.productVertical = "JEWELLERY";
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

  it("rejects jewellery when the Shopify store enables garments only", async () => {
    const prisma = new FakePrisma();
    prisma.tryOnMode = "GARMENT";
    prisma.product.productVertical = "JEWELLERY";
    prisma.product.jewelleryType = "RING";
    await expect(
      serviceFor(
        prisma,
        new FakeTryOnSessions(),
        new FakeStorage(),
      ).createSession({
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

  it("routes Shopify jewellery runs to the jewellery adapter on shared credits", async () => {
    const prisma = new FakePrisma();
    prisma.tryOnMode = "BOTH";
    prisma.product.productVertical = "JEWELLERY";
    prisma.product.jewelleryType = "EARRING";
    const sessions = new FakeTryOnSessions();
    const jewellery = {
      assertStoreCanRunJewelleryTryOn: vi.fn(),
      prepareRunFoundation: vi.fn().mockResolvedValue({
        jewelleryType: "EARRING",
        provider: {
          provider: "PERFECT_CORP",
          providerDisplayName: "Perfect Corp",
          model: "jewellery",
        },
        productReference: { productId: "product-1" },
      }),
    };
    const jewelleryExecution = {
      assertConfigured: vi.fn(),
      process: vi.fn().mockResolvedValue(undefined),
    };
    const service = serviceFor(
      prisma,
      sessions,
      new FakeStorage(),
      jewellery,
      jewelleryExecution,
    );
    const created = await service.createSession({
      source: "shopify",
      shop: "merchant.myshopify.com",
      externalProductId: "gid://shopify/Product/1001",
    });
    await service.createRun(created.session, {});
    expect(prisma.kioskTryOnRun.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tryOnVertical: "JEWELLERY",
          jewelleryType: "EARRING",
          catalogSource: "SHOPIFY",
        }),
      }),
    );
    expect(jewelleryExecution.process).toHaveBeenCalledWith(
      expect.objectContaining({ jewelleryType: "EARRING" }),
      expect.any(Object),
    );
  });

  it("fails safely when the monthly Shopify store cap is reached", async () => {
    const prisma = new FakePrisma();
    prisma.monthlyShopifyRuns = 10;
    const storage = new FakeStorage();
    const service = serviceFor(prisma, new FakeTryOnSessions(), storage);

    await expect(
      service.createSession({
        source: "shopify",
        shop: "merchant.myshopify.com",
        externalProductId: "gid://shopify/Product/1001",
        monthlyStoreTryOnLimit: 10,
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        error: expect.objectContaining({
          code: SHOPIFY_STOREFRONT_TRY_ON_ERROR_CODES.monthlyLimitReached,
        }),
      }),
    });
    expect(storage.putObject).not.toHaveBeenCalled();
  });

  it("fails safely when the per-visitor Shopify limit is reached", async () => {
    const prisma = new FakePrisma();
    prisma.visitorShopifyRuns = 5;
    const storage = new FakeStorage();
    const service = serviceFor(prisma, new FakeTryOnSessions(), storage);

    await expect(
      service.createSession({
        source: "shopify",
        shop: "merchant.myshopify.com",
        externalProductId: "gid://shopify/Product/1001",
        visitorToken: "v".repeat(43),
        visitorTryOnLimit: 5,
        visitorTryOnLimitPeriod: "DAY",
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        error: expect.objectContaining({
          code: SHOPIFY_STOREFRONT_TRY_ON_ERROR_CODES.visitorLimitReached,
        }),
      }),
    });
    expect(storage.putObject).not.toHaveBeenCalled();
  });

  it("returns privacy-safe Shopify storefront usage summary", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-14T12:00:00.000Z"));
    const prisma = new FakePrisma();
    const service = serviceFor(
      prisma,
      new FakeTryOnSessions(),
      new FakeStorage(),
    );

    const summary = await service.getUsageSummaryForShop(
      "merchant.myshopify.com",
    );

    expect(summary).toEqual({
      totalTryOns: 12,
      thisMonth: {
        start: "2026-09-01T00:00:00.000Z",
        end: "2026-09-14T12:00:00.000Z",
        tryOns: 5,
        completedTryOns: 4,
        failedTryOns: 1,
        generatedImages: 4,
        creditsConsumed: 5,
      },
      topProducts: [
        {
          productId: "product-1",
          productName: "Linen Shirt",
          productSlug: "linen-shirt",
          imageUrl: "https://cdn.example/linen-shirt.png",
          tryOns: 5,
        },
      ],
    });
    expect(prisma.creditLedgerEntry.aggregate).toHaveBeenCalledWith({
      where: expect.objectContaining({
        organizationId: "store-1",
        channel: "SHOPIFY",
        entryType: "CREDIT_CONSUMED",
        occurredAt: {
          gte: new Date("2026-09-01T00:00:00.000Z"),
          lte: new Date("2026-09-14T12:00:00.000Z"),
        },
      }),
      _sum: { quantity: true },
    });
  });

  it("returns only active Shopify-compatible plans", async () => {
    const prisma = new FakePrisma();
    const service = serviceFor(
      prisma,
      new FakeTryOnSessions(),
      new FakeStorage(),
    );

    const plans = await service.getAvailablePlansForShop(
      "merchant.myshopify.com",
    );

    expect(plans.data).toEqual([
      expect.objectContaining({
        id: "plan-shopify-growth",
        code: "shopify-growth",
        name: "Shopify Growth",
        channels: ["SHOPIFY"],
        monthlyPriceCents: 4999,
        includedCredits: 200,
      }),
    ]);
    expect(prisma.pricingPlan.findMany).toHaveBeenCalledWith({
      where: { status: "ACTIVE" },
      orderBy: [{ monthlyPriceCents: "asc" }, { createdAt: "desc" }],
    });
  });
});

function serviceFor(
  prisma: FakePrisma,
  sessions: FakeTryOnSessions,
  storage: FakeStorage,
  jewellery: object = {
    assertStoreCanRunJewelleryTryOn: vi.fn(),
    prepareRunFoundation: vi.fn(),
  },
  jewelleryExecution: object = { assertConfigured: vi.fn(), process: vi.fn() },
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
    {
      assertStoreHasFeature: vi.fn(),
      consumeTryOnCredit: vi.fn(),
    } as never,
    {
      listAvailablePlans: vi.fn(async () =>
        (
          await prisma.pricingPlan.findMany({
            where: { status: "ACTIVE" },
            orderBy: [{ monthlyPriceCents: "asc" }, { createdAt: "desc" }],
          })
        ).map((plan) => ({ ...plan, featureKeys: [] })),
      ),
    } as never,
    jewellery as never,
    jewelleryExecution as never,
  );
}

class FakePrisma {
  integrationConnected = true;
  tryOnMode: "GARMENT" | "JEWELLERY" | "BOTH" = "BOTH";
  monthlyShopifyRuns = 0;
  visitorShopifyRuns = 0;
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
    jewelleryType: null as "RING" | "EARRING" | "NECKLACE" | "BRACELET" | null,
    garmentIntent: "AUTO",
    garmentCategory: "AUTO",
    garmentPhotoType: "AUTO",
    findMany: vi.fn(() => [
      {
        id: "product-1",
        name: "Linen Shirt",
        slug: "linen-shirt",
        imageUrl: "https://cdn.example/linen-shirt.png",
      },
    ]),
  };
  createdCapability: Record<string, any> | null = null;

  integration = {
    findFirst: vi.fn(() =>
      this.integrationConnected
        ? {
            id: "integration-1",
            organizationId: "store-1",
            metadata: { tryOnMode: this.tryOnMode },
          }
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
    findUnique: vi.fn(
      () =>
        this.createdCapability && {
          ...this.createdCapability,
          product: this.product,
          integration: {
            type: "SHOPIFY",
            status: "ACTIVE",
            metadata: { tryOnMode: this.tryOnMode },
            organization: { status: "ACTIVE" },
          },
          tryOnSession: {
            id: "tryon-session-1",
            status: "ACTIVE",
            expiresAt: this.createdCapability.expiresAt,
          },
        },
    ),
  };

  kioskTryOnRun = {
    create: vi.fn(({ data }: { data: Record<string, any> }) => ({
      ...data,
      status: "QUEUED",
      resultAsset: null,
    })),
    update: vi.fn(),
    count: vi.fn(({ where }: { where: Record<string, any> }) => {
      const shopifyCapability =
        where.tryOnSession?.shopifyStorefrontTryOnSession;
      if (shopifyCapability?.visitorTokenHash) return this.visitorShopifyRuns;
      if (shopifyCapability?.shopDomain) return this.monthlyShopifyRuns;
      if (!where.createdAt) return 12;
      if (where.status === "COMPLETED") return 4;
      if (where.status === "FAILED") return 1;
      if (where.resultAssetId) return 4;
      return 5;
    }),
    groupBy: vi.fn(() => [
      {
        productId: "product-1",
        _count: { _all: 5 },
      },
    ]),
  };

  creditLedgerEntry = {
    aggregate: vi.fn(() => ({
      _sum: { quantity: -5 },
    })),
  };

  pricingPlan = {
    findMany: vi.fn((_query?: unknown) => [
      {
        id: "plan-shopify-growth",
        code: "shopify-growth",
        name: "Shopify Growth",
        status: "ACTIVE",
        channels: ["SHOPIFY"],
        currency: "INR",
        monthlyPriceCents: 4999,
        includedCredits: 200,
        trialCredits: 10,
        extraCreditPriceCents: 49,
        kioskMonthlyRentCents: null,
        kioskDeviceLimit: null,
        metadata: null,
        createdAt: new Date("2026-09-01T00:00:00.000Z"),
        updatedAt: new Date("2026-09-01T00:00:00.000Z"),
      },
      {
        id: "plan-kiosk-pro",
        code: "kiosk-pro",
        name: "Kiosk Pro",
        status: "ACTIVE",
        channels: ["KIOSK"],
        currency: "INR",
        monthlyPriceCents: 12999,
        includedCredits: 500,
        trialCredits: 10,
        extraCreditPriceCents: 29,
        kioskMonthlyRentCents: 300000,
        kioskDeviceLimit: 1,
        metadata: null,
        createdAt: new Date("2026-09-01T00:00:00.000Z"),
        updatedAt: new Date("2026-09-01T00:00:00.000Z"),
      },
    ]),
  };
}

class FakeTryOnSessions {
  createdSession: { id: string; expiresAt: Date } | null = null;

  createSession = vi.fn(({ expiresAt }: { expiresAt: Date }) => {
    this.createdSession = { id: "tryon-session-1", expiresAt };
    return this.createdSession;
  });

  attachGarmentAsset = vi.fn(() => ({ id: "garment-asset-1" }));
  getCurrentPersonAsset = vi.fn(async () => ({
    id: "person-asset-1",
    storageKey: "person.png",
    contentType: "image/png",
  }));
  getSessionAsset = vi.fn(async () => ({
    id: "garment-asset-1",
    storageKey: "garment.png",
    contentType: "image/png",
  }));
  completeSession = vi.fn();
}

class FakeStorage {
  readObject = vi.fn(() => png1x1);
  putObject = vi.fn();
  deleteObject = vi.fn();
}
