import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { SelfxUiProvider } from "@selfx/ui";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { selfxApi } from "@/lib/api";
import type { PricingPlan } from "@/lib/pricing";
import {
  StorePlanAction,
  StorePlanPayments,
  useStorePlanSelection,
  type StorePlanWorkspace,
} from "./store-plan-selection";

vi.mock("@/lib/api", () => ({ selfxApi: vi.fn(), clearApiReadCache: vi.fn() }));
const plan = {
  id: "plan-a",
  code: "growth",
  name: "Growth",
  currency: "INR",
  monthlyPriceCents: 1000,
  includedCredits: 20,
  billingMode: "CREDIT_LIMITED",
  updatedAt: "2026-11-26T00:00:00.000Z",
} as PricingPlan;
const fixture = (): StorePlanWorkspace => ({
  summary: { availableCredits: 10, subscription: null },
  billingOwner: "SELFX",
  manageUrl: null,
  phonepeAvailable: true,
  canManage: true,
  scheduled: null,
  payments: [],
});
function Harness({
  storeId = "store-a",
  selection = plan,
}: {
  storeId?: string;
  selection?: PricingPlan;
}) {
  const controls = useStorePlanSelection("fixture", storeId);
  return (
    <SelfxUiProvider>
      <StorePlanPayments controls={controls} />
      <StorePlanAction controls={controls} plan={selection} current={false} />
    </SelfxUiProvider>
  );
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal("PointerEvent", MouseEvent);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Store plan selection controls", () => {
  it("routes Shopify billing to Shopify without starting PhonePe checkout", async () => {
    vi.mocked(selfxApi).mockResolvedValue({
      ...fixture(),
      billingOwner: "SHOPIFY",
      manageUrl:
        "https://shopify.selfx.test/app?shop=merchant.myshopify.com&panel=plans",
    });
    render(<Harness />);
    const link = await screen.findByRole("link", { name: "Choose in Shopify" });
    expect(link.getAttribute("href")).toContain("merchant.myshopify.com");
    expect(
      vi
        .mocked(selfxApi)
        .mock.calls.every(([, init]) => !init?.method || init.method === "GET"),
    ).toBe(true);
  });
  it("requires explicit terms acceptance and sends a stable, versioned purchase request", async () => {
    vi.mocked(selfxApi).mockResolvedValue(fixture());
    render(<Harness />);
    const choose = await screen.findByRole("button", { name: "Choose plan" });
    await waitFor(() =>
      expect((choose as HTMLButtonElement).disabled).toBe(false),
    );
    fireEvent.click(choose);
    const proceed = await screen.findByRole("button", {
      name: "Continue to PhonePe",
    });
    expect((proceed as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("checkbox"));
    await waitFor(() =>
      expect((proceed as HTMLButtonElement).disabled).toBe(false),
    );
    fireEvent.click(proceed);
    fireEvent.click(proceed);
    await waitFor(() =>
      expect(
        vi
          .mocked(selfxApi)
          .mock.calls.filter(([, init]) => init?.method === "POST"),
      ).toHaveLength(1),
    );
    const call = vi
      .mocked(selfxApi)
      .mock.calls.find(([, init]) => init?.method === "POST")!;
    expect(call[0]).toBe("/api/v1/admin/stores/store-a/plan-selection");
    expect(JSON.parse(call[1]!.body as string)).toMatchObject({
      planId: plan.id,
      planUpdatedAt: plan.updatedAt,
      acceptTerms: true,
      clientRequestId: expect.stringMatching(/^[0-9a-f-]{36}$/i),
    });
  });
  it("keeps trial and view-only users from creating a payment", async () => {
    vi.mocked(selfxApi).mockResolvedValue({ ...fixture(), canManage: false });
    const view = render(<Harness />);
    await screen.findByText(/administrator with payment management access/);
    expect(
      (screen.getByRole("button", { name: "Choose plan" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    view.rerender(
      <Harness
        selection={{
          ...plan,
          code: "selfx-default-starter",
          monthlyPriceCents: 0,
        }}
      />,
    );
    expect(screen.getByText(/cannot be selected again/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Choose plan" })).toBeNull();
  });
  it("ignores a late billing response from a previously selected Store", async () => {
    let finishOld!: (value: StorePlanWorkspace) => void;
    vi.mocked(selfxApi).mockImplementation(async (path) =>
      String(path).includes("store-a")
        ? new Promise((resolve) => {
            finishOld = resolve as typeof finishOld;
          })
        : ({
            ...fixture(),
            scheduled: {
              planName: "Store B plan",
              effectiveAfter: "2026-12-01T00:00:00Z",
            },
          } as never),
    );
    const view = render(<Harness />);
    view.rerender(<Harness storeId="store-b" />);
    await screen.findByText(/Store B plan/);
    finishOld({
      ...fixture(),
      scheduled: {
        planName: "Old Store plan",
        effectiveAfter: "2026-12-01T00:00:00Z",
      },
    });
    await waitFor(() =>
      expect(screen.queryByText(/Old Store plan/)).toBeNull(),
    );
  });
});
