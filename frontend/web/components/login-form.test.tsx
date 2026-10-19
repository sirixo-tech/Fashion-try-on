import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { LoginForm } from "./login-form";
import { getCurrentPlatformAccess } from "@/lib/access-control";
import { getCurrentMerchantStoreAccess } from "@/lib/current-store";

const { login, replace } = vi.hoisted(() => ({
  login: vi.fn(),
  replace: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }));
vi.mock("@/lib/session", () => ({ useSession: () => ({ login }) }));
vi.mock("@/lib/platform-settings", () => ({
  getPublicLoginPageSettings: () => Promise.reject(new Error("Use defaults")),
}));
vi.mock("@/lib/access-control", () => ({ getCurrentPlatformAccess: vi.fn() }));
vi.mock("@/lib/current-store", async (original) => ({
  ...(await original<typeof import("@/lib/current-store")>()),
  getCurrentMerchantStoreAccess: vi.fn(),
}));

beforeEach(() => {
  vi.resetAllMocks();
  login.mockResolvedValue({
    accessToken: "fresh-superadmin-token",
    accessTokenExpiresAt: "2026-10-19T12:00:00Z",
    user: {
      id: "superadmin",
      email: "admin@selfx.test",
      displayName: "Admin",
      status: "ACTIVE",
      hasPlatformAccess: true,
    },
  });
  vi.mocked(getCurrentPlatformAccess).mockResolvedValue({
    isSuperadmin: true,
    permissions: [],
  });
  vi.mocked(getCurrentMerchantStoreAccess).mockResolvedValue({
    store: null,
    permissions: null,
    hasMultipleStores: false,
    impersonation: null,
  });
});
afterEach(() => {
  cleanup();
  window.history.replaceState({}, "", "/");
});

function submit() {
  render(<LoginForm />);
  fireEvent.change(screen.getByLabelText("Email address"), {
    target: { value: "admin@selfx.test" },
  });
  fireEvent.change(screen.getByLabelText("Password"), {
    target: { value: "test-password" },
  });
  fireEvent.submit(
    screen.getByRole("button", { name: "Sign in" }).closest("form")!,
  );
}

it("uses the newly signed-in account to replace a saved Store destination with the dashboard", async () => {
  window.history.replaceState({}, "", "/login?next=%2Fapp%2Fpayments");
  submit();
  await waitFor(() => expect(replace).toHaveBeenCalledWith("/app/dashboard"));
  expect(login).toHaveBeenCalledWith("admin@selfx.test", "test-password");
  expect(getCurrentPlatformAccess).toHaveBeenCalledWith(
    "fresh-superadmin-token",
  );
});

it("preserves a permitted return destination after sign-in", async () => {
  window.history.replaceState({}, "", "/login?next=%2Fapp%2Froles");
  submit();
  await waitFor(() => expect(replace).toHaveBeenCalledWith("/app/roles"));
});

it("stays on sign-in when authentication fails", async () => {
  login.mockRejectedValue(new Error("Invalid credentials"));
  submit();
  expect(await screen.findByRole("alert")).toBeTruthy();
  expect(replace).not.toHaveBeenCalled();
  expect(getCurrentPlatformAccess).not.toHaveBeenCalled();
});
