import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { GoogleSignIn } from "./google-sign-in";
import { selfxApi, SafeApiError } from "@/lib/api";
vi.mock("@/lib/api", async (original) => ({
  ...(await original<typeof import("@/lib/api")>()),
  selfxApi: vi.fn(),
}));
beforeEach(() => {
  vi.resetAllMocks();
  window.history.replaceState({}, "", "/login");
});
afterEach(cleanup);
it("hides Google until backend configuration enables it", async () => {
  vi.mocked(selfxApi).mockResolvedValue({ enabled: false });
  render(<GoogleSignIn mode="login" />);
  await waitFor(() => expect(selfxApi).toHaveBeenCalled());
  expect(
    screen.queryByRole("button", { name: "Continue with Google" }),
  ).toBeNull();
});
it("preserves a safe continuation and recovers from a start failure", async () => {
  vi.mocked(selfxApi)
    .mockResolvedValueOnce({ enabled: true })
    .mockRejectedValueOnce(
      new SafeApiError("AUTH_RATE_LIMITED", "Try again shortly."),
    );
  window.history.replaceState(
    {},
    "",
    "/signup?next=%2Fapp%2Fintegrations%2Fshopify%2Flink%3Ftoken%3Dfixture",
  );
  render(<GoogleSignIn mode="signup" />);
  fireEvent.click(
    await screen.findByRole("button", { name: "Continue with Google" }),
  );
  expect(await screen.findByText("Try again shortly.")).toBeTruthy();
  expect(selfxApi).toHaveBeenLastCalledWith("/api/v1/auth/google/start", {
    method: "POST",
    body: JSON.stringify({
      mode: "signup",
      next: "/app/integrations/shopify/link?token=fixture",
    }),
  });
  expect((screen.getByRole("button") as HTMLButtonElement).disabled).toBe(
    false,
  );
});
it("blocks an unexpected authorization redirect and honors a busy email form", async () => {
  vi.mocked(selfxApi)
    .mockResolvedValueOnce({ enabled: true })
    .mockResolvedValueOnce({ authorizationUrl: "https://evil.test/redirect" });
  const view = render(<GoogleSignIn mode="login" disabled />);
  expect(
    ((await screen.findByRole("button")) as HTMLButtonElement).disabled,
  ).toBe(true);
  view.rerender(<GoogleSignIn mode="login" />);
  fireEvent.click(screen.getByRole("button"));
  expect(await screen.findByText(/could not start/)).toBeTruthy();
});
