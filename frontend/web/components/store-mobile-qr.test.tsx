import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { StoreMobileQr } from "./store-mobile-qr";
const mocks = vi.hoisted(() => ({ api: vi.fn(), qr: vi.fn() }));
vi.mock("@/lib/api", () => ({
  selfxApi: mocks.api,
  SafeApiError: class extends Error {},
}));
vi.mock("qrcode", () => ({ toDataURL: mocks.qr }));
vi.mock("@/lib/regional-settings", () => ({
  RegionalDateTime: ({ value }: { value: string }) => <span>{value}</span>,
}));
const row = {
  id: "code-a",
  label: "Counter",
  dailyCustomerLimit: 5,
  expiresAt: "2027-10-26T00:00:00Z",
  createdAt: "2026-10-26T00:00:00Z",
  revokedAt: null,
};
beforeEach(() => {
  mocks.api.mockReset().mockResolvedValue({ data: [] });
  mocks.qr.mockReset().mockResolvedValue("data:image/png;base64,fixture");
});
afterEach(cleanup);
it("shows sponsorship and restricts creation to Store integration managers", async () => {
  render(
    <StoreMobileQr accessToken="fixture" storeId="store-a" canManage={false} />,
  );
  await screen.findByText("No Store codes yet.");
  expect(screen.queryByRole("button", { name: "Create Store QR" })).toBeNull();
  expect(screen.getByText(/Successful Try-Ons use this Store/)).toBeTruthy();
  expect(mocks.api).toHaveBeenCalledWith(
    "/api/v1/admin/stores/store-a/mobile-qrs",
    { accessToken: "fixture" },
  );
});
it("creates a Store QR, offers its one-time download and revokes the right code", async () => {
  mocks.api.mockImplementation(async (_path, options) =>
    options.method === "POST"
      ? { ...row, payload: "selfx://store?token=synthetic" }
      : options.method === "DELETE"
        ? {}
        : { data: [row] },
  );
  render(<StoreMobileQr accessToken="fixture" storeId="store-a" canManage />);
  await screen.findByText("Counter");
  fireEvent.change(screen.getByLabelText("Code name"), {
    target: { value: "Front desk" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Create Store QR" }));
  await screen.findByRole("link", { name: "Download QR" });
  expect(mocks.qr).toHaveBeenCalledWith(
    "selfx://store?token=synthetic",
    expect.any(Object),
  );
  expect(mocks.api).toHaveBeenCalledWith(
    "/api/v1/admin/stores/store-a/mobile-qrs",
    expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ label: "Front desk", dailyCustomerLimit: 5 }),
    }),
  );
  await waitFor(() =>
    expect(
      screen
        .getByRole("button", { name: "Revoke code" })
        .hasAttribute("disabled"),
    ).toBe(false),
  );
  fireEvent.click(screen.getByRole("button", { name: "Revoke code" }));
  await waitFor(() =>
    expect(mocks.api).toHaveBeenCalledWith(
      "/api/v1/admin/stores/store-a/mobile-qrs/code-a",
      { accessToken: "fixture", method: "DELETE" },
    ),
  );
});
