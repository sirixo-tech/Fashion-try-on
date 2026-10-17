import { StrictMode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { PasswordRecoveryForm } from "./password-recovery-form";
import { selfxApi, SafeApiError } from "@/lib/api";
const mocks = vi.hoisted(() => ({
  logout: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/session", () => ({
  useSession: () => ({ logout: mocks.logout }),
}));
vi.mock("@/lib/api", async (original) => ({
  ...(await original<typeof import("@/lib/api")>()),
  selfxApi: vi.fn(),
}));
beforeEach(() => {
  vi.clearAllMocks();
  window.history.replaceState(null, "", "/forgot-password");
});
afterEach(cleanup);
it("submits the login email and displays the generic result", async () => {
  vi.mocked(selfxApi).mockResolvedValue({
    message: "If an eligible account exists, instructions will be sent.",
  });
  render(<PasswordRecoveryForm />);
  fireEvent.change(screen.getByLabelText("Login email"), {
    target: { value: "owner@example.com" },
  });
  fireEvent.submit(
    screen.getByRole("button", { name: "Send reset link" }).closest("form")!,
  );
  expect(await screen.findByRole("status")).toBeTruthy();
  expect(selfxApi).toHaveBeenCalledWith(
    "/api/v1/auth/forgot-password",
    expect.objectContaining({
      body: JSON.stringify({ email: "owner@example.com" }),
    }),
  );
});
it("consumes a fragment token once in Strict Mode, validates confirmation and signs out after success", async () => {
  const token = "a".repeat(64);
  window.history.replaceState(null, "", `/reset-password#token=${token}`);
  vi.mocked(selfxApi).mockResolvedValue({
    message: "Password reset successfully.",
  });
  render(
    <StrictMode>
      <PasswordRecoveryForm reset />
    </StrictMode>,
  );
  expect(window.location.hash).toBe("");
  expect(screen.queryByText(/This reset link is invalid/)).toBeNull();
  fireEvent.change(screen.getByLabelText("New password"), {
    target: { value: "NewPassword123!" },
  });
  fireEvent.change(screen.getByLabelText("Confirm password"), {
    target: { value: "DifferentPassword123!" },
  });
  fireEvent.submit(
    screen.getByRole("button", { name: "Reset password" }).closest("form")!,
  );
  expect(screen.getByText("Passwords do not match.")).toBeTruthy();
  expect(selfxApi).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText("Confirm password"), {
    target: { value: "NewPassword123!" },
  });
  fireEvent.submit(
    screen.getByRole("button", { name: "Reset password" }).closest("form")!,
  );
  expect(await screen.findByText("Password reset successfully.")).toBeTruthy();
  expect(selfxApi).toHaveBeenCalledWith(
    "/api/v1/auth/reset-password",
    expect.objectContaining({
      body: JSON.stringify({ token, password: "NewPassword123!" }),
    }),
  );
  expect(mocks.logout).toHaveBeenCalledOnce();
});
it("blocks missing tokens and offers a new link", () => {
  render(<PasswordRecoveryForm reset />);
  expect(
    screen.getByText("This reset link is invalid. Request a new link."),
  ).toBeTruthy();
  expect(
    (
      screen.getByRole("button", {
        name: "Reset password",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
});
it("shows an expired-link error from the backend without signing in", async () => {
  window.history.replaceState(
    null,
    "",
    `/reset-password#token=${"b".repeat(64)}`,
  );
  vi.mocked(selfxApi).mockRejectedValue(
    new SafeApiError(
      "PASSWORD_RESET_LINK_INVALID",
      "This reset link is invalid or expired.",
    ),
  );
  render(<PasswordRecoveryForm reset />);
  for (const label of ["New password", "Confirm password"])
    fireEvent.change(screen.getByLabelText(label), {
      target: { value: "NewPassword123!" },
    });
  fireEvent.submit(
    screen.getByRole("button", { name: "Reset password" }).closest("form")!,
  );
  await waitFor(() =>
    expect(
      screen.getByText("This reset link is invalid or expired."),
    ).toBeTruthy(),
  );
  expect(mocks.logout).not.toHaveBeenCalled();
});
