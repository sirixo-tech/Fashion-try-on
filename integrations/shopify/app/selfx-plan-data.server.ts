import { loadSelfxLinkConfig, SelfxLinkApiError } from "./selfx-link.server";
import { SelfxStorefrontTryOnClient } from "./selfx-storefront-tryon.server";

// Catalog browsing must not depend on local sync/connection-health diagnostics.
// The API separately authorizes access to this shop's private credit summary.
export async function loadSelfxPlanData(shop: string) {
  async function read<T>(
    operation: "plans" | "credits",
    load: () => Promise<T>,
  ) {
    try {
      return { data: await load(), error: null };
    } catch (error) {
      console.error(
        JSON.stringify({
          event: "selfx_shopify_plan_data_failed",
          operation,
          status: error instanceof SelfxLinkApiError ? error.status : null,
        }),
      );
      return {
        data: null,
        error:
          operation === "plans"
            ? "We couldn’t load available plans. Try again."
            : "We couldn’t load your current plan and credits. Try again.",
      };
    }
  }
  const [plans, credits] = await Promise.all([
    read("plans", () =>
      new SelfxStorefrontTryOnClient(loadSelfxLinkConfig()).getAvailablePlans(
        shop,
      ),
    ),
    read("credits", () =>
      new SelfxStorefrontTryOnClient(loadSelfxLinkConfig()).getCreditSummary(
        shop,
      ),
    ),
  ]);
  return {
    availablePlans: plans.data?.data ?? [],
    plansError: plans.error,
    creditSummary: credits.data,
    creditSummaryError: credits.error,
  };
}
