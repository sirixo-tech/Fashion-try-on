import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import MobileDashboardPage from "@/app/app/dashboard/mobile/page";
import type { MobileDashboardSummary } from "@/lib/mobile-dashboard";
const mocks = vi.hoisted(() => ({ summary: vi.fn() }));
vi.mock("@/lib/session", () => ({
  useSession: () => ({ status: "authenticated", accessToken: "fixture" }),
}));
vi.mock("@/lib/use-mobile-dashboard", () => ({
  useMobileDashboard: mocks.summary,
}));
vi.mock("@/lib/regional-settings", () => ({
  RegionalDateTime: ({ value }: { value: string }) => <span>{value}</span>,
}));
vi.mock("@selfx/ui", async (original) => ({
  ...(await original<typeof import("@selfx/ui")>()),
  MobileDashboardCharts: ({ loading }: { loading: boolean }) => (
    <p>{loading ? "Loading charts" : "Account charts"}</p>
  ),
}));
const summary: MobileDashboardSummary = {
  available: true,
  range: {
    preset: "30d",
    from: "2026-09-25T12:00:00.000Z",
    to: "2026-10-25T12:00:00.000Z",
  },
  updatedAt: "2026-10-25T12:00:00.000Z",
  totals: {
    total: 0,
    newAccounts: 0,
    recentlyActive: 0,
    verified: 0,
    pending: 0,
    suspended: 0,
  },
  daily: [],
  methods: [],
  unavailable: ["tryOns", "personalBilling", "storeQr"],
};
beforeEach(() => {
  mocks.summary
    .mockReset()
    .mockReturnValue({ data: summary, loading: false, error: null });
});
afterEach(cleanup);
it("shows real account metrics separately from future Try-On, revenue and QR services", () => {
  render(<MobileDashboardPage />);
  expect(
    screen.getByRole("heading", { level: 1, name: "Mobile Dashboard" }),
  ).toBeTruthy();
  const registered = screen.getByRole("heading", {
    name: "Registered customers",
  }).parentElement!.parentElement!;
  expect(within(registered).getAllByText("0").length).toBeGreaterThan(0);
  expect(registered.className).toContain("capitalio-panel");
  expect(registered.querySelector(".capitalio-icon")).toBeTruthy();
  expect(screen.getAllByText("Not connected")).toHaveLength(3);
  expect(
    screen.getByRole("button", { name: "Export" }).hasAttribute("disabled"),
  ).toBe(false);
  expect(screen.queryByRole("combobox", { name: "Store scope" })).toBeNull();
});
it("renders real mobile trial and Store-sponsored metrics without inventing personal paid revenue", () => {
  mocks.summary.mockReturnValue({
    data: {
      ...summary,
      experience: {
        attempts: 7,
        completed: 5,
        failed: 2,
        personalCompleted: 3,
        storeCompleted: 2,
        storeVisits: 4,
        trialGranted: 30,
        trialUsed: 3,
        trialReserved: 0,
      },
      experienceDaily: [
        {
          date: "2026-10-25",
          attempts: 7,
          completed: 5,
          failed: 2,
          personalCompleted: 3,
          storeCompleted: 2,
          storeVisits: 4,
        },
      ],
    },
    loading: false,
    error: null,
  });
  render(<MobileDashboardPage />);
  expect(screen.getByText("Personal looks")).toBeTruthy();
  expect(screen.getByText("Store-sponsored looks")).toBeTruthy();
  expect(screen.getByText("Try-On activity by day")).toBeTruthy();
  expect(screen.getByText("Completed looks by payer")).toBeTruthy();
  expect(screen.getByText("Lifetime trial-credit usage")).toBeTruthy();
  expect(
    screen.getByRole("img", {
      name: /7 attempts, 5 completed, 2 failed and 4 Store QR visits/,
    }),
  ).toBeTruthy();
  expect(
    screen.getByText(/Personal paid plans are not connected/),
  ).toBeTruthy();
  expect(screen.queryByText("Not connected")).toBeNull();
});
it("shows an activation state rather than zero counts or fake loading when accounts are disabled", () => {
  mocks.summary.mockReturnValue({
    data: { ...summary, available: false, totals: null },
    loading: false,
    error: null,
  });
  render(<MobileDashboardPage />);
  expect(
    screen.getByText(/Customer accounts have not been activated/),
  ).toBeTruthy();
  expect(screen.queryByText("0")).toBeNull();
  expect(screen.queryByText("Account charts")).toBeNull();
  expect(
    screen.getByRole("button", { name: "Export" }).hasAttribute("disabled"),
  ).toBe(true);
});
it("exposes retry without exporting stale data on an API error", () => {
  mocks.summary.mockReturnValue({
    data: null,
    loading: false,
    error: "Platform permission denied.",
  });
  render(<MobileDashboardPage />);
  expect(screen.getByRole("alert").textContent).toContain(
    "Platform permission denied.",
  );
  expect(
    screen.getByRole("button", { name: "Export" }).hasAttribute("disabled"),
  ).toBe(true);
  fireEvent.click(
    screen.getByRole("button", { name: "Refresh mobile dashboard" }),
  );
  expect(mocks.summary).toHaveBeenLastCalledWith("fixture", "30d", 1);
});
