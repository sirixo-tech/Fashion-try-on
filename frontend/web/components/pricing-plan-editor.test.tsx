import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { SelfxUiProvider } from "@selfx/ui";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PricingPlanEditor } from "./pricing-plan-editor";
import {
  createPricingPlan,
  listPlanFeatures,
  listPricingPlans,
} from "@/lib/pricing";
import { getCurrentPlatformAccess } from "@/lib/access-control";
import { getPlatformVirtualTryOnSettings } from "@/lib/platform-settings";

const { replace } = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }));
vi.mock("@/lib/session", () => ({
  useSession: () => ({ status: "authenticated", accessToken: "token" }),
}));
vi.mock("@/lib/access-control", () => ({ getCurrentPlatformAccess: vi.fn() }));
vi.mock("@/lib/platform-settings", () => ({
  getPlatformVirtualTryOnSettings: vi.fn(),
}));
vi.mock("@/lib/pricing", () => ({
  createPricingPlan: vi.fn(),
  updatePricingPlan: vi.fn(),
  listPlanFeatures: vi.fn(),
  listPricingPlans: vi.fn(),
}));

describe("postpaid plan editor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCurrentPlatformAccess).mockResolvedValue({
      isSuperadmin: true,
      permissions: [],
    });
    vi.mocked(getPlatformVirtualTryOnSettings).mockResolvedValue({
      defaultCurrency: "INR",
    } as never);
    vi.mocked(listPlanFeatures).mockResolvedValue([]);
    vi.mocked(listPricingPlans).mockResolvedValue([]);
    vi.mocked(createPricingPlan).mockImplementation(
      async (_token, input) =>
        ({ ...input, id: "created-payg", featureKeys: [] }) as never,
    );
  });
  afterEach(cleanup);

  it("saves a postpaid rate with no monthly fee, allowance, trial or advance credit-pack price", async () => {
    render(
      <SelfxUiProvider>
        <PricingPlanEditor mode="create" />
      </SelfxUiProvider>,
    );
    fireEvent.change(await screen.findByLabelText("Plan name"), {
      target: { value: "Usage plan" },
    });
    fireEvent.click(screen.getByRole("combobox", { name: "Billing model" }));
    const option = await screen.findByRole("option", {
      name: "Pay as you go (postpaid)",
    });
    fireEvent.pointerDown(option, { pointerType: "mouse" });
    fireEvent.click(option);
    fireEvent.change(await screen.findByLabelText("Price per credit"), {
      target: { value: "1.25" },
    });
    fireEvent.submit(screen.getByLabelText("Plan name").closest("form")!);
    await waitFor(() =>
      expect(createPricingPlan).toHaveBeenCalledWith(
        "token",
        expect.objectContaining({
          billingMode: "POSTPAID_PAYG",
          creditUnitPriceCents: 125,
          currency: "INR",
          monthlyPriceCents: 0,
          includedCredits: 0,
          trialCredits: 0,
          extraCreditPriceCents: null,
        }),
      ),
    );
    expect(replace).toHaveBeenCalledWith(
      "/app/platform/pricing/created-payg/edit",
    );
  });
});
