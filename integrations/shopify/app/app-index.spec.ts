import { beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  createMemoryRouter,
  createRequestHandler,
  RouterProvider,
  type ServerBuild,
} from "react-router";

const connection = vi.hoisted(() => ({
  authenticate: vi.fn(),
  connect: vi.fn(),
  complete: vi.fn(),
  restart: vi.fn(),
  sync: vi.fn(),
  beginBilling: vi.fn(),
  resumeBilling: vi.fn(),
  routeError: undefined as unknown,
}));

vi.mock("react-router", async (original) => ({
  ...(await original<typeof import("react-router")>()),
  useRouteError: () => connection.routeError,
}));
vi.mock("./selfx-billing.server", async (original) => ({
  ...(await original<typeof import("./selfx-billing.server")>()),
  beginShopifyBilling: connection.beginBilling,
  resumeUnapprovedShopifyPlan: connection.resumeBilling,
}));

vi.mock("./shopify.server", () => ({
  authenticate: { admin: connection.authenticate },
}));
vi.mock("./selfx-connection-auth.server", () => ({
  withShopifyConnectionRecovery: async (
    _request: Request,
    context: { session: { shop: string; accessToken: string } },
    operation: (input: {
      shop: string;
      shopifyAccessToken: string;
    }) => Promise<unknown>,
  ) =>
    operation({
      shop: context.session.shop,
      shopifyAccessToken: context.session.accessToken,
    }),
}));
vi.mock("./selfx-connection.server", () => ({
  startSelfxConnection: connection.connect,
  completeSelfxConnection: connection.complete,
  restartSelfxConnection: connection.restart,
  runSelfxCatalogSync: connection.sync,
}));

import { PlanCard } from "./plan-card";
import { loader as navigationAction } from "./routes/selfx-action";
import {
  action,
  ErrorBoundary,
  headers,
  PlansPanel,
  BillingVerificationNotice,
} from "./routes/app._index";
import type { ComponentProps } from "react";

const shop = "selfx-test-store.myshopify.com";

function connectionRequest(intent: string): Request {
  return new Request("https://example.test/app", {
    method: "POST",
    body: new URLSearchParams({ intent }),
  });
}

function renderErrorBoundary() {
  // The framework's route wrapper also reads loader/action data, so supply a
  // real data router in both the plain Vitest and Vite-plugin test contexts.
  const router = createMemoryRouter([{ path: "/", Component: ErrorBoundary }]);
  try {
    return renderToStaticMarkup(createElement(RouterProvider, { router }));
  } finally {
    router.dispose();
  }
}

describe("billing verification cancellation recovery", () => {
  it.each([null, "Basic"])(
    "shows cancellation only when an unapproved native plan exists (%s)",
    (pendingPlanName) => {
      const router = createMemoryRouter([
        {
          path: "/",
          Component: () =>
            createElement(BillingVerificationNotice, {
              message: "Billing needs a retry.",
              pendingPlanName,
              onRetry: vi.fn(),
            }),
        },
      ]);
      try {
        const markup = renderToStaticMarkup(
          createElement(RouterProvider, { router }),
        );
        expect(markup).toContain("Retry billing verification");
        expect(markup.includes("Review pending approval")).toBe(
          Boolean(pendingPlanName),
        );
        expect(markup.includes('value="billing:review-pending"')).toBe(
          Boolean(pendingPlanName),
        );
        expect(markup).not.toContain('value="billing:choose"');
      } finally {
        router.dispose();
      }
    },
  );
});

describe("Shopify approval redirect and authentication responses", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    connection.routeError = undefined;
  });
  const approvalUrl = `https://${shop}/admin/charges/123/confirm`;
  it("reopens the pending approval through authenticated top-level navigation without creating another charge", async () => {
    const redirect = new Response(null, {
      status: 401,
      headers: { "X-Shopify-API-Request-Failure-Reauthorize-Url": approvalUrl },
    });
    connection.resumeBilling.mockResolvedValue(approvalUrl);
    const navigate = vi.fn(() => {
      throw redirect;
    });
    connection.authenticate.mockResolvedValue({
      session: { shop },
      admin: {},
      redirect: navigate,
    });
    await expect(
      action({ request: connectionRequest("billing:review-pending") } as never),
    ).rejects.toBe(redirect);
    expect(connection.resumeBilling).toHaveBeenCalledExactlyOnceWith(shop);
    expect(connection.beginBilling).not.toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith(approvalUrl, { target: "_top" });
  });
  it("preserves the SDK approval redirect rather than turning its 401 into an action error", async () => {
    const redirect = new Response(null, {
      status: 401,
      headers: { "X-Shopify-API-Request-Failure-Reauthorize-Url": approvalUrl },
    });
    connection.beginBilling.mockResolvedValue(approvalUrl);
    const navigate = vi.fn(() => {
      throw redirect;
    });
    connection.authenticate.mockResolvedValue({
      session: { shop },
      admin: {},
      redirect: navigate,
    });
    await expect(
      action({ request: connectionRequest("billing:choose") } as never),
    ).rejects.toBe(redirect);
    expect(navigate).toHaveBeenCalledWith(approvalUrl, { target: "_top" });
    expect(connection.beginBilling).toHaveBeenCalledTimes(1);
  });
  it.each([
    ["X-Shopify-API-Request-Failure-Reauthorize-Url", approvalUrl],
    ["X-Shopify-Retry-Invalid-Session-Request", "1"],
  ])(
    "forwards %s from the child route's error response to App Bridge",
    (name, value) => {
      const result = new Headers(
        headers({
          parentHeaders: new Headers(),
          loaderHeaders: new Headers(),
          actionHeaders: new Headers(),
          errorHeaders: new Headers({ [name]: value }),
        } as never),
      );
      expect(result.get(name)).toBe(value);
    },
  );
  it("preserves parent and successful action headers", () => {
    const result = new Headers(
      headers({
        parentHeaders: new Headers({
          "Content-Security-Policy":
            "frame-ancestors https://admin.shopify.com",
        }),
        loaderHeaders: new Headers(),
        actionHeaders: new Headers({ "Cache-Control": "no-store" }),
        errorHeaders: new Headers(),
      } as never),
    );
    expect(result.get("Content-Security-Policy")).toContain(
      "admin.shopify.com",
    );
    expect(result.get("Cache-Control")).toBe("no-store");
  });
  it.each([false, true])(
    "delivers the iframe approval redirect header over HTTP only when the error boundary forwards it (%s)",
    async (forwardHeaders) => {
      connection.beginBilling.mockResolvedValue(approvalUrl);
      connection.authenticate.mockResolvedValue({
        session: { shop },
        admin: {},
        redirect: () => {
          throw new Response(null, {
            status: 401,
            statusText: "Unauthorized",
            headers: {
              "X-Shopify-API-Request-Failure-Reauthorize-Url": approvalUrl,
            },
          });
        },
      });
      const build = {
        entry: {
          module: {
            default: () => new Response("document"),
            handleError: vi.fn(),
          },
        },
        routes: {
          root: { id: "root", path: "", module: { default: () => null } },
          app: {
            id: "app",
            parentId: "root",
            path: "app",
            module: { default: () => null, headers },
          },
          index: {
            id: "index",
            parentId: "app",
            index: true,
            module: {
              action,
              ErrorBoundary,
              ...(forwardHeaders ? { headers } : {}),
            },
          },
        },
        assets: { version: "test", routes: {} },
        publicPath: "/",
        assetsBuildDirectory: "build/client",
        future: {},
        ssr: true,
        isSpaMode: false,
        prerender: [],
        routeDiscovery: { mode: "initial", manifestPath: "/__manifest" },
      } as unknown as ServerBuild;
      const response = await createRequestHandler(
        build,
        "test",
      )(
        new Request("https://example.test/app.data?index&embedded=1", {
          method: "POST",
          body: new URLSearchParams({ intent: "billing:choose" }),
        }),
      );
      expect(response.status).toBe(401);
      expect(
        response.headers.get("X-Shopify-API-Request-Failure-Reauthorize-Url"),
      ).toBe(forwardHeaders ? approvalUrl : null);
      await response.text();
    },
  );
  it("lets Shopify render its authentication response instead of the generic migration error page", () => {
    class ErrorResponseImpl {
      status = 401;
      statusText = "Unauthorized";
      internal = false;
      data =
        '<span data-shopify-auth="recovery">Recovering authentication</span>';
    }
    connection.routeError = new ErrorResponseImpl();
    const markup = renderErrorBoundary();
    expect(markup).toContain('data-shopify-auth="recovery"');
    expect(markup).not.toContain("SelfX could not complete that request");
    expect(markup).not.toContain("database migrations");
  });
  it("keeps the SelfX fallback for an ordinary application error", () => {
    connection.routeError = new Error("Temporary application failure");
    const markup = renderErrorBoundary();
    expect(markup).toContain("SelfX could not complete that request");
    expect(markup).toContain("Temporary application failure");
  });
});

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
  it.each([
    ["connection:connect", "connect", connection.connect],
    ["connection:restart", "restart", connection.restart],
  ])(
    "preserves SDK recovery responses for %s in both connection entry points",
    async (intent, navigationIntent, operation) => {
      const response = new Response(null, {
        status: 401,
        headers: { "X-Shopify-Retry-Invalid-Session-Request": "1" },
      });
      operation.mockRejectedValue(response);
      await expect(
        action({ request: connectionRequest(intent) } as never),
      ).rejects.toBe(response);
      await expect(
        navigationAction({
          request: new Request(
            `https://example.test/selfx-action?selfxIntent=${navigationIntent}`,
          ),
        } as never),
      ).rejects.toBe(response);
      expect(
        response.headers.get("X-Shopify-Retry-Invalid-Session-Request"),
      ).toBe("1");
    },
  );
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
  it("guides unapproved merchants to connection approval without a misleading billing failure", () => {
    const markup = renderToStaticMarkup(
      createElement(PlansPanel, {
        ...props,
        connectionReady: false,
        pendingApproval: true,
        recoveryUrl: "https://app.selfx.test/approve",
        creditSummaryError: null,
      }),
    );
    expect(markup).toContain("Approve in SelfX");
    expect(markup).toContain("Complete SelfX approval");
    expect(markup).not.toContain(
      "Shopify billing status could not be verified",
    );
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
