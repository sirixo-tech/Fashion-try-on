import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import GoogleCompletePage from "./page";

const mocks = vi.hoisted(() => ({
  status: "loading",
  replace: vi.fn(),
  resolveNext: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mocks.replace }),
}));
vi.mock("@/lib/session", () => ({
  useSession: () => ({
    status: mocks.status,
    accessToken: "test-session",
    user: { id: "test-user", hasPlatformAccess: true },
  }),
}));
vi.mock("@/lib/login-next", () => ({
  resolveLoginNextPath: mocks.resolveNext,
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.status = "loading";
});
afterEach(() => {
  cleanup();
  window.history.replaceState({}, "", "/");
});

it("shows the branded loader while restoring the session without navigating", () => {
  render(<GoogleCompletePage />);
  expect(screen.getByRole("status").textContent).toContain("Loading workspace");
  expect(screen.getByAltText("SelfX")).toBeTruthy();
  expect(mocks.resolveNext).not.toHaveBeenCalled();
  expect(mocks.replace).not.toHaveBeenCalled();
});

it("keeps loading until the authenticated return destination is resolved", async () => {
  mocks.status = "authenticated";
  window.history.replaceState(
    {},
    "",
    "/auth/google/complete?next=%2Fapp%2Froles",
  );
  let finish!: (next: string) => void;
  mocks.resolveNext.mockReturnValue(
    new Promise<string>((resolve) => {
      finish = resolve;
    }),
  );
  render(<GoogleCompletePage />);
  expect(screen.getByRole("status")).toBeTruthy();
  expect(mocks.resolveNext).toHaveBeenCalledWith(
    "/app/roles",
    expect.objectContaining({ accessToken: "test-session" }),
  );
  expect(mocks.replace).not.toHaveBeenCalled();
  finish("/app/dashboard");
  await waitFor(() =>
    expect(mocks.replace).toHaveBeenCalledWith("/app/dashboard"),
  );
});

it("offers recovery instead of an endless loader when session restoration fails", () => {
  mocks.status = "unauthenticated";
  render(<GoogleCompletePage />);
  expect(screen.queryByRole("status")).toBeNull();
  expect(
    screen
      .getByRole("link", { name: "Return to sign in" })
      .getAttribute("href"),
  ).toBe("/login");
  expect(mocks.replace).not.toHaveBeenCalled();
});
