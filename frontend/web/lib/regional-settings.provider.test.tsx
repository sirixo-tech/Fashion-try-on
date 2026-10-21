import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  RegionalDateTime,
  RegionalSettingsProvider,
  useRegionalSettings,
} from "./regional-settings";
import { selfxApi } from "./api";
const mocks = vi.hoisted(() => ({ userId: "user-one" }));
vi.mock("./session", () => ({
  useSession: () => ({
    status: "authenticated",
    user: { id: mocks.userId },
    accessToken: `token-${mocks.userId}`,
  }),
}));
vi.mock("./api", () => ({ selfxApi: vi.fn() }));
beforeEach(() => {
  mocks.userId = "user-one";
  vi.mocked(selfxApi).mockReset();
});
afterEach(cleanup);
function Preferences() {
  const { save } = useRegionalSettings();
  return (
    <>
      <RegionalDateTime value="2026-10-21T00:30:00Z" kind="date" />
      <button
        onClick={() =>
          void save({
            timezone: "America/Los_Angeles",
            dateFormat: "YMD",
            timeFormat: "H24",
          })
        }
      >
        Save
      </button>
    </>
  );
}
it("applies fetched settings and updates existing dates immediately after saving", async () => {
  vi.mocked(selfxApi)
    .mockResolvedValueOnce({
      timezone: "UTC",
      dateFormat: "YMD",
      timeFormat: "H24",
    })
    .mockResolvedValueOnce({
      timezone: "America/Los_Angeles",
      dateFormat: "YMD",
      timeFormat: "H24",
    });
  render(
    <RegionalSettingsProvider>
      <Preferences />
    </RegionalSettingsProvider>,
  );
  await screen.findByText("2026-10-21");
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await screen.findByText("2026-10-20");
  expect(selfxApi).toHaveBeenLastCalledWith(
    "/api/v1/account/regional-settings",
    expect.objectContaining({ method: "PATCH", accessToken: "token-user-one" }),
  );
});
it("discards the previous account's preferences on account change", async () => {
  vi.mocked(selfxApi)
    .mockResolvedValueOnce({
      timezone: "UTC",
      dateFormat: "YMD",
      timeFormat: "H24",
    })
    .mockResolvedValueOnce({
      timezone: "America/Los_Angeles",
      dateFormat: "DMY",
      timeFormat: "H12",
    });
  const view = render(
    <RegionalSettingsProvider>
      <Preferences />
    </RegionalSettingsProvider>,
  );
  await screen.findByText("2026-10-21");
  mocks.userId = "user-two";
  view.rerender(
    <RegionalSettingsProvider>
      <Preferences />
    </RegionalSettingsProvider>,
  );
  await waitFor(() =>
    expect(selfxApi).toHaveBeenLastCalledWith(
      "/api/v1/account/regional-settings",
      { accessToken: "token-user-two" },
    ),
  );
  await screen.findByText("20/10/2026");
});
