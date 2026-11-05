import { beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const connection = vi.hoisted(() => ({
  authenticate: vi.fn(),
  connect: vi.fn(),
  complete: vi.fn(),
  restart: vi.fn(),
  sync: vi.fn(),
}));

vi.mock("./shopify.server", () => ({
  authenticate: { admin: connection.authenticate },
}));
vi.mock("./selfx-connection.server", () => ({
  startSelfxConnection: connection.connect,
  completeSelfxConnection: connection.complete,
  restartSelfxConnection: connection.restart,
  runSelfxCatalogSync: connection.sync,
}));

import { PlanCard } from "./plan-card";
import { action, PlansPanel } from "./routes/app._index";
import type { ComponentProps } from "react";

const shop = "selfx-test-store.myshopify.com";

function connectionRequest(intent: string): Request {
  return new Request("https://example.test/app", {
    method: "POST",
    body: new URLSearchParams({ intent }),
  });
}

describe("Shopify connection actions on the embedded app page", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    connection.authenticate.mockResolvedValue({
      session: { shop, accessToken: "shopify-token" },
    });
  });

  it.each([
    ["connection:connect", connection.connect],
    ["connection:complete", connection.complete],
    ["connection:restart", connection.restart],
    ["connection:sync", connection.sync],
  ])("runs %s for the authenticated shop", async (intent, operation) => {
    const result = await action({
      request: connectionRequest(intent),
    } as Parameters<typeof action>[0]);

    expect(operation).toHaveBeenCalledExactlyOnceWith({
      shop,
      shopifyAccessToken: "shopify-token",
    });
    expect(result).toMatchObject({ connectionActionError: null });
  });

  it("rejects reconnect when the Shopify session has no access token", async () => {
    connection.authenticate.mockResolvedValue({
      session: { shop, accessToken: "" },
    });

    const result = await action({
      request: connectionRequest("connection:restart"),
    } as Parameters<typeof action>[0]);

    expect(connection.restart).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      connectionActionError:
        "The SelfX connection could not be completed. Try again.",
    });
  });
});

describe("Shopify plan card presentation", () => {
  it("expands every feature and marks the current plan as in use", () => {
    const markup = renderToStaticMarkup(
      createElement(PlanCard, {
        active: true,
        canChooseShopifyPlan: true,
        plan: {
          id: "plan-pro",
          code: "pro",
          name: "Pro",
          channels: ["SHOPIFY"],
          currency: "INR",
          monthlyPriceCents: 120000,
          includedCredits: 100,
          trialCredits: 0,
          storeLocationLimit: 2,
          extraCreditPriceCents: 500,
          kioskMonthlyRentCents: null,
          kioskDeviceLimit: null,
          featureKeys: [
            "shopify",
            "multilanguage",
            "usage_analytics",
            "product_analytics",
            "try_on_widget",
            "developer_api",
            "priority_support",
          ],
        },
      }),
    );

    expect(markup).toContain("<summary>+2 more</summary>");
    expect(markup).toContain("Developer Api");
    expect(markup).toContain("Priority Support");
    expect(markup).toContain('role="status">In use</div>');
    expect(markup).not.toContain(">Active</span>");
  });
});

describe("embedded Shopify Plans tab", () => {
  const plan = {
    id: "plan-pro",
    code: "pro",
    name: "Pro",
    currency: "USD",
    billingMode: "CREDIT_LIMITED" as const,
    monthlyPriceCents: 2000,
    includedCredits: 100,
    trialCredits: 0,
    channels: ["SHOPIFY"],
    storeLocationLimit: 1,
    extraCreditPriceCents: null,
    kioskMonthlyRentCents: null,
    kioskDeviceLimit: null,
    featureKeys: ["priority_support"],
  };
  const props: ComponentProps<typeof PlansPanel> = {
    adminLocale: "en",
    availablePlans: [plan],
    availableCredits: 0,
    includedCredits: 0,
    billingUrl: "https://app.selfx.test/app/billing",
    billingOwnership: null,
    shopifyBillingEnabled: true,
    creditHealth: "UNKNOWN",
    creditSummary: null,
    plansError: null,
    creditSummaryError: "Credits could not be loaded.",
    retrying: false,
    onRetry: vi.fn(),
  };
  it("shows catalog pricing and features even when current credits fail", () => {
    const markup = renderToStaticMarkup(createElement(PlansPanel, props));
    expect(markup).toContain("Pro");
    expect(markup).toContain("$20");
    expect(markup).toContain("Priority Support");
    expect(markup).toContain("Retry loading plans");
    expect(markup).toContain("Unavailable");
    expect(markup).not.toContain("View Plans in SelfX");
    expect(markup).not.toContain("Available credits</s-text><s-heading>0");
    expect(markup).not.toContain('value="billing:choose"');
  });
  it("preserves the assigned plan when the catalog request fails", () => {
    const markup = renderToStaticMarkup(
      createElement(PlansPanel, {
        ...props,
        availablePlans: [],
        plansError: "Plans could not be loaded.",
        creditSummaryError: null,
        availableCredits: 42,
        includedCredits: 100,
        creditSummary: {
          availableCredits: 42,
          subscription: {
            id: "subscription",
            status: "ACTIVE",
            channels: ["SHOPIFY"],
            includedCredits: 100,
            trialCredits: 0,
            currentPeriodStart: null,
            currentPeriodEnd: null,
            trialStartedAt: null,
            trialEndsAt: null,
            pricingPlan: plan,
          },
        },
      }),
    );
    expect(markup).toContain("Pro");
    expect(markup).toContain('role="status">In use</div>');
    expect(markup).toContain(">42</s-heading>");
    expect(markup).toContain("Retry loading plans");
    expect(markup).not.toContain("No active Shopify-compatible plans");
  });
  it("distinguishes a healthy empty catalog from a failed request", () => {
    const markup = renderToStaticMarkup(
      createElement(PlansPanel, {
        ...props,
        availablePlans: [],
        creditSummaryError: null,
        creditSummary: { availableCredits: 0, subscription: null },
      }),
    );
    expect(markup).toContain(
      "No active Shopify-compatible plans are currently available.",
    );
    expect(markup).toContain("No current plan");
    expect(markup).not.toContain("Retry loading plans");
  });
});
