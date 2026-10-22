import {
  cleanup,
  within,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PaymentSettings } from "./payment-settings";
vi.mock("./store-payment-verification", () => ({
  StorePaymentVerification: () => <p>Store verification workspace</p>,
}));
import {
  getStorePayments,
  listPaymentGateways,
  savePhonePeSetup,
  selectStoreGateway,
  updatePaymentGateway,
  getPhonePeEdit,
  editPhonePeSetup,
  deletePhonePeSetup,
  type Gateway,
  type StorePaymentSettings,
} from "@/lib/payments";
vi.mock("@/lib/payments", () => ({
  getStorePayments: vi.fn(),
  listPaymentGateways: vi.fn(),
  savePhonePeSetup: vi.fn(),
  selectStoreGateway: vi.fn(),
  updatePaymentGateway: vi.fn(),
  getPhonePeEdit: vi.fn(),
  editPhonePeSetup: vi.fn(),
  deletePhonePeSetup: vi.fn(),
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
  vi.stubGlobal("PointerEvent", MouseEvent);
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
  vi.mocked(getPhonePeEdit).mockResolvedValue({
    version: 2,
    environment: "PRODUCTION",
    merchantId: "fixture_mid",
    providerId: "fixture_provider",
    providerStoreId: "fixture_store",
    saltIndex: "1",
    saltKeyConfigured: true,
  });
  vi.mocked(editPhonePeSetup).mockResolvedValue({
    ...settings,
    version: 4,
    connections: [
      {
        provider: "PHONEPE",
        version: 3,
        environment: "PRODUCTION",
        status: "UNVERIFIED",
        updatedAt: "2026-10-19T00:00:00Z",
      },
    ],
  });
  vi.mocked(deletePhonePeSetup).mockResolvedValue({ ...settings, version: 4 });
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
    fireEvent.click(await screen.findByRole("button", { name: "Set up" }));
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
    fireEvent.click(screen.getByRole("button", { name: "Save gateway" }));
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
    expect(await screen.findByRole("button", { name: "Edit" })).toBeTruthy();
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
    fireEvent.click(await screen.findByRole("button", { name: "Set up" }));
    fireEvent.change(screen.getByLabelText("Merchant ID"), {
      target: { value: "fixture_mid" },
    });
    fireEvent.change(screen.getByLabelText("Salt Index"), {
      target: { value: "1" },
    });
    fireEvent.change(screen.getByLabelText("Salt Key"), {
      target: { value: "fixture-key-not-a-real-secret" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save gateway" }));
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
      await screen.findByRole("switch", {
        name: "Use PhonePe for kiosk checkout",
      }),
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
      await screen.findByText(/Gateway selected for kiosk checkout/),
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
    expect(screen.queryByRole("button", { name: "Set up" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Delete" })).toBeNull();
  });
  const configured = {
    ...settings,
    selectedProvider: "PHONEPE" as const,
    connections: [
      {
        provider: "PHONEPE" as const,
        version: 2,
        environment: "PRODUCTION" as const,
        status: "VERIFIED" as const,
        updatedAt: "2026-10-19T00:00:00Z",
      },
    ],
  };
  it("edits prefilled details in a wide modal while leaving the saved Salt Key blank", async () => {
    vi.mocked(getStorePayments).mockResolvedValue(configured);
    render(
      <PaymentSettings accessToken="fixture_token" storeId="store-a" canEdit />,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Edit" }));
    const dialog = await screen.findByRole("dialog", { name: "Edit PhonePe" });
    expect(dialog.className).toContain("sm:max-w-3xl");
    expect(
      (screen.getByLabelText("Merchant ID") as HTMLInputElement).value,
    ).toBe("fixture_mid");
    expect(
      (screen.getByLabelText("Provider ID (optional)") as HTMLInputElement)
        .value,
    ).toBe("fixture_provider");
    expect((screen.getByLabelText("Salt Key") as HTMLInputElement).value).toBe(
      "",
    );
    expect(
      (screen.getByLabelText("Salt Key") as HTMLInputElement).placeholder,
    ).toBe("••••••••");
    expect(screen.queryByRole("button", { name: /Show.*key/i })).toBeNull();
    expect(
      (screen.getByLabelText("Salt Key") as HTMLInputElement).required,
    ).toBe(false);
    fireEvent.change(screen.getByLabelText("Merchant ID"), {
      target: { value: "updated_mid" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save gateway" }));
    await waitFor(() =>
      expect(editPhonePeSetup).toHaveBeenCalledWith(
        "fixture_token",
        "store-a",
        3,
        expect.objectContaining({
          merchantId: "updated_mid",
          saltKey: "",
          environment: "PRODUCTION",
          saltIndex: "1",
        }),
      ),
    );
    expect(savePhonePeSetup).not.toHaveBeenCalled();
    expect(
      await screen.findByText("PhonePe account saved securely."),
    ).toBeTruthy();
  });
  it("reports an unchanged edit without discarding existing verification", async () => {
    vi.mocked(getStorePayments).mockResolvedValue(configured);
    vi.mocked(editPhonePeSetup).mockResolvedValue(configured);
    render(
      <PaymentSettings accessToken="fixture_token" storeId="store-a" canEdit />,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Edit" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "Save gateway" }),
    );
    expect(await screen.findByText(/No account changes/)).toBeTruthy();
    expect(screen.queryByText("Live account verified")).toBeNull();
    expect(
      screen.getByText("Live accounts verified").parentElement?.textContent,
    ).toContain("1");
  });
  it("shows provider logos and only Edit/Delete on configured gateway cards", async () => {
    vi.mocked(getStorePayments).mockResolvedValue(configured);
    render(
      <PaymentSettings accessToken="fixture_token" storeId="store-a" canEdit />,
    );
    const edit = await screen.findByRole("button", { name: "Edit" });
    const card = edit.closest('[data-slot="card"]')!;
    expect(
      within(card as HTMLElement)
        .getByRole("img", { name: "PhonePe logo" })
        .getAttribute("src"),
    ).toBe("/brand/payments/phonepe.svg");
    expect(
      within(card as HTMLElement)
        .getAllByRole("button")
        .map((button) => button.textContent),
    ).toEqual(["Edit", "Delete"]);
    expect(screen.queryByText("Live account verified")).toBeNull();
    expect(screen.queryByText("Live mode (real payments)")).toBeNull();
    expect(screen.getByText("Live mode")).toBeTruthy();
    expect(screen.getByText("Verified")).toBeTruthy();
    expect(screen.queryByText("Ready for checkout")).toBeNull();
    expect(screen.queryByText("Account verification passed")).toBeNull();
    expect(screen.queryByText("Store verification workspace")).toBeNull();
  });
  it.each([
    {
      environment: "UAT" as const,
      status: "VERIFIED" as const,
      selected: false,
      enabled: true,
      mode: "Test mode",
      state: "Off",
    },
    {
      environment: "PRODUCTION" as const,
      status: "UNVERIFIED" as const,
      selected: true,
      enabled: true,
      mode: "Live mode",
      state: "Configured",
    },
    {
      environment: "UNCONFIRMED" as const,
      status: "UNVERIFIED" as const,
      selected: true,
      enabled: true,
      mode: "Mode unconfirmed",
      state: "Configured",
    },
  ])(
    "shows $mode / $state for the actual gateway state",
    async ({ environment, status, selected, enabled, mode, state }) => {
      vi.mocked(getStorePayments).mockResolvedValue({
        ...configured,
        selectedProvider: selected ? "PHONEPE" : null,
        gateways: [{ ...gateways[0]!, enabled }, gateways[1]!],
        connections: [{ ...configured.connections[0]!, environment, status }],
      });
      render(
        <PaymentSettings
          accessToken="fixture_token"
          storeId="store-a"
          canEdit
        />,
      );
      const edit = await screen.findByRole("button", { name: "Edit" });
      expect(screen.getByText(mode)).toBeTruthy();
      expect(
        within(edit.closest('[data-slot="card"]') as HTMLElement).getByText(
          state,
          { exact: true },
        ),
      ).toBeTruthy();
      expect(screen.queryByText("Ready for checkout")).toBeNull();
      expect(screen.queryByText("Planned")).toBeNull();
    },
  );
  it("shows only supported gateways made available by Superadmin", async () => {
    vi.mocked(getStorePayments).mockResolvedValue({
      ...settings,
      // Even an obsolete response or inconsistent policy cannot expose a planned gateway.
      gateways: [gateways[0]!, { ...gateways[1]!, enabled: true }],
    });
    render(
      <PaymentSettings accessToken="fixture_token" storeId="store-a" canEdit />,
    );
    await screen.findByText("PhonePe");
    expect(screen.queryByText("Stripe")).toBeNull();
    expect(screen.queryByText("Planned")).toBeNull();
    expect(screen.queryByText("Store verification workspace")).toBeNull();
  });
  it("hides a disabled saved gateway and restores it after Superadmin re-enables it", async () => {
    vi.mocked(getStorePayments)
      .mockResolvedValueOnce({
        ...configured,
        gateways: [{ ...gateways[0]!, enabled: false }, gateways[1]!],
      })
      .mockResolvedValue(configured);
    render(
      <PaymentSettings accessToken="fixture_token" storeId="store-a" canEdit />,
    );
    await screen.findByText(/No payment gateways are currently available/);
    expect(screen.queryByText("PhonePe")).toBeNull();
    expect(screen.queryByText("Stripe")).toBeNull();
    expect(screen.queryByRole("switch")).toBeNull();
    expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
    for (const label of ["Configured", "Turned on", "Live accounts verified"])
      expect(screen.getByText(label).parentElement?.textContent).toContain("0");
    fireEvent.click(screen.getByRole("button", { name: "Refresh gateways" }));
    await screen.findByRole("button", { name: "Edit" });
    expect(
      screen
        .getByRole("switch", { name: "Use PhonePe for kiosk checkout" })
        .getAttribute("aria-checked"),
    ).toBe("true");
    expect(
      screen.queryByText(/No payment gateways are currently available/),
    ).toBeNull();
    expect(deletePhonePeSetup).not.toHaveBeenCalled();
    expect(selectStoreGateway).not.toHaveBeenCalled();
  });
  it("turns off selection without deleting saved credentials", async () => {
    vi.mocked(getStorePayments).mockResolvedValue(configured);
    vi.mocked(selectStoreGateway).mockResolvedValue({
      ...configured,
      selectedProvider: null,
      version: 4,
    });
    render(
      <PaymentSettings accessToken="fixture_token" storeId="store-a" canEdit />,
    );
    fireEvent.click(
      await screen.findByRole("switch", {
        name: "Use PhonePe for kiosk checkout",
      }),
    );
    await waitFor(() =>
      expect(selectStoreGateway).toHaveBeenCalledWith(
        "fixture_token",
        "store-a",
        3,
        null,
      ),
    );
    expect(deletePhonePeSetup).not.toHaveBeenCalled();
    expect(await screen.findByRole("button", { name: "Edit" })).toBeTruthy();
  });
  it("requires confirmation for deletion and keeps deletion errors recoverable", async () => {
    vi.mocked(getStorePayments).mockResolvedValue(configured);
    vi.mocked(deletePhonePeSetup).mockRejectedValueOnce(
      new Error("Payment settings changed. Reload before saving."),
    );
    render(
      <PaymentSettings accessToken="fixture_token" storeId="store-a" canEdit />,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Delete" }));
    expect(deletePhonePeSetup).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(deletePhonePeSetup).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    let dialog = screen.getByRole("dialog", {
      name: "Delete PhonePe configuration?",
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Delete configuration" }),
    );
    expect(await screen.findByText(/Payment settings changed/)).toBeTruthy();
    dialog = screen.getByRole("dialog");
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Delete configuration" }),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(deletePhonePeSetup).toHaveBeenLastCalledWith(
      "fixture_token",
      "store-a",
      3,
    );
    expect(await screen.findByRole("button", { name: "Set up" })).toBeTruthy();
    expect(
      screen.getByText(/Payment history and pending verification are retained/),
    ).toBeTruthy();
  });
  it("shows errors when protected edit details cannot be loaded", async () => {
    vi.mocked(getStorePayments).mockResolvedValue(configured);
    vi.mocked(getPhonePeEdit).mockRejectedValue(new Error("Permission denied"));
    render(
      <PaymentSettings accessToken="fixture_token" storeId="store-a" canEdit />,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Edit" }));
    expect(await screen.findByText("Permission denied")).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
