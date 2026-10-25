import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  beginShopifyBilling,
  syncShopifyBilling,
  submitPendingShopifyUsage,
  CREATE_SUBSCRIPTION,
  CREATE_USAGE,
  CANCEL_SUBSCRIPTION,
} from "./selfx-billing.server";

const shop = "merchant.myshopify.com",
  id = "01a171da-b231-731c-a14e-943e5f633532",
  nativeId = "gid://shopify/AppSubscription/123";
describe("Shopify billing server boundary", () => {
  const fetchImpl = vi.fn(),
    admin = { graphql: vi.fn() };
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubGlobal("fetch", fetchImpl);
    vi.stubEnv("SHOPIFY_BILLING_ENABLED", "true");
    vi.stubEnv("SHOPIFY_BILLING_TEST_MODE", "true");
    vi.stubEnv("SHOPIFY_APP_URL", "https://shopify.selfx.test");
    vi.stubEnv("SELFX_API_BASE_URL", "https://api.selfx.test");
    vi.stubEnv("SELFX_WEB_BASE_URL", "https://app.selfx.test");
    vi.stubEnv("SELFX_SHOPIFY_APP_SERVICE_TOKEN", "s".repeat(32));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });
  function central(url: string) {
    const path = new URL(url).pathname;
    if (path.endsWith("/usage")) return Response.json([]);
    if (path.endsWith("/prepare"))
      return Response.json({
        id,
        plan: {
          name: "Existing SelfX plan",
          currency: "USD",
          monthlyPriceCents: 1999,
          billingMode: "CREDIT_LIMITED",
        },
        usageCapCents: null,
        usageTerms: null,
      });
    return Response.json({ attached: true });
  }
  it("uses central plan prices, asks Shopify for approval and defers changes until renewal", async () => {
    fetchImpl.mockImplementation(central);
    admin.graphql.mockResolvedValue(
      Response.json({
        data: {
          appSubscriptionCreate: {
            userErrors: [],
            appSubscription: { id: nativeId },
            confirmationUrl: `https://${shop}/admin/charges/123/confirm`,
          },
        },
      }),
    );
    expect(await beginShopifyBilling(shop, admin, id)).toContain("/confirm");
    expect(admin.graphql).toHaveBeenCalledWith(CREATE_SUBSCRIPTION, {
      variables: expect.objectContaining({
        name: "Existing SelfX plan",
        test: true,
        lineItems: [
          {
            plan: {
              appRecurringPricingDetails: {
                price: { amount: "19.99", currencyCode: "USD" },
                interval: "EVERY_30_DAYS",
              },
            },
          },
        ],
      }),
    });
    expect(CREATE_SUBSCRIPTION).toContain("APPLY_ON_NEXT_BILLING_CYCLE");
    const prepare = fetchImpl.mock.calls.find((call) =>
      String(call[0]).endsWith("/prepare"),
    );
    expect(JSON.parse(prepare![1].body)).toEqual({ shop, planId: id });
    expect(
      fetchImpl.mock.calls.some((call) => String(call[0]).endsWith("/confirm")),
    ).toBe(false);
  });
  it("refuses a foreign approval destination and never attaches it", async () => {
    fetchImpl.mockImplementation(central);
    admin.graphql.mockResolvedValue(
      Response.json({
        data: {
          appSubscriptionCreate: {
            userErrors: [],
            appSubscription: { id: nativeId },
            confirmationUrl: "https://attacker.test/approve",
          },
        },
      }),
    );
    await expect(beginShopifyBilling(shop, admin, id)).rejects.toThrow(
      "unexpected approval",
    );
    expect(
      fetchImpl.mock.calls.some((call) => String(call[0]).endsWith("/attach")),
    ).toBe(false);
  });
  it("leaves the current plan unchanged on Shopify user errors", async () => {
    fetchImpl.mockImplementation(central);
    admin.graphql.mockResolvedValue(
      Response.json({
        data: {
          appSubscriptionCreate: {
            userErrors: [{ message: "Unsupported" }],
            appSubscription: null,
            confirmationUrl: null,
          },
        },
      }),
    );
    await expect(beginShopifyBilling(shop, admin, id)).rejects.toThrow(
      "could not create",
    );
    expect(
      fetchImpl.mock.calls.some((call) => String(call[0]).endsWith("/confirm")),
    ).toBe(false);
  });
  it("reads status and amounts from Shopify rather than trusting a return URL", async () => {
    fetchImpl.mockImplementation((url: string) =>
      new URL(url).pathname.endsWith("/agreements")
        ? Response.json([
            { id, externalSubscriptionId: nativeId, status: "PENDING" },
          ])
        : Response.json(
            new URL(url).pathname.endsWith("/usage") ? [] : { active: true },
          ),
    );
    admin.graphql.mockResolvedValue(
      Response.json({
        data: {
          node: {
            id: nativeId,
            status: "ACTIVE",
            test: true,
            currentPeriodEnd: "2026-11-25T00:00:00.000Z",
            lineItems: [
              {
                id: "line",
                plan: {
                  pricingDetails: {
                    __typename: "AppRecurringPricing",
                    interval: "EVERY_30_DAYS",
                    price: { amount: "19.99", currencyCode: "USD" },
                  },
                },
              },
            ],
          },
        },
      }),
    );
    await syncShopifyBilling(shop, admin);
    const confirm = fetchImpl.mock.calls.find((call) =>
      String(call[0]).endsWith("/confirm"),
    );
    expect(JSON.parse(confirm![1].body)).toMatchObject({
      shop,
      subscriptionId: nativeId,
      recurringAmountCents: 1999,
      test: true,
      status: "ACTIVE",
    });
  });
  it("retries an unacknowledged usage charge with the same Shopify idempotency key", async () => {
    let acknowledgements = 0;
    fetchImpl.mockImplementation((url: string) => {
      if (new URL(url).pathname.endsWith("/usage"))
        return Response.json([
          {
            id,
            amountCents: 25,
            currency: "USD",
            idempotencyKey: "k".repeat(64),
            agreement: { usageLineItemId: "line" },
          },
        ]);
      return ++acknowledgements === 1
        ? Response.json({ error: { code: "UNAVAILABLE" } }, { status: 503 })
        : Response.json({ recorded: true });
    });
    admin.graphql.mockImplementation(async () =>
      Response.json({
        data: {
          appUsageRecordCreate: {
            userErrors: [],
            appUsageRecord: { id: "gid://shopify/AppUsageRecord/1" },
          },
        },
      }),
    );
    await expect(submitPendingShopifyUsage(shop, admin)).rejects.toThrow();
    await submitPendingShopifyUsage(shop, admin);
    expect(admin.graphql).toHaveBeenCalledTimes(2);
    for (const call of admin.graphql.mock.calls)
      expect(call).toEqual([
        CREATE_USAGE,
        {
          variables: {
            line: "line",
            price: { amount: "0.25", currencyCode: "USD" },
            description: "One successfully generated SelfX Try-On",
            key: "k".repeat(64),
          },
        },
      ]);
  });
  it("cancels a new native approval if a concurrent disconnect prevents attachment", async () => {
    fetchImpl.mockImplementation((url: string) =>
      String(url).endsWith("/attach")
        ? Response.json(
            { error: { message: "Connection inactive" } },
            { status: 409 },
          )
        : central(url),
    );
    admin.graphql.mockImplementation(async (query: string) =>
      Response.json({
        data:
          query === CREATE_SUBSCRIPTION
            ? {
                appSubscriptionCreate: {
                  userErrors: [],
                  appSubscription: { id: nativeId },
                  confirmationUrl: `https://${shop}/admin/charges/123/confirm`,
                },
              }
            : {
                appSubscriptionCancel: {
                  userErrors: [],
                  appSubscription: { id: nativeId, status: "CANCELLED" },
                },
              },
      }),
    );
    await expect(beginShopifyBilling(shop, admin, id)).rejects.toThrow(
      "Connection inactive",
    );
    expect(admin.graphql).toHaveBeenLastCalledWith(CANCEL_SUBSCRIPTION, {
      variables: { id: nativeId },
    });
  });
  it("does not perform billing operations until explicitly enabled", async () => {
    vi.stubEnv("SHOPIFY_BILLING_ENABLED", "false");
    await expect(beginShopifyBilling(shop, admin, id)).rejects.toThrow(
      "not been enabled",
    );
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(admin.graphql).not.toHaveBeenCalled();
  });
});
