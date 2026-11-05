import { afterEach, describe, expect, it, vi } from "vitest";
import { loadSelfxPlanData } from "./selfx-plan-data.server";
import { SelfxStorefrontTryOnClient } from "./selfx-storefront-tryon.server";
import { SelfxLinkApiError } from "./selfx-link.server";

vi.mock("./selfx-link.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./selfx-link.server")>()),
  loadSelfxLinkConfig: () => ({
    apiBaseUrl: "https://api.selfx.test",
    webBaseUrl: "https://app.selfx.test",
    serviceToken: "secret",
  }),
}));
afterEach(() => vi.restoreAllMocks());

describe("independent Shopify plan data", () => {
  it("retains the catalog when the private credit summary fails", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const plans = vi
      .spyOn(SelfxStorefrontTryOnClient.prototype, "getAvailablePlans")
      .mockResolvedValue({ data: [{ id: "plan" }] } as never);
    vi.spyOn(
      SelfxStorefrontTryOnClient.prototype,
      "getCreditSummary",
    ).mockRejectedValue(
      new SelfxLinkApiError("PRIVATE", "secret response", 404),
    );
    const result = await loadSelfxPlanData("merchant.myshopify.com");
    expect(plans).toHaveBeenCalledWith("merchant.myshopify.com");
    expect(result).toMatchObject({
      availablePlans: [{ id: "plan" }],
      plansError: null,
      creditSummary: null,
    });
    expect(result.creditSummaryError).toContain("current plan and credits");
    expect(log.mock.calls[0]![0]).not.toContain("secret response");
  });

  it("retains the current plan when catalog loading fails and recovers on retry", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const plans = vi
      .spyOn(SelfxStorefrontTryOnClient.prototype, "getAvailablePlans")
      .mockRejectedValueOnce(
        new SelfxLinkApiError("UNAVAILABLE", "secret response", 503),
      )
      .mockResolvedValue({ data: [] });
    vi.spyOn(
      SelfxStorefrontTryOnClient.prototype,
      "getCreditSummary",
    ).mockResolvedValue({ availableCredits: 25, subscription: null });
    const result = await loadSelfxPlanData("merchant.myshopify.com");
    expect(result.creditSummary?.availableCredits).toBe(25);
    expect(result.plansError).toContain("load available plans");
    expect(JSON.parse(log.mock.calls[0]![0])).toEqual({
      event: "selfx_shopify_plan_data_failed",
      operation: "plans",
      status: 503,
    });
    expect(log.mock.calls[0]![0]).not.toContain("secret");
    const retried = await loadSelfxPlanData("merchant.myshopify.com");
    expect(plans).toHaveBeenCalledTimes(2);
    expect(retried.plansError).toBeNull();
    expect(retried.availablePlans).toEqual([]);
  });
});
