import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import DashboardPage from "@/app/app/dashboard/page";
import { SelfxUiProvider } from "@selfx/ui";
import { dashboardFixture } from "@/lib/dashboard-fixture";

const mocks = vi.hoisted(() => ({
  platform: vi.fn(),
  merchant: vi.fn(),
  permissions: vi.fn(),
  stores: vi.fn(),
  kiosks: vi.fn(),
  products: vi.fn(),
  users: vi.fn(),
  usage: vi.fn(),
  push: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock("@/lib/session", () => ({
  useSession: () => ({
    status: "authenticated",
    accessToken: "fixture",
    user: { displayName: "Tester" },
  }),
}));
vi.mock("@/lib/access-control", () => ({
  getCurrentPlatformAccess: mocks.platform,
}));
vi.mock("@/lib/current-store", async (original) => ({
  ...(await original<typeof import("@/lib/current-store")>()),
  getCurrentMerchantStoreAccess: mocks.merchant,
}));
vi.mock("@/lib/stores", () => ({
  getEffectiveStorePermissions: mocks.permissions,
  listStores: mocks.stores,
  listStoreKiosks: mocks.kiosks,
  listStoreProducts: mocks.products,
  listStoreUsers: mocks.users,
}));
vi.mock("@/lib/usage", () => ({ getUsageSummary: mocks.usage }));
// JSDOM has no layout engine; chart sizing is checked in real-browser QA.
vi.mock("recharts", () => ({
  Area: () => null,
  AreaChart: () => null,
  Bar: () => null,
  BarChart: () => null,
  CartesianGrid: () => null,
  Cell: () => null,
  Pie: () => null,
  PieChart: () => null,
  ResponsiveContainer: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  Tooltip: () => null,
  XAxis: () => null,
  YAxis: () => null,
}));
vi.mock("@selfx/ui", async (original) => ({
  ...(await original<typeof import("@selfx/ui")>()),
  SelectMenu: ({
    ariaLabel,
    value,
    options,
    onChange,
  }: {
    ariaLabel: string;
    value: string;
    options: { value: string; label: string }[];
    onChange: (value: string) => void;
  }) => (
    <select
      aria-label={ariaLabel}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  ),
}));

describe("Capitalio SelfX dashboard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.platform.mockResolvedValue({ isSuperadmin: false, permissions: [] });
    mocks.merchant.mockResolvedValue({
      store: { id: "store-a", name: "Store A" },
    });
    mocks.permissions.mockResolvedValue({
      platformBypass: false,
      permissions: ["analytics.view", "users.view"],
      resourcePermissions: ["stores.view"],
      featureKeys: ["ANALYTICS"],
    });
    mocks.products.mockResolvedValue({ data: [], pagination: { total: 149 } });
    mocks.users.mockResolvedValue({ data: [], pagination: { total: 21 } });
    mocks.kiosks.mockResolvedValue([]);
    mocks.usage.mockImplementation(async (_token, query) =>
      dashboardFixture(
        query.range === "custom" ? 12 : query.range === "7d" ? 7 : 18,
      ),
    );
  });
  afterEach(cleanup);
  function page() {
    return render(
      <SelfxUiProvider>
        <DashboardPage />
      </SelfxUiProvider>,
    );
  }
  it("preserves all template sections and connects date filters and full analysis", async () => {
    page();
    await screen.findAllByText("Linen shirt");
    for (const name of [
      "Total Try-Ons",
      "Downloads",
      "Generation attempts",
      "Success rate",
      "Try-On performance",
      "Generation mix",
      "Product performance",
      "Operational insights",
    ])
      expect(screen.getByRole("heading", { name })).toBeTruthy();
    expect(screen.getByText("149")).toBeTruthy();
    expect(
      screen.queryByText(/Net worth|Portfolio return|Capitalio|Vansh/),
    ).toBeNull();
    fireEvent.change(screen.getByRole("combobox", { name: "Date range" }), {
      target: { value: "7d" },
    });
    await waitFor(() =>
      expect(mocks.usage).toHaveBeenCalledWith(
        "fixture",
        expect.objectContaining({ range: "7d", storeId: "store-a" }),
      ),
    );
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Export" }).hasAttribute("disabled"),
      ).toBe(false),
    );
    fireEvent.click(
      screen.getAllByRole("button", { name: "Full analysis" })[0]!,
    );
    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByRole("columnheader", { name: "Generated" }),
    ).toBeTruthy();
    expect(within(dialog).getByText("2026-10-01")).toBeTruthy();
  });
  it("keeps the design visible with restricted metrics and disables export", async () => {
    mocks.permissions.mockResolvedValue({
      platformBypass: false,
      permissions: [],
      resourcePermissions: [],
      featureKeys: [],
    });
    page();
    await screen.findAllByText(
      "Usage is not available with your current permissions or plan.",
    );
    expect(screen.getByRole("heading", { name: "Total Try-Ons" })).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Export" }).hasAttribute("disabled"),
    ).toBe(true);
    expect(mocks.usage).not.toHaveBeenCalled();
    expect(screen.queryByText("Linen shirt")).toBeNull();
  });
  it("does not leave old results visible when a refresh fails", async () => {
    page();
    await screen.findAllByText("Linen shirt");
    mocks.usage.mockRejectedValue(new Error("Usage temporarily unavailable"));
    fireEvent.click(screen.getByRole("button", { name: "Refresh dashboard" }));
    await screen.findByRole("alert");
    expect(screen.queryByText("Linen shirt")).toBeNull();
    expect(
      screen.getByRole("button", { name: "Export" }).hasAttribute("disabled"),
    ).toBe(true);
  });
});
