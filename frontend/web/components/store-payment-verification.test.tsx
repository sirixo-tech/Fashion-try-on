import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { StorePaymentVerification } from "./store-payment-verification";
import {
  getStorePaymentWorkspace,
  getStorePaymentTest,
  startStorePaymentTest,
  checkStorePaymentTest,
  type StorePaymentWorkspace,
} from "@/lib/payments";
import type { PlatformPaymentTestDetail } from "@/lib/platform-payment-tests";
vi.mock("@/lib/payments", () => ({
  getStorePaymentWorkspace: vi.fn(),
  getStorePaymentTest: vi.fn(),
  startStorePaymentTest: vi.fn(),
  checkStorePaymentTest: vi.fn(),
}));
vi.mock("qrcode", () => ({
  toDataURL: vi.fn().mockResolvedValue("data:image/png;base64,fixture"),
}));
const workspace: StorePaymentWorkspace = {
  connection: {
    provider: "PHONEPE",
    environment: "UAT",
    version: 3,
    dqrAccessConfirmed: true,
    updatedAt: "2026-10-18T00:00:00Z",
  },
  executionEnabled: true,
  callbackConfigured: true,
  testStatus: "NOT_TESTED",
  tests: [],
};
const test: PlatformPaymentTestDetail = {
  id: "test-a",
  provider: "PHONEPE",
  environment: "UAT",
  connectionVersion: 3,
  status: "PENDING",
  amountMinor: 100,
  currency: "INR",
  createdAt: "2026-10-18T00:00:00Z",
  expiresAt: "2026-10-18T00:05:00Z",
  confirmedAt: null,
  checkedAt: null,
  nextCheckAt: null,
  providerReference: null,
  failureCode: null,
  callbackReceived: false,
  verificationPending: false,
  testOnly: true,
  qrString: "upi://pay?fixture",
  serverTime: "2026-10-18T00:00:00Z",
};
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getStorePaymentWorkspace).mockResolvedValue(workspace);
  vi.mocked(startStorePaymentTest).mockResolvedValue(test);
  vi.mocked(getStorePaymentTest).mockResolvedValue(test);
  vi.mocked(checkStorePaymentTest).mockResolvedValue({
    ...test,
    status: "SUCCEEDED",
    qrString: null,
    confirmedAt: "2026-10-18T00:01:00Z",
  });
});
afterEach(cleanup);
it("allows retrying when Store verification metadata cannot be loaded", async () => {
  vi.mocked(getStorePaymentWorkspace).mockRejectedValueOnce(
    new Error("Service unavailable"),
  );
  render(panel());
  fireEvent.click(
    await screen.findByRole("button", { name: "Retry verification" }),
  );
  expect(await screen.findByText("Configured · Not tested")).toBeTruthy();
});
function panel(canEdit = true) {
  return (
    <StorePaymentVerification
      accessToken="identity"
      storeId="store-a"
      canEdit={canEdit}
      enabled
    />
  );
}
it("starts a Store-bound test using the saved credential version and checks that same test", async () => {
  render(panel());
  fireEvent.click(
    await screen.findByRole("button", { name: "Generate ₹1 test QR" }),
  );
  await waitFor(() =>
    expect(startStorePaymentTest).toHaveBeenCalledWith(
      "identity",
      "store-a",
      3,
      expect.any(String),
    ),
  );
  fireEvent.click(
    await screen.findByRole("button", { name: "Check payment status" }),
  );
  await waitFor(() =>
    expect(checkStorePaymentTest).toHaveBeenCalledWith(
      "identity",
      "store-a",
      "test-a",
    ),
  );
  expect(await screen.findByText("Test passed")).toBeTruthy();
  expect(screen.getByText("Live payments: Not enabled")).toBeTruthy();
});
it("preserves the idempotency key after an uncertain browser request", async () => {
  vi.mocked(startStorePaymentTest).mockRejectedValueOnce(
    new Error("Connection lost"),
  );
  render(panel());
  fireEvent.click(
    await screen.findByRole("button", { name: "Generate ₹1 test QR" }),
  );
  await screen.findByText("Connection lost");
  fireEvent.click(screen.getByRole("button", { name: "Generate ₹1 test QR" }));
  await waitFor(() => expect(startStorePaymentTest).toHaveBeenCalledTimes(2));
  expect(vi.mocked(startStorePaymentTest).mock.calls[0]?.[3]).toBe(
    vi.mocked(startStorePaymentTest).mock.calls[1]?.[3],
  );
});
it("shows read-only history without QR or provider-execution controls", async () => {
  vi.mocked(getStorePaymentWorkspace).mockResolvedValue({
    ...workspace,
    tests: [test],
  });
  render(panel(false));
  await screen.findByText("Current account");
  expect(
    screen.queryByRole("button", { name: "Generate ₹1 test QR" }),
  ).toBeNull();
  expect(screen.queryByRole("button", { name: "Open test" })).toBeNull();
  expect(startStorePaymentTest).not.toHaveBeenCalled();
});
it("opens saved tests for this Store instead of generating a replacement", async () => {
  vi.mocked(getStorePaymentWorkspace).mockResolvedValue({
    ...workspace,
    tests: [test],
    testStatus: "PENDING",
  });
  render(panel());
  fireEvent.click(await screen.findByRole("button", { name: "Open test" }));
  await waitFor(() =>
    expect(getStorePaymentTest).toHaveBeenCalledWith(
      "identity",
      "store-a",
      "test-a",
    ),
  );
  expect(startStorePaymentTest).not.toHaveBeenCalled();
  expect(
    (
      screen.getByRole("button", {
        name: "Generate ₹1 test QR",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
});
it.each(["UNCONFIRMED", "PRODUCTION"] as const)(
  "does not enable QR tests for %s configuration",
  async (environment) => {
    vi.mocked(getStorePaymentWorkspace).mockResolvedValue({
      ...workspace,
      connection: {
        ...workspace.connection!,
        environment,
        dqrAccessConfirmed: false,
      },
    });
    render(panel());
    const button = await screen.findByRole("button", {
      name: "Generate ₹1 test QR",
    });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(button);
    expect(startStorePaymentTest).not.toHaveBeenCalled();
  },
);
it("keeps a previous account's passed test separate from the current setup state", async () => {
  vi.mocked(getStorePaymentWorkspace).mockResolvedValue({
    ...workspace,
    tests: [{ ...test, connectionVersion: 2, status: "SUCCEEDED" }],
  });
  render(panel());
  expect(await screen.findByText("Configured · Not tested")).toBeTruthy();
  expect(screen.getByText("Previous account configuration")).toBeTruthy();
  expect(screen.getByText("Live payments: Not enabled")).toBeTruthy();
});
