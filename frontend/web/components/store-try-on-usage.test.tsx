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

import { StoreTryOnUsage } from "@/components/store-try-on-usage";
import { getUsageSummary, type UsageSummary } from "@/lib/usage";

vi.mock("@/lib/usage", () => ({ getUsageSummary: vi.fn() }));

function summary(storeId = "store-a"): UsageSummary {
  const counts = {
    runsCreated: 4,
    completedRuns: 3,
    failedRuns: 1,
    tryOnsGenerated: 0,
    downloadsCompleted: 0,
  };
  return {
    scope: { mode: "STORE", storeId },
    range: {
      preset: "30d",
      from: "2026-08-18T00:00:00Z",
      to: "2026-09-17T00:00:00Z",
    },
    products: [
      {
        ...counts,
        productId: "ring-1",
        name: "Gold ring",
        category: "Rings",
        productVertical: "JEWELLERY",
        thumbnailUrl: "https://cdn.test/ring.jpg",
      },
      {
        ...counts,
        productId: "shirt-1",
        name: "Linen shirt",
        category: "Shirts",
        productVertical: "GARMENT",
      },
      {
        ...counts,
        productId: "failed-1",
        name: "Failed-only product",
        completedRuns: 0,
      },
    ],
    categories: [
      { ...counts, category: "Rings" },
      { ...counts, category: "Shirts" },
    ],
    totals: {} as UsageSummary["totals"],
    providerUsage: [],
    stores: [],
    kiosks: [],
    channels: [],
    daily: [],
  };
}

function renderOverview(
  props: Partial<Parameters<typeof StoreTryOnUsage>[0]> = {},
) {
  return render(
    <SelfxUiProvider>
      <StoreTryOnUsage accessToken="test-token" storeId="store-a" {...props} />
    </SelfxUiProvider>,
  );
}

describe("Store Try-On usage overview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getUsageSummary).mockResolvedValue(summary());
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("loads only the viewed Store and displays completed product and category counts", async () => {
    renderOverview();
    expect(await screen.findByText("Gold ring")).toBeTruthy();
    expect(getUsageSummary).toHaveBeenCalledWith("test-token", {
      storeId: "store-a",
      limit: 5,
      range: "30d",
    });
    expect(screen.getByText("Jewellery")).toBeTruthy();
    expect(screen.getByText("Garment")).toBeTruthy();
    expect(screen.queryByText("Failed-only product")).toBeNull();
    expect(screen.queryByText("Provider Health")).toBeNull();
    const productTable = screen.getAllByRole("table")[0]!;
    expect(within(productTable).getAllByText("3")).toHaveLength(2);
    expect(productTable.querySelector("img")?.getAttribute("src")).toBe(
      "https://cdn.test/ring.jpg",
    );
    fireEvent.error(productTable.querySelector("img")!);
    expect(productTable.querySelector("img")).toBeNull();
  });

  it("changes the date range without changing the Store scope", async () => {
    renderOverview();
    await screen.findByText("Gold ring");
    fireEvent.click(
      screen.getByRole("combobox", { name: "Try-On usage date range" }),
    );
    const option = await screen.findByRole("option", { name: "Last 7 days" });
    fireEvent.pointerDown(option, { pointerType: "mouse" });
    fireEvent.click(option);
    await waitFor(() =>
      expect(getUsageSummary).toHaveBeenLastCalledWith("test-token", {
        storeId: "store-a",
        limit: 5,
        range: "7d",
      }),
    );
  });

  it("limits both lists to five entries", async () => {
    const data = summary();
    vi.mocked(getUsageSummary).mockResolvedValue({
      ...data,
      products: Array.from({ length: 7 }, (_, index) => ({
        ...data.products[0]!,
        productId: `product-${index}`,
        name: `Product ${index}`,
      })),
      categories: Array.from({ length: 7 }, (_, index) => ({
        ...data.categories[0]!,
        category: `Category ${index}`,
      })),
    });
    renderOverview();
    expect(await screen.findByText("Product 4")).toBeTruthy();
    expect(screen.getByText("Category 4")).toBeTruthy();
    expect(screen.queryByText("Product 5")).toBeNull();
    expect(screen.queryByText("Category 5")).toBeNull();
  });

  it("uses valid current billing dates for the billing-cycle filter", async () => {
    const now = Date.now();
    const start = new Date(now - 86_400_000).toISOString();
    const end = new Date(now + 86_400_000).toISOString();
    renderOverview({ currentPeriodStart: start, currentPeriodEnd: end });
    await screen.findByText("Gold ring");
    fireEvent.click(
      screen.getByRole("combobox", { name: "Try-On usage date range" }),
    );
    const option = await screen.findByRole("option", {
      name: "Current billing cycle",
    });
    fireEvent.pointerDown(option, { pointerType: "mouse" });
    fireEvent.click(option);
    await waitFor(() =>
      expect(getUsageSummary).toHaveBeenLastCalledWith("test-token", {
        storeId: "store-a",
        limit: 5,
        range: "custom",
        from: start,
        to: expect.any(String),
      }),
    );
    const query = vi.mocked(getUsageSummary).mock.calls.at(-1)![1]!;
    expect(Date.parse(query.to!)).toBeLessThan(Date.parse(end));
  });

  it("shows empty states and does not offer an unavailable billing cycle", async () => {
    vi.mocked(getUsageSummary).mockResolvedValue({
      ...summary(),
      products: [],
      categories: [],
    });
    renderOverview({
      currentPeriodStart: "invalid",
      currentPeriodEnd: "invalid",
    });
    expect(
      await screen.findByText("No completed product Try-Ons in this period."),
    ).toBeTruthy();
    expect(
      screen.getByText("No completed category Try-Ons in this period."),
    ).toBeTruthy();
    fireEvent.click(
      screen.getByRole("combobox", { name: "Try-On usage date range" }),
    );
    expect(
      screen.queryByRole("option", { name: "Current billing cycle" }),
    ).toBeNull();
  });

  it("shows a retryable failure without rendering stale data", async () => {
    vi.mocked(getUsageSummary).mockRejectedValueOnce(
      new Error("internal error"),
    );
    renderOverview();
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.queryByText("internal error")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("Gold ring")).toBeTruthy();
  });

  it("rejects a summary for a different Store", async () => {
    vi.mocked(getUsageSummary).mockResolvedValue(summary("store-b"));
    renderOverview();
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.queryByText("Gold ring")).toBeNull();
  });

  it("ignores an old Store response after switching Store", async () => {
    let resolveOld!: (value: UsageSummary) => void;
    vi.mocked(getUsageSummary).mockReturnValueOnce(
      new Promise((resolve) => {
        resolveOld = resolve;
      }),
    );
    const { rerender } = renderOverview();
    vi.mocked(getUsageSummary).mockResolvedValue({
      ...summary("store-b"),
      products: [],
      categories: [],
    });
    rerender(
      <SelfxUiProvider>
        <StoreTryOnUsage accessToken="test-token" storeId="store-b" />
      </SelfxUiProvider>,
    );
    await screen.findByText("No completed product Try-Ons in this period.");
    resolveOld(summary());
    await waitFor(() => expect(screen.queryByText("Gold ring")).toBeNull());
  });
});
