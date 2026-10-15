import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PaymentSettings } from "./payment-settings";
import {
  getStorePayments,
  listPaymentGateways,
  savePhonePeSetup,
  selectStoreGateway,
  updatePaymentGateway,
  type Gateway,
  type StorePaymentSettings,
} from "@/lib/payments";
vi.mock("@/lib/payments", () => ({
  getStorePayments: vi.fn(),
  listPaymentGateways: vi.fn(),
  savePhonePeSetup: vi.fn(),
  selectStoreGateway: vi.fn(),
  updatePaymentGateway: vi.fn(),
}));
const gateways: Gateway[] = [
  {
    provider: "PHONEPE",
    name: "PhonePe",
    setupAvailable: true,
    enabled: true,
    version: 2,
    paymentAvailable: false,
  },
  {
    provider: "STRIPE",
    name: "Stripe",
    setupAvailable: false,
    enabled: false,
    version: 0,
    paymentAvailable: false,
  },
];
const settings: StorePaymentSettings = {
  version: 3,
  selectedProvider: null,
  paymentAvailable: false,
  gateways,
  connections: [],
};
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(listPaymentGateways).mockResolvedValue({ data: gateways });
  vi.mocked(updatePaymentGateway).mockResolvedValue({
    data: [{ ...gateways[0]!, enabled: false, version: 3 }, gateways[1]!],
  });
  vi.mocked(getStorePayments).mockResolvedValue(settings);
  vi.mocked(savePhonePeSetup).mockResolvedValue({
    ...settings,
    version: 4,
    connections: [
      {
        provider: "PHONEPE",
        environment: "UNCONFIRMED",
        status: "UNVERIFIED",
        updatedAt: "2026-10-15T00:00:00Z",
      },
    ],
  });
  vi.mocked(selectStoreGateway).mockResolvedValue({
    ...settings,
    version: 4,
    selectedProvider: "PHONEPE",
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
describe("payment settings", () => {
  it("saves complete PhonePe configuration with unconfirmed environment and clears the secret", async () => {
    render(
      <PaymentSettings accessToken="fixture_token" storeId="store-a" canEdit />,
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Configure PhonePe" }),
    );
    expect((screen.getByLabelText("Salt Key") as HTMLInputElement).type).toBe(
      "password",
    );
    fireEvent.change(screen.getByLabelText("Merchant ID"), {
      target: { value: "fixture_mid" },
    });
    fireEvent.change(screen.getByLabelText("Salt Index"), {
      target: { value: "1" },
    });
    fireEvent.change(screen.getByLabelText("Salt Key"), {
      target: { value: "fixture-key-not-a-real-secret" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save configuration" }));
    await waitFor(() =>
      expect(savePhonePeSetup).toHaveBeenCalledWith(
        "fixture_token",
        "store-a",
        3,
        {
          environment: "UNCONFIRMED",
          merchantId: "fixture_mid",
          saltIndex: "1",
          saltKey: "fixture-key-not-a-real-secret",
        },
      ),
    );
    expect(await screen.findByText(/Environment unconfirmed/)).toBeTruthy();
    expect(screen.queryByLabelText("Salt Key")).toBeNull();
    expect(document.body.textContent).not.toContain(
      "fixture-key-not-a-real-secret",
    );
  });
  it("clears the Salt Key after a failed save and keeps a recoverable error", async () => {
    vi.mocked(savePhonePeSetup).mockRejectedValue(
      new Error("Payment settings changed. Reload before saving."),
    );
    render(
      <PaymentSettings accessToken="fixture_token" storeId="store-a" canEdit />,
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Configure PhonePe" }),
    );
    fireEvent.change(screen.getByLabelText("Merchant ID"), {
      target: { value: "fixture_mid" },
    });
    fireEvent.change(screen.getByLabelText("Salt Index"), {
      target: { value: "1" },
    });
    fireEvent.change(screen.getByLabelText("Salt Key"), {
      target: { value: "fixture-key-not-a-real-secret" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save configuration" }));
    expect(await screen.findByText(/Payment settings changed/)).toBeTruthy();
    expect((screen.getByLabelText("Salt Key") as HTMLInputElement).value).toBe(
      "",
    );
  });
  it("uses the Store revision when selecting its configured gateway", async () => {
    vi.mocked(getStorePayments).mockResolvedValue({
      ...settings,
      connections: [
        {
          provider: "PHONEPE",
          environment: "UAT",
          status: "UNVERIFIED",
          updatedAt: "2026-10-15T00:00:00Z",
        },
      ],
    });
    render(
      <PaymentSettings accessToken="fixture_token" storeId="store-a" canEdit />,
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Select gateway" }),
    );
    await waitFor(() =>
      expect(selectStoreGateway).toHaveBeenCalledWith(
        "fixture_token",
        "store-a",
        3,
        "PHONEPE",
      ),
    );
    expect(
      await screen.findByText(/Account verification is still required/),
    ).toBeTruthy();
  });
  it("does not expose configuration actions to view-only staff", async () => {
    render(
      <PaymentSettings
        accessToken="fixture_token"
        storeId="store-a"
        canEdit={false}
      />,
    );
    await screen.findByText("PhonePe");
    expect(
      screen.queryByRole("button", { name: "Configure PhonePe" }),
    ).toBeNull();
    expect(screen.queryByRole("button", { name: "Select gateway" })).toBeNull();
  });
});
