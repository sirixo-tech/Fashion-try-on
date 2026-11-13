import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { CustomerDeletionForm } from "./customer-deletion-form";
import DeleteAccountPage from "@/app/delete-account/page";

const proof = "a".repeat(43);
const generic =
  "If an eligible SelfX customer account uses this email, a deletion verification code will arrive shortly. No account has been deleted.";
const fetchMock = vi.fn();
function response(data: object, ok = true) {
  return { ok, json: async () => data };
}
function requestCode() {
  fireEvent.change(screen.getByLabelText("Registered customer email"), {
    target: { value: "customer@example.test" },
  });
  fireEvent.submit(
    screen
      .getByRole("button", { name: "Request deletion code" })
      .closest("form")!,
  );
}
beforeEach(() => {
  vi.stubGlobal("PointerEvent", MouseEvent);
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset().mockResolvedValue(
    response({
      message: generic,
      deletionProof: proof,
      resendAfterSeconds: 60,
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it("renders the public page and both deletion routes without session or login requirements", () => {
  render(<DeleteAccountPage />);
  expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(
    "SelfX — Customer Account & Data Deletion",
  );
  expect(
    screen.getByRole("button", { name: "Request deletion code" }),
  ).toBeTruthy();
  expect(
    screen.getByRole("heading", { name: "Delete in the SelfX app" }),
  ).toBeTruthy();
  expect(screen.getAllByText(/hello@selfx.in/).length).toBeGreaterThan(0);
  expect(screen.getByText(/fixed retention period/)).toBeTruthy();
  expect(fetchMock).not.toHaveBeenCalled();
});
it("sends a public request without merchant credentials and shows generic feedback", async () => {
  render(<CustomerDeletionForm />);
  requestCode();
  expect((await screen.findByRole("status")).textContent).toContain(generic);
  expect(fetchMock).toHaveBeenCalledWith(
    expect.stringContaining("/api/v1/customer/account-deletion/request"),
    expect.objectContaining({
      credentials: "omit",
      cache: "no-store",
      body: JSON.stringify({ email: "customer@example.test", website: "" }),
    }),
  );
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(screen.getByLabelText("Deletion verification code")).toBeTruthy();
});
it("requires a code and explicit consent before confirming, then clears the form", async () => {
  render(<CustomerDeletionForm />);
  requestCode();
  const code = await screen.findByLabelText("Deletion verification code");
  const form = screen
    .getByRole("button", { name: "Verify and delete my customer account" })
    .closest("form")!;
  fireEvent.submit(form);
  expect(fetchMock).toHaveBeenCalledTimes(1);
  fireEvent.change(code, { target: { value: "123456" } });
  fireEvent.click(screen.getByRole("checkbox"));
  fetchMock.mockResolvedValue(
    response({ message: "Your customer account has been deleted." }),
  );
  fireEvent.submit(form);
  await waitFor(() =>
    expect(screen.queryByLabelText("Deletion verification code")).toBeNull(),
  );
  expect(fetchMock).toHaveBeenLastCalledWith(
    expect.stringContaining("/account-deletion/confirm"),
    expect.objectContaining({
      body: JSON.stringify({
        email: "customer@example.test",
        code: "123456",
        deletionProof: proof,
        confirmation: "DELETE",
      }),
    }),
  );
  expect(screen.getByRole("status").textContent).toContain("has been deleted");
});
it("prevents duplicate sends and early resends, and clears proof when changing email", async () => {
  let resolve!: (value: unknown) => void;
  fetchMock.mockReturnValue(
    new Promise((finish) => {
      resolve = finish;
    }),
  );
  render(<CustomerDeletionForm />);
  requestCode();
  fireEvent.submit(
    screen.getByRole("button", { name: "Please wait…" }).closest("form")!,
  );
  expect(fetchMock).toHaveBeenCalledTimes(1);
  resolve(
    response({
      message: generic,
      deletionProof: proof,
      resendAfterSeconds: 60,
    }),
  );
  await screen.findByLabelText("Deletion verification code");
  fireEvent.click(screen.getByRole("button", { name: "Resend code" }));
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(
    screen.getByText(
      "Wait at least 60 seconds before requesting another code.",
    ),
  ).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Use another email" }));
  expect(screen.queryByLabelText("Deletion verification code")).toBeNull();
});
it("shows safe errors for failed verification without exposing server details", async () => {
  render(<CustomerDeletionForm />);
  fetchMock.mockResolvedValue({
    ok: false,
    json: async () => {
      throw new Error("internal sensitive trace");
    },
  });
  requestCode();
  expect((await screen.findByRole("alert")).textContent).toContain(
    "try again or contact SelfX support",
  );
  expect(screen.queryByText(/sensitive trace/)).toBeNull();
});
