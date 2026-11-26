import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  beginShopifyBilling,
  syncShopifyBilling,
  CREATE_CREDIT_PURCHASE,
  READ_CREDIT_PURCHASE,
  RECOVER_CREDIT_PURCHASES,
  CANCEL_SUBSCRIPTION,
  READ_SUBSCRIPTION,
} from "./selfx-billing.server";

describe("Shopify one-time credit purchase boundary", () => {
  const shop = "credits.myshopify.com",
    id = "01a171da-b231-731c-a14e-943e5f633532";
  const nativeId = "gid://shopify/AppPurchaseOneTime/777",
    name = `Credit pack [SelfX:${id}]`;
  const native = {
    id: nativeId,
    name,
    status: "ACTIVE",
    test: true,
    price: { amount: "10.00", currencyCode: "INR" },
  };
  const request = vi.fn(),
    admin = { graphql: vi.fn() };
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubGlobal("fetch", request);
    for (const [key, value] of Object.entries({
      SHOPIFY_BILLING_ENABLED: "true",
      SHOPIFY_BILLING_TEST_MODE: "true",
      SHOPIFY_APP_URL: "https://shopify.selfx.test",
      SHOPIFY_API_KEY: "test-client",
      SELFX_API_BASE_URL: "https://api.selfx.test",
      SELFX_WEB_BASE_URL: "https://web.selfx.test",
      SELFX_SHOPIFY_APP_SERVICE_TOKEN: "x".repeat(32),
    }))
      vi.stubEnv(key, value);
    request.mockImplementation(async (url: string) => {
      if (url.includes("/usage?")) return Response.json([]);
      if (url.endsWith("/prepare"))
        return Response.json({
          id,
          purchaseKind: "CREDIT_PACK",
          createAllowed: true,
          plan: {
            name: "Credit pack",
            billingMode: "CREDIT_LIMITED",
            monthlyPriceCents: 1000,
            currency: "INR",
          },
        });
      return Response.json({ attached: true });
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });
  it("creates one approved-price purchase with a deterministic recovery identity and no recurring charge", async () => {
    admin.graphql.mockResolvedValue(
      Response.json({
        data: {
          appPurchaseOneTimeCreate: {
            appPurchaseOneTime: { id: nativeId },
            confirmationUrl: `https://${shop}/admin/charges/777/confirm`,
            userErrors: [],
          },
        },
      }),
    );
    expect(await beginShopifyBilling(shop, admin, id, undefined, id)).toContain(
      "/confirm",
    );
    expect(admin.graphql).toHaveBeenCalledWith(CREATE_CREDIT_PURCHASE, {
      variables: {
        name,
        price: native.price,
        returnUrl: `https://admin.shopify.com/store/credits/apps/test-client/app/billing/return?agreement=${id}`,
        test: true,
      },
    });
    expect(
      request.mock.calls.filter(([url]) => String(url).endsWith("/attach")),
    ).toHaveLength(1);
    expect(admin.graphql).not.toHaveBeenCalledWith(
      CANCEL_SUBSCRIPTION,
      expect.anything(),
    );
  });
  it.each(["ACTIVE", "PENDING", "DECLINED"])(
    "reports verified native %s without trusting callback charge IDs",
    async (status) => {
      request.mockImplementation(async (url: string) =>
        url.includes("/agreements?")
          ? Response.json([
              {
                id,
                purchaseKind: "CREDIT_PACK",
                externalSubscriptionId: nativeId,
                status: "PENDING",
                pricingSnapshot: { name: "Credit pack" },
              },
            ])
          : Response.json([]),
      );
      admin.graphql.mockResolvedValue(
        Response.json({ data: { node: { ...native, status } } }),
      );
      await syncShopifyBilling(shop, admin);
      expect(admin.graphql).toHaveBeenCalledWith(READ_CREDIT_PURCHASE, {
        variables: { id: nativeId },
      });
      const confirmed = request.mock.calls.find(([url]) =>
        String(url).endsWith("/confirm"),
      );
      expect(JSON.parse(confirmed![1].body)).toMatchObject({
        shop,
        subscriptionId: nativeId,
        status,
        currency: "INR",
        recurringAmountCents: 1000,
        test: true,
      });
    },
  );
  it("recovers a lost mutation response by exact purchase identity without creating another charge", async () => {
    request.mockImplementation(async (url: string) =>
      url.includes("/agreements?")
        ? Response.json([
            {
              id,
              purchaseKind: "CREDIT_PACK",
              externalSubscriptionId: null,
              status: "PENDING",
              createdAt: new Date(Date.now() - 180000).toISOString(),
              pricingSnapshot: { name: "Credit pack" },
            },
          ])
        : Response.json([]),
    );
    admin.graphql.mockResolvedValue(
      Response.json({
        data: {
          currentAppInstallation: {
            oneTimePurchases: {
              nodes: [native],
              pageInfo: { hasNextPage: false, endCursor: null },
            },
          },
        },
      }),
    );
    await syncShopifyBilling(shop, admin);
    expect(admin.graphql).toHaveBeenCalledWith(RECOVER_CREDIT_PURCHASES, {
      variables: { after: null },
    });
    expect(admin.graphql).not.toHaveBeenCalledWith(
      CREATE_CREDIT_PURCHASE,
      expect.anything(),
    );
    expect(
      request.mock.calls.some(([url]) => String(url).endsWith("/attach")),
    ).toBe(true);
  });
  it("does not create a second charge when an interrupted purchase remains uncertain", async () => {
    request.mockImplementation(async (url: string) =>
      url.includes("/agreements?")
        ? Response.json([
            {
              id,
              purchaseKind: "CREDIT_PACK",
              status: "PENDING",
              createdAt: new Date(Date.now() - 180000).toISOString(),
              pricingSnapshot: { name: "Credit pack" },
            },
          ])
        : Response.json([]),
    );
    admin.graphql.mockResolvedValue(
      Response.json({
        data: {
          currentAppInstallation: {
            oneTimePurchases: {
              nodes: [],
              pageInfo: { hasNextPage: false, endCursor: null },
            },
          },
        },
      }),
    );
    await expect(syncShopifyBilling(shop, admin)).rejects.toThrow(
      "interrupted credit purchase",
    );
    expect(admin.graphql).not.toHaveBeenCalledWith(
      CREATE_CREDIT_PURCHASE,
      expect.anything(),
    );
    expect(
      request.mock.calls.some(([url]) => String(url).endsWith("/decline")),
    ).toBe(false);
  });
  it("rejects an unrelated purchase even when its amount matches", async () => {
    request.mockImplementation(async (url: string) =>
      url.includes("/agreements?")
        ? Response.json([
            {
              id,
              purchaseKind: "CREDIT_PACK",
              externalSubscriptionId: nativeId,
              pricingSnapshot: { name: "Credit pack" },
            },
          ])
        : Response.json([]),
    );
    admin.graphql.mockResolvedValue(
      Response.json({
        data: { node: { ...native, name: "Another purchase" } },
      }),
    );
    await expect(syncShopifyBilling(shop, admin)).rejects.toThrow(
      "does not match",
    );
    expect(
      request.mock.calls.some(([url]) => String(url).endsWith("/confirm")),
    ).toBe(false);
  });
  it.each([true, false])(
    "verifies native retirement of a legacy recurring credit charge (test=%s)",
    async (test) => {
      const legacyId = "gid://shopify/AppSubscription/123";
      request.mockImplementation(async (url: string) =>
        url.includes("/agreements?")
          ? Response.json([
              {
                id,
                purchaseKind: "LEGACY_SUBSCRIPTION",
                externalSubscriptionId: legacyId,
                status: "ACTIVE",
                pricingSnapshot: {
                  name: "Old credit plan",
                  billingMode: "CREDIT_LIMITED",
                },
              },
            ])
          : Response.json([]),
      );
      let reads = 0;
      admin.graphql.mockImplementation(async (query: string) => {
        if (query === CANCEL_SUBSCRIPTION)
          return Response.json({
            data: { appSubscriptionCancel: { userErrors: [] } },
          });
        expect(query).toBe(READ_SUBSCRIPTION);
        return Response.json({
          data: {
            node: {
              id: legacyId,
              status: ++reads === 1 ? "ACTIVE" : "CANCELLED",
              test,
              currentPeriodEnd: null,
              lineItems: [
                {
                  id: "recurring",
                  plan: {
                    pricingDetails: {
                      __typename: "AppRecurringPricing",
                      interval: "EVERY_30_DAYS",
                      price: { amount: "10.00", currencyCode: "INR" },
                    },
                  },
                },
              ],
            },
          },
        });
      });
      await syncShopifyBilling(shop, admin);
      expect(admin.graphql).toHaveBeenCalledWith(CANCEL_SUBSCRIPTION, {
        variables: { id: legacyId },
      });
      const confirmations = request.mock.calls
        .filter(([url]) => String(url).endsWith("/confirm"))
        .map(([, init]) => JSON.parse(init.body).status);
      expect(confirmations).toEqual(
        test ? ["ACTIVE", "CANCELLED"] : ["CANCELLED"],
      );
      expect(admin.graphql).not.toHaveBeenCalledWith(
        CREATE_CREDIT_PURCHASE,
        expect.anything(),
      );
    },
  );
});
