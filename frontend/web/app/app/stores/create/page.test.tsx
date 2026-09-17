import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { SelfxUiProvider } from "@selfx/ui";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import CreateStorePage from "./page";
import { getCurrentPlatformAccess } from "@/lib/access-control";
import { SafeApiError } from "@/lib/api";
import { listPricingPlans, type PricingPlan } from "@/lib/pricing";
import { onboardStore } from "@/lib/stores";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/lib/session", () => ({
  useSession: () => ({ status: "authenticated", accessToken: "token" }),
}));
vi.mock("@/lib/access-control", () => ({ getCurrentPlatformAccess: vi.fn() }));
vi.mock("@/lib/pricing", () => ({ listPricingPlans: vi.fn() }));
vi.mock("@/lib/stores", () => ({ onboardStore: vi.fn() }));

function plan(overrides: Partial<PricingPlan> = {}): PricingPlan {
  return {
    id: "plan-1",
    name: "Starter",
    code: "starter",
    status: "ACTIVE",
    channels: ["SHOPIFY"],
    currency: "USD",
    monthlyPriceCents: 0,
    includedCredits: 0,
    trialCredits: 10,
    storeLocationLimit: 0,
    extraCreditPriceCents: null,
    kioskMonthlyRentCents: null,
    kioskDeviceLimit: null,
    metadata: null,
    featureKeys: [],
    assignedStoreCount: 0,
    createdAt: "2026-09-01",
    updatedAt: "2026-09-01",
    ...overrides,
  };
}

function mount() {
  return render(
    <SelfxUiProvider>
      <CreateStorePage />
    </SelfxUiProvider>,
  );
}
async function fill() {
  await screen.findByLabelText("Store name");
  for (const [label, value] of [
    ["Store name", "Test Store"],
    ["Owner full name", "Jane Owner"],
    ["Login email", "jane@example.com"],
    ["Password", "OwnerPassword123!"],
    ["Confirm password", "OwnerPassword123!"],
  ])
    fireEvent.change(screen.getByLabelText(label!), { target: { value } });
}
function submit() {
  fireEvent.submit(
    screen.getByRole("button", { name: "Create Store" }).closest("form")!,
  );
}

describe("Create Store page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCurrentPlatformAccess).mockResolvedValue({
      isSuperadmin: false,
      permissions: ["STORES_CREATE", "PRICING_MANAGE"],
    });
    vi.mocked(listPricingPlans).mockResolvedValue([
      plan(),
      plan({
        id: "plan-2",
        name: "Growth",
        monthlyPriceCents: 4900,
        includedCredits: 100,
        storeLocationLimit: 3,
      }),
      plan({ id: "plan-inactive", name: "Disabled", status: "INACTIVE" }),
    ]);
    vi.mocked(onboardStore).mockResolvedValue({ id: "new-store" } as never);
  });
  afterEach(cleanup);

  it("previews entered details and the selected active plan without credentials", async () => {
    mount();
    const summary = await screen.findByRole("complementary", {
      name: "Onboarding summary",
    });
    expect(within(summary).getAllByText("Not set")).toHaveLength(3);
    await fill();
    expect(screen.queryByText("Disabled")).toBeNull();
    expect(
      screen
        .getByRole("tab", { name: "Starter" })
        .getAttribute("aria-selected"),
    ).toBe("true");
    fireEvent.click(screen.getByRole("tab", { name: "Growth" }));
    expect(
      screen.getByRole("tab", { name: "Growth" }).getAttribute("aria-selected"),
    ).toBe("true");
    expect(screen.getByRole("tabpanel").textContent).toContain("49.00");
    expect(within(summary).getByText("Test Store")).toBeTruthy();
    expect(within(summary).getByText("Growth")).toBeTruthy();
    expect(within(summary).getByText(/49.00.*month/)).toBeTruthy();
    expect(within(summary).getByText("Jane Owner")).toBeTruthy();
    expect(within(summary).getByText("jane@example.com")).toBeTruthy();
    expect(summary.textContent).not.toContain("OwnerPassword123!");
    expect(screen.queryByLabelText("Store slug (optional)")).toBeNull();
    expect(screen.queryByLabelText("Timezone")).toBeNull();
  });

  it("submits one onboarding operation with plan and credentials then opens View Store", async () => {
    mount();
    await fill();
    submit();
    await waitFor(() =>
      expect(push).toHaveBeenCalledWith("/app/stores/new-store"),
    );
    expect(onboardStore).toHaveBeenCalledTimes(1);
    expect(onboardStore).toHaveBeenCalledWith("token", {
      name: "Test Store",
      pricingPlanId: "plan-1",
      ownerName: "Jane Owner",
      ownerEmail: "jane@example.com",
      ownerPassword: "OwnerPassword123!",
    });
    expect((screen.getByLabelText("Password") as HTMLInputElement).value).toBe(
      "",
    );
  });

  it("rejects mismatched passwords without submitting", async () => {
    mount();
    await fill();
    fireEvent.change(screen.getByLabelText("Confirm password"), {
      target: { value: "different" },
    });
    submit();
    expect(await screen.findByText("Passwords do not match.")).toBeTruthy();
    expect(onboardStore).not.toHaveBeenCalled();
  });

  it("disables editing and blocks duplicate submits while saving", async () => {
    let resolve!: (value: never) => void;
    vi.mocked(onboardStore).mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    mount();
    await fill();
    const form = screen
      .getByRole("button", { name: "Create Store" })
      .closest("form")!;
    fireEvent.submit(form);
    fireEvent.submit(form);
    expect(onboardStore).toHaveBeenCalledTimes(1);
    expect(
      (
        screen.getByRole("button", {
          name: "Creating Store...",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(
      screen.getByLabelText("Store name").closest("fieldset")?.disabled,
    ).toBe(true);
    resolve({ id: "new-store" } as never);
    await waitFor(() => expect(push).toHaveBeenCalled());
  });

  it("preserves form values and displays an existing-email error", async () => {
    vi.mocked(onboardStore).mockRejectedValue(
      new SafeApiError(
        "STORE_OWNER_EMAIL_CONFLICT",
        "This email already has an account.",
      ),
    );
    mount();
    await fill();
    submit();
    expect(
      await screen.findByText("This email already has an account."),
    ).toBeTruthy();
    expect(
      (screen.getByLabelText("Store name") as HTMLInputElement).value,
    ).toBe("Test Store");
    expect(push).not.toHaveBeenCalled();
  });

  it.each([
    { permissions: ["STORES_CREATE"] },
    { permissions: ["PRICING_MANAGE"] },
    { permissions: [] },
  ])(
    "denies creation without both permissions: $permissions",
    async ({ permissions }) => {
      vi.mocked(getCurrentPlatformAccess).mockResolvedValue({
        isSuperadmin: false,
        permissions,
      });
      mount();
      expect(
        await screen.findByText("Store creation unavailable"),
      ).toBeTruthy();
      expect(listPricingPlans).not.toHaveBeenCalled();
      expect(onboardStore).not.toHaveBeenCalled();
    },
  );

  it("disables creation if no active plan exists", async () => {
    vi.mocked(listPricingPlans).mockResolvedValue([
      plan({ status: "INACTIVE" }),
    ]);
    mount();
    expect(await screen.findByText("No active plans available")).toBeTruthy();
    expect(
      (
        screen.getByRole("button", {
          name: "Create Store",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });

  it("cancels back to Stores without making changes", async () => {
    mount();
    await fill();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(push).toHaveBeenCalledWith("/app/stores");
    expect(onboardStore).not.toHaveBeenCalled();
  });
});
