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
import BillingPage from "./page";
import { getCurrentPlatformAccess } from "@/lib/access-control";
import { getCurrentMerchantStore } from "@/lib/current-store";
import { getStore, getStoreCreditDiagnostics, listStores } from "@/lib/stores";
import { listAvailablePricingPlans, listPlanFeatures } from "@/lib/pricing";
import { getUsageSummary, type UsageSummary } from "@/lib/usage";

vi.mock("@/lib/session", () => ({
  useSession: () => ({
    status: "authenticated",
    accessToken: "fixture",
    user: { id: "user-1" },
  }),
}));
vi.mock("@/lib/access-control", () => ({ getCurrentPlatformAccess: vi.fn() }));
vi.mock("@/lib/current-store", () => ({ getCurrentMerchantStore: vi.fn() }));
vi.mock("@/lib/stores", () => ({
  getStore: vi.fn(),
  getStoreCreditDiagnostics: vi.fn(),
  listStores: vi.fn(),
}));
vi.mock("@/lib/pricing", () => ({
  listAvailablePricingPlans: vi.fn(),
  listPlanFeatures: vi.fn(),
}));
vi.mock("@/lib/usage", () => ({ getUsageSummary: vi.fn() }));

function summary(platform = false): UsageSummary {
  const counts = {
    sessionsStarted: 13,
    runsCreated: 4,
    completedRuns: 4,
    failedRuns: 0,
    tryOnsGenerated: 4,
    downloadsCompleted: 0,
  };
  return {
    range: {
      preset: "30d",
      from: "2026-10-01T00:00:00Z",
      to: "2026-10-21T00:00:00Z",
    },
    scope: platform
      ? { mode: "PLATFORM" }
      : { mode: "STORE", storeId: "store-a", storeName: "Avinash stores" },
    totals: {
      ...counts,
      sessionsCompleted: 8,
      sessionsIdleExpired: 0,
      queuedRuns: 0,
      processingRuns: 0,
      downloadRate: 0,
      successRate: 100,
    },
    stores: [
      { ...counts, storeId: "store-a", storeName: "Avinash stores" },
      ...(platform
        ? [{ ...counts, storeId: "store-b", storeName: "Other Store" }]
        : []),
    ],
    kiosks: [
      {
        ...counts,
        kioskDeviceId: "kiosk-a",
        displayName: "Store A Kiosk",
        storeId: "store-a",
        storeName: "Avinash stores",
      },
      ...(platform
        ? [
            {
              ...counts,
              kioskDeviceId: "kiosk-b",
              displayName: "Other Store Kiosk",
              storeId: "store-b",
              storeName: "Other Store",
            },
          ]
        : []),
    ],
    products: [],
    categories: [],
    channels: [],
    daily: [],
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getCurrentPlatformAccess).mockResolvedValue({
    isSuperadmin: false,
    permissions: [],
  });
  vi.mocked(getCurrentMerchantStore).mockResolvedValue({
    id: "store-a",
    name: "Avinash stores",
    status: "ACTIVE",
  });
  vi.mocked(getStore).mockResolvedValue(null as never);
  vi.mocked(getStoreCreditDiagnostics).mockResolvedValue(null as never);
  vi.mocked(listStores).mockResolvedValue({
    data: [],
    pagination: { page: 1, pageSize: 100, total: 0, totalPages: 0 },
  } as never);
  vi.mocked(listAvailablePricingPlans).mockResolvedValue([]);
  vi.mocked(listPlanFeatures).mockResolvedValue([]);
  vi.mocked(getUsageSummary).mockImplementation(async (_token, query) =>
    summary(!query?.storeId),
  );
});
afterEach(cleanup);
function openPage() {
  return render(
    <SelfxUiProvider>
      <BillingPage />
    </SelfxUiProvider>,
  );
}

describe("Billing usage scope", () => {
  it("shows only the Store's kiosk table without Platform or AI provider comparisons", async () => {
    openPage();
    await screen.findByText("Store A Kiosk");
    expect(screen.getByText("Your Kiosks")).toBeTruthy();
    expect(screen.queryByText("Top Stores")).toBeNull();
    expect(screen.queryByText("Provider Usage")).toBeNull();
    expect(
      screen.queryByRole("columnheader", { name: /provider|model|store/i }),
    ).toBeNull();
    expect(screen.queryByText(/Other Store/)).toBeNull();
    expect(screen.queryByRole("combobox", { name: "Client" })).toBeNull();
    const table = screen.getByText("Store A Kiosk").closest("table")!;
    expect(
      within(table)
        .getAllByRole("columnheader")
        .map((header) => header.textContent),
    ).toEqual(["Kiosk", "Looks", "Downloads"]);
    expect(listStores).not.toHaveBeenCalled();
    expect(getUsageSummary).toHaveBeenCalledWith("fixture", {
      range: "30d",
      storeId: "store-a",
      limit: 10,
    });
    for (const [, query] of vi.mocked(getUsageSummary).mock.calls)
      expect(query?.storeId).toBe("store-a");
    for (const [, id] of vi.mocked(getStore).mock.calls)
      expect(id).toBe("store-a");
    for (const [, id] of vi.mocked(getStoreCreditDiagnostics).mock.calls)
      expect(id).toBe("store-a");
  });

  it("does not request global usage while the current Store is unresolved or unavailable", async () => {
    vi.mocked(getCurrentMerchantStore).mockResolvedValue(null);
    openPage();
    await waitFor(() => expect(getCurrentMerchantStore).toHaveBeenCalled());
    expect(getUsageSummary).not.toHaveBeenCalled();
    expect(getStore).not.toHaveBeenCalled();
    expect(listStores).not.toHaveBeenCalled();
    expect(screen.queryByText("Top Stores")).toBeNull();
    expect(screen.queryByText("Provider Usage")).toBeNull();
  });

  it("retains Store comparisons and kiosk ownership columns for authorized Platform usage", async () => {
    vi.mocked(getCurrentPlatformAccess).mockResolvedValue({
      isSuperadmin: true,
      permissions: [],
    });
    openPage();
    await screen.findByText("Other Store Kiosk");
    expect(screen.getByText("Top Stores")).toBeTruthy();
    expect(screen.getByText("Top Kiosks")).toBeTruthy();
    expect(screen.queryByText("Provider Usage")).toBeNull();
    const table = screen.getByText("Other Store Kiosk").closest("table")!;
    expect(
      within(table)
        .getAllByRole("columnheader")
        .map((header) => header.textContent),
    ).toEqual(["Kiosk", "Store", "Looks", "Downloads"]);
    expect(getCurrentMerchantStore).not.toHaveBeenCalled();
  });

  it("removes comparisons when Platform users select a single Store", async () => {
    vi.mocked(getCurrentPlatformAccess).mockResolvedValue({
      isSuperadmin: true,
      permissions: [],
    });
    vi.mocked(listStores).mockResolvedValue({
      data: [
        {
          id: "store-a",
          name: "Avinash stores",
          slug: "avinash",
          status: "ACTIVE",
          subscription: null,
        },
      ],
    } as never);
    openPage();
    await screen.findByText("Other Store Kiosk");
    const selector = screen.getByRole("combobox", { name: "Client" });
    await waitFor(() => expect(selector.hasAttribute("disabled")).toBe(false));
    fireEvent.click(selector);
    const option = await screen.findByRole("option", {
      name: "Avinash stores",
    });
    fireEvent.pointerDown(option, { pointerType: "mouse" });
    fireEvent.pointerUp(option, { pointerType: "mouse" });
    fireEvent.click(option);
    await waitFor(() =>
      expect(screen.queryByText("Other Store Kiosk")).toBeNull(),
    );
    expect(screen.queryByText("Top Stores")).toBeNull();
    const table = screen.getByText("Store A Kiosk").closest("table")!;
    expect(
      within(table)
        .getAllByRole("columnheader")
        .map((header) => header.textContent),
    ).toEqual(["Kiosk", "Looks", "Downloads"]);
  });
});
