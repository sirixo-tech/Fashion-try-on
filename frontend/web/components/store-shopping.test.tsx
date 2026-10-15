import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StoreShopping } from "./store-shopping";
import { SafeApiError } from "@/lib/api";
import {
  cancelShoppingOrder,
  checkOrderPayment,
  recoverOrderStock,
  getShoppingOrder,
  getStoreTax,
  listShoppingOrders,
  updateStoreTax,
  type ShoppingOrder,
} from "@/lib/shopping";
vi.mock("@/lib/shopping", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/shopping")>()),
  cancelShoppingOrder: vi.fn(),
  checkOrderPayment: vi.fn(),
  recoverOrderStock: vi.fn(),
  getShoppingOrder: vi.fn(),
  getStoreTax: vi.fn(),
  listShoppingOrders: vi.fn(),
  updateStoreTax: vi.fn(),
}));
const order: ShoppingOrder = {
  id: "order-a",
  reference: "SX-TEST",
  kioskDeviceId: "kiosk-a",
  status: "AWAITING_PAYMENT",
  currency: "INR",
  taxMode: "EXCLUSIVE",
  subtotalCents: 20000,
  taxCents: 1000,
  totalCents: 21000,
  createdAt: new Date().toISOString(),
  serverTime: new Date().toISOString(),
  expiresAt: new Date(Date.now() + 300000).toISOString(),
  cancelledAt: null,
  paymentAvailable: false,
  items: [
    {
      id: "item-a",
      productName: "Original shirt",
      size: "M",
      color: "Black",
      quantity: 2,
      unitPriceCents: 10000,
      taxRateBasisPoints: 500,
      subtotalCents: 20000,
      taxCents: 1000,
      totalCents: 21000,
    },
  ],
};
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getStoreTax).mockResolvedValue({
    mode: "EXCLUSIVE",
    rateBasisPoints: 1800,
    version: 2,
  });
  vi.mocked(updateStoreTax).mockResolvedValue({
    mode: "EXCLUSIVE",
    rateBasisPoints: 500,
    version: 3,
  });
  vi.mocked(listShoppingOrders).mockResolvedValue({
    data: [order],
    pagination: {
      page: 1,
      pageSize: 25,
      total: 1,
      totalPages: 1,
      hasMore: false,
    },
  });
  vi.mocked(getShoppingOrder).mockResolvedValue(order);
  vi.mocked(cancelShoppingOrder).mockResolvedValue({
    ...order,
    status: "CANCELLED",
  });
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation((query) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
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
});
const open = (canEdit = true) =>
  render(
    <StoreShopping
      accessToken="identity"
      storeId="store-a"
      canEdit={canEdit}
    />,
  );
describe("Store shopping", () => {
  it("loads Store orders and saves the default rate as exact basis points", async () => {
    open();
    await screen.findByText("SX-TEST");
    await waitFor(() =>
      expect(
        (screen.getByLabelText("Default tax rate (%)") as HTMLInputElement)
          .value,
      ).toBe("18.00"),
    );
    fireEvent.change(screen.getByLabelText("Default tax rate (%)"), {
      target: { value: "5.25" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save tax settings" }));
    await waitFor(() =>
      expect(updateStoreTax).toHaveBeenCalledWith(
        "identity",
        "store-a",
        expect.objectContaining({
          mode: "EXCLUSIVE",
          expectedVersion: 2,
          rateBasisPoints: 525,
        }),
      ),
    );
    expect(await screen.findByText("Tax settings saved.")).toBeTruthy();
  });
  it("switches tax off and sends zero rather than a stale hidden rate", async () => {
    open();
    await screen.findByRole("combobox", { name: "Tax mode" });
    fireEvent.click(screen.getByRole("combobox", { name: "Tax mode" }));
    const option = await screen.findByRole("option", { name: "No tax" });
    fireEvent.pointerDown(option, { pointerType: "mouse" });
    fireEvent.click(option);
    fireEvent.click(screen.getByRole("button", { name: "Save tax settings" }));
    await waitFor(() =>
      expect(updateStoreTax).toHaveBeenCalledWith(
        "identity",
        "store-a",
        expect.objectContaining({ mode: "OFF", rateBasisPoints: 0 }),
      ),
    );
  });
  it("blocks stale tax edits until reload", async () => {
    vi.mocked(updateStoreTax).mockRejectedValue(
      new SafeApiError("SHOPPING_TAX_VERSION_CONFLICT", "Reload tax settings."),
    );
    open();
    await screen.findByRole("button", { name: "Save tax settings" });
    fireEvent.click(screen.getByRole("button", { name: "Save tax settings" }));
    await screen.findByText("Reload tax settings.");
    expect(
      (
        screen.getByRole("button", {
          name: "Save tax settings",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    fireEvent.click(
      screen.getByRole("button", { name: "Reload tax settings" }),
    );
    await waitFor(() => expect(getStoreTax).toHaveBeenCalledTimes(2));
  });
  it("shows immutable order details and requires a reason to cancel", async () => {
    open();
    await screen.findByText("SX-TEST");
    fireEvent.click(screen.getByRole("button", { name: "View order" }));
    await screen.findByText("Original shirt");
    expect(
      (
        screen.getByRole("button", {
          name: "Cancel unpaid order",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    fireEvent.change(screen.getByLabelText("Cancellation reason"), {
      target: { value: "Customer requested" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Cancel unpaid order" }),
    );
    await waitFor(() =>
      expect(cancelShoppingOrder).toHaveBeenCalledWith(
        "identity",
        "store-a",
        "order-a",
        "Customer requested",
      ),
    );
    await screen.findByText("Status: Cancelled");
    expect(
      screen.queryByRole("button", { name: "Cancel unpaid order" }),
    ).toBeNull();
  });
  it("read-only staff can view but cannot configure tax or cancel", async () => {
    open(false);
    await screen.findByText("SX-TEST");
    expect(
      screen.queryByRole("button", { name: "Save tax settings" }),
    ).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "View order" }));
    await screen.findByText("Original shirt");
    expect(
      screen.queryByRole("button", { name: "Cancel unpaid order" }),
    ).toBeNull();
  });
  it("filters by order reference and renders the empty state", async () => {
    open();
    await screen.findByText("SX-TEST");
    vi.mocked(listShoppingOrders).mockResolvedValue({
      data: [],
      pagination: {
        page: 1,
        pageSize: 25,
        total: 0,
        totalPages: 1,
        hasMore: false,
      },
    });
    fireEvent.change(screen.getByLabelText("Search order reference"), {
      target: { value: "OTHER" },
    });
    await screen.findByText("No orders match this view.");
    expect(listShoppingOrders).toHaveBeenLastCalledWith("identity", "store-a", {
      page: 1,
      status: "ALL",
      search: "OTHER",
    });
  });
  it("shows pending confirmation after hold expiry and checks the provider without unpaid cancellation", async () => {
    const pending: ShoppingOrder = {
      ...order,
      status: "PAYMENT_PENDING",
      expiresAt: new Date(Date.now() - 10000).toISOString(),
      paymentAttempts: [
        {
          id: "attempt-a",
          provider: "PHONEPE",
          environment: "UAT",
          status: "UNKNOWN",
          amountMinor: 21000,
          currency: "INR",
          providerReference: null,
          failureCode: "PAYMENT_REQUEST_UNCERTAIN",
          createdAt: order.createdAt,
          expiresAt: order.expiresAt,
          paidAt: null,
        },
      ],
    };
    vi.mocked(getShoppingOrder).mockResolvedValue(pending);
    vi.mocked(checkOrderPayment).mockResolvedValue({
      ...pending,
      status: "PAID",
      paidAt: new Date().toISOString(),
      paymentAttempts: [
        {
          ...pending.paymentAttempts![0]!,
          status: "SUCCEEDED",
          failureCode: null,
        },
      ],
    });
    open();
    await screen.findByText("SX-TEST");
    fireEvent.click(screen.getByRole("button", { name: "View order" }));
    expect(
      await screen.findByText(/Payment confirmation is still pending/),
    ).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Cancel unpaid order" }),
    ).toBeNull();
    expect(screen.getByText(/Test payment/)).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: "Check payment status" }),
    );
    await waitFor(() =>
      expect(checkOrderPayment).toHaveBeenCalledWith(
        "identity",
        "store-a",
        "order-a",
        "attempt-a",
      ),
    );
    expect(await screen.findByText("Status: Paid")).toBeTruthy();
  });
  it("shows a paid stock issue and lets authorized staff retry allocation", async () => {
    const review: ShoppingOrder = {
      ...order,
      status: "PAID_REVIEW",
      paidAt: new Date().toISOString(),
      stockAllocatedAt: null,
      paymentReviewReason: "STOCK_UNAVAILABLE",
    };
    vi.mocked(getShoppingOrder).mockResolvedValue(review);
    vi.mocked(recoverOrderStock).mockResolvedValue({
      ...review,
      status: "PAID",
      stockAllocatedAt: new Date().toISOString(),
      paymentReviewReason: null,
    });
    open();
    await screen.findByText("SX-TEST");
    fireEvent.click(screen.getByRole("button", { name: "View order" }));
    expect(await screen.findByText(/Stock needs staff attention/)).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: "Retry stock allocation" }),
    );
    await waitFor(() =>
      expect(recoverOrderStock).toHaveBeenCalledWith(
        "identity",
        "store-a",
        "order-a",
      ),
    );
    expect(await screen.findByText("Status: Paid")).toBeTruthy();
  });
  it("keeps paid recovery read-only for view-only staff", async () => {
    vi.mocked(getShoppingOrder).mockResolvedValue({
      ...order,
      status: "PAID_REVIEW",
      paidAt: new Date().toISOString(),
      paymentReviewReason: "STOCK_UNAVAILABLE",
      stockAllocatedAt: null,
    });
    open(false);
    await screen.findByText("SX-TEST");
    fireEvent.click(screen.getByRole("button", { name: "View order" }));
    expect(await screen.findByText(/Stock needs staff attention/)).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Retry stock allocation" }),
    ).toBeNull();
  });
});
