import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PlatformPaymentGateways } from "./platform-payment-gateways";
import {
  listPaymentGateways,
  updatePaymentGateway,
  type Gateway,
} from "@/lib/payments";
import {
  checkPlatformPaymentTest,
  getPlatformPaymentTest,
  getPlatformPaymentWorkspace,
  savePlatformPhonePeTest,
  startPlatformPaymentTest,
  type PlatformPaymentTestDetail,
  type PlatformPaymentWorkspace,
} from "@/lib/platform-payment-tests";
vi.mock("@/lib/payments", () => ({
  listPaymentGateways: vi.fn(),
  updatePaymentGateway: vi.fn(),
}));
vi.mock("@/lib/platform-payment-tests", () => ({
  getPlatformPaymentWorkspace: vi.fn(),
  savePlatformPhonePeTest: vi.fn(),
  startPlatformPaymentTest: vi.fn(),
  getPlatformPaymentTest: vi.fn(),
  checkPlatformPaymentTest: vi.fn(),
}));
vi.mock("qrcode", () => ({
  toDataURL: vi.fn().mockResolvedValue("data:image/png;base64,fixture"),
}));
const gateways: Gateway[] = [
  {
    provider: "PHONEPE",
    name: "PhonePe",
    setupAvailable: true,
    enabled: false,
    version: 1,
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
const workspace: PlatformPaymentWorkspace = {
  connection: null,
  executionEnabled: false,
  callbackConfigured: false,
  testStatus: "NOT_CONFIGURED",
  tests: [],
};
const connection = {
  provider: "PHONEPE",
  environment: "UAT" as const,
  version: 2,
  dqrAccessConfirmed: true,
  updatedAt: "2026-10-16T00:00:00Z",
};
const test: PlatformPaymentTestDetail = {
  id: "fixture_test",
  provider: "PHONEPE",
  environment: "UAT",
  connectionVersion: 2,
  status: "PENDING",
  amountMinor: 100,
  currency: "INR",
  createdAt: "2026-10-16T00:00:00Z",
  expiresAt: "2026-10-16T00:05:00Z",
  confirmedAt: null,
  checkedAt: null,
  nextCheckAt: null,
  failureCode: null,
  providerReference: null,
  callbackReceived: false,
  verificationPending: false,
  testOnly: true,
  qrString: "upi://pay?pa=fixture@ybl&am=1.00&tr=fixture",
  serverTime: "2026-10-16T00:00:00Z",
};
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("PointerEvent", MouseEvent);
  vi.mocked(listPaymentGateways).mockResolvedValue({ data: gateways });
  vi.mocked(updatePaymentGateway).mockResolvedValue({
    data: [{ ...gateways[0]!, enabled: true, version: 2 }, gateways[1]!],
  });
  vi.mocked(getPlatformPaymentWorkspace).mockResolvedValue(workspace);
  vi.mocked(savePlatformPhonePeTest).mockResolvedValue({
    ...workspace,
    connection,
    testStatus: "NOT_TESTED",
  });
  vi.mocked(startPlatformPaymentTest).mockResolvedValue(test);
  vi.mocked(getPlatformPaymentTest).mockResolvedValue(test);
  vi.mocked(checkPlatformPaymentTest).mockResolvedValue({
    ...test,
    status: "SUCCEEDED",
    qrString: null,
    callbackReceived: true,
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
async function openWorkspace() {
  fireEvent.click(await screen.findByRole("button", { name: "Set up & test" }));
  return screen.findByRole("dialog");
}
describe("platform gateway controls and isolated testing", () => {
  it("toggles availability with its revision while planned gateways stay unavailable", async () => {
    render(<PlatformPaymentGateways accessToken="fixture" canEdit />);
    fireEvent.click(
      await screen.findByRole("switch", {
        name: "Make PhonePe available to Stores",
      }),
    );
    await waitFor(() =>
      expect(updatePaymentGateway).toHaveBeenCalledWith(
        "fixture",
        gateways[0],
        true,
      ),
    );
    expect(
      screen
        .getByRole("switch", { name: "Make Stripe available to Stores" })
        .getAttribute("aria-disabled"),
    ).toBe("true");
    expect(
      screen
        .getByRole("button", { name: "Coming soon" })
        .hasAttribute("disabled"),
    ).toBe(true);
  });
  it("supports platform test setup even while Store availability is off", async () => {
    render(<PlatformPaymentGateways accessToken="fixture" canEdit />);
    const dialog = await openWorkspace();
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(within(dialog).getByLabelText("Merchant ID")).toBeTruthy();
    expect(
      screen.getByRole("combobox", { name: "Account environment" }).textContent,
    ).toContain("UAT / test only");
    fireEvent.change(screen.getByLabelText("Merchant ID"), {
      target: { value: "fixture_mid" },
    });
    fireEvent.change(screen.getByLabelText("Salt Index"), {
      target: { value: "1" },
    });
    fireEvent.change(screen.getByLabelText("Salt Key"), {
      target: { value: "fixture-salt-not-real" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save configuration" }));
    await waitFor(() =>
      expect(savePlatformPhonePeTest).toHaveBeenCalledWith("fixture", 0, {
        environment: "UAT",
        merchantId: "fixture_mid",
        saltIndex: "1",
        saltKey: "fixture-salt-not-real",
      }),
    );
    expect(screen.queryByLabelText("Salt Key")).toBeNull();
    expect(screen.getByRole("dialog")).toBe(dialog);
    expect(
      screen.getByRole("button", { name: "Replace credentials" }),
    ).toBeTruthy();
    expect(document.body.textContent).not.toContain("fixture-salt-not-real");
    expect(startPlatformPaymentTest).not.toHaveBeenCalled();
  });
  it("blocks test creation until access, API execution and callback readiness are present", async () => {
    vi.mocked(getPlatformPaymentWorkspace).mockResolvedValue({
      ...workspace,
      connection,
    });
    render(<PlatformPaymentGateways accessToken="fixture" canEdit />);
    await openWorkspace();
    expect(
      screen
        .getByRole("button", { name: "Generate ₹1 test QR" })
        .hasAttribute("disabled"),
    ).toBe(true);
    expect(startPlatformPaymentTest).not.toHaveBeenCalled();
  });
  it("generates a test with a stable idempotency key and shows verified status and callback separately", async () => {
    vi.mocked(getPlatformPaymentWorkspace).mockResolvedValue({
      ...workspace,
      connection,
      executionEnabled: true,
      callbackConfigured: true,
      testStatus: "NOT_TESTED",
    });
    render(<PlatformPaymentGateways accessToken="fixture" canEdit />);
    const dialog = await openWorkspace();
    fireEvent.click(
      screen.getByRole("button", { name: "Generate ₹1 test QR" }),
    );
    expect(
      await screen.findByRole("heading", { name: "PhonePe test result" }),
    ).toBeTruthy();
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(screen.getByRole("dialog")).toBe(dialog);
    expect(startPlatformPaymentTest).toHaveBeenCalledWith(
      "fixture",
      2,
      expect.any(String),
    );
    expect(
      await screen.findByAltText("PhonePe UAT test payment QR"),
    ).toBeTruthy();
    expect(screen.getByText("Not received")).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: "Check payment status" }),
    );
    await waitFor(() =>
      expect(checkPlatformPaymentTest).toHaveBeenCalledWith("fixture", test.id),
    );
    expect(await screen.findByText("Test passed")).toBeTruthy();
    expect(screen.queryByAltText("PhonePe UAT test payment QR")).toBeNull();
  });
  it("reuses the request key after a start transport error", async () => {
    vi.mocked(getPlatformPaymentWorkspace).mockResolvedValue({
      ...workspace,
      connection,
      executionEnabled: true,
      callbackConfigured: true,
    });
    vi.mocked(startPlatformPaymentTest).mockRejectedValueOnce(
      new Error("Network unavailable"),
    );
    render(<PlatformPaymentGateways accessToken="fixture" canEdit />);
    await openWorkspace();
    fireEvent.click(
      screen.getByRole("button", { name: "Generate ₹1 test QR" }),
    );
    await screen.findAllByText("Network unavailable");
    fireEvent.click(
      screen.getByRole("button", { name: "Generate ₹1 test QR" }),
    );
    await screen.findByRole("heading", { name: "PhonePe test result" });
    expect(vi.mocked(startPlatformPaymentTest).mock.calls[0]![2]).toBe(
      vi.mocked(startPlatformPaymentTest).mock.calls[1]![2],
    );
  });
  it("opens existing tests and blocks another QR while confirmation is pending", async () => {
    vi.mocked(getPlatformPaymentWorkspace).mockResolvedValue({
      ...workspace,
      connection,
      executionEnabled: true,
      callbackConfigured: true,
      tests: [test],
      testStatus: "PENDING",
    });
    render(<PlatformPaymentGateways accessToken="fixture" canEdit />);
    await openWorkspace();
    expect(
      screen
        .getByRole("button", { name: "Generate ₹1 test QR" })
        .hasAttribute("disabled"),
    ).toBe(true);
    expect(screen.queryByRole("button", { name: "Open test" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Recent tests/ }));
    fireEvent.click(screen.getByRole("button", { name: "Open test" }));
    await screen.findByRole("heading", { name: "PhonePe test result" });
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(getPlatformPaymentTest).toHaveBeenCalledWith("fixture", test.id);
  });
  it("keeps read-only viewers limited to metadata and safe history", async () => {
    vi.mocked(getPlatformPaymentWorkspace).mockResolvedValue({
      ...workspace,
      connection,
      tests: [test],
    });
    render(<PlatformPaymentGateways accessToken="fixture" canEdit={false} />);
    const toggle = await screen.findByRole("switch", {
      name: "Make PhonePe available to Stores",
    });
    expect(toggle.getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "View test history" }));
    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).queryByRole("button", {
        name: "Replace credentials",
      }),
    ).toBeNull();
    expect(
      within(dialog).queryByRole("button", { name: "Generate ₹1 test QR" }),
    ).toBeNull();
    expect(
      within(dialog).queryByRole("button", { name: "Open test" }),
    ).toBeNull();
    expect(getPlatformPaymentTest).not.toHaveBeenCalled();
    expect(within(dialog).queryByLabelText("Merchant ID")).toBeNull();
    fireEvent.click(
      within(dialog).getByRole("button", { name: /Recent tests/ }),
    );
    expect(within(dialog).getByRole("table")).toBeTruthy();
  });
  it("shows save errors inside the same popup and clears the secret for retry", async () => {
    vi.mocked(savePlatformPhonePeTest).mockRejectedValue(
      new Error("Configuration changed. Reload before saving."),
    );
    render(<PlatformPaymentGateways accessToken="fixture" canEdit />);
    const dialog = await openWorkspace();
    fireEvent.change(screen.getByLabelText("Merchant ID"), {
      target: { value: "fixture_mid" },
    });
    fireEvent.change(screen.getByLabelText("Salt Index"), {
      target: { value: "1" },
    });
    fireEvent.change(screen.getByLabelText("Salt Key"), {
      target: { value: "fixture-salt-not-real" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save configuration" }));
    await screen.findByText("Configuration changed. Reload before saving.");
    expect(screen.getByRole("dialog")).toBe(dialog);
    expect((screen.getByLabelText("Salt Key") as HTMLInputElement).value).toBe(
      "",
    );
    expect(
      (screen.getByLabelText("Merchant ID") as HTMLInputElement).value,
    ).toBe("fixture_mid");
  });
  it("replaces credentials inline and discards unsaved values when cancelled", async () => {
    vi.mocked(getPlatformPaymentWorkspace).mockResolvedValue({
      ...workspace,
      connection,
    });
    render(<PlatformPaymentGateways accessToken="fixture" canEdit />);
    const dialog = await openWorkspace();
    expect(screen.queryByLabelText("Salt Key")).toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: "Replace credentials" }),
    );
    expect(screen.getByRole("dialog")).toBe(dialog);
    expect(
      (screen.getByLabelText("Merchant ID") as HTMLInputElement).value,
    ).toBe("");
    fireEvent.change(screen.getByLabelText("Salt Key"), {
      target: { value: "unsaved-salt-not-real" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByLabelText("Salt Key")).toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: "Replace credentials" }),
    );
    expect((screen.getByLabelText("Salt Key") as HTMLInputElement).value).toBe(
      "",
    );
    expect(savePlatformPhonePeTest).not.toHaveBeenCalled();
  });
  it("prevents popup dismissal and test creation while credentials are being saved", async () => {
    let complete!: (result: PlatformPaymentWorkspace) => void;
    vi.mocked(savePlatformPhonePeTest).mockReturnValue(
      new Promise((resolve) => {
        complete = resolve;
      }),
    );
    render(<PlatformPaymentGateways accessToken="fixture" canEdit />);
    const dialog = await openWorkspace();
    fireEvent.change(screen.getByLabelText("Merchant ID"), {
      target: { value: "fixture_mid" },
    });
    fireEvent.change(screen.getByLabelText("Salt Index"), {
      target: { value: "1" },
    });
    fireEvent.change(screen.getByLabelText("Salt Key"), {
      target: { value: "fixture-salt-not-real" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save configuration" }));
    expect(
      screen.getByRole("button", { name: "Cancel" }).hasAttribute("disabled"),
    ).toBe(true);
    expect(
      screen
        .getByRole("button", { name: "Generate ₹1 test QR" })
        .hasAttribute("disabled"),
    ).toBe(true);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.getByRole("dialog")).toBe(dialog);
    complete({ ...workspace, connection, testStatus: "NOT_TESTED" });
    await screen.findByRole("button", { name: "Replace credentials" });
    expect(screen.getByRole("dialog")).toBe(dialog);
  });
});
