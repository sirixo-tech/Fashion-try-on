import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AppReleasesPage } from "./app-releases-page";
import { selfxApi } from "@/lib/api";
import { getCurrentPlatformAccess } from "@/lib/access-control";
vi.mock("@/lib/session", () => ({
  useSession: () => ({
    status: "authenticated",
    user: { id: "user" },
    accessToken: "test-token",
  }),
}));
vi.mock("@/lib/api", () => ({ selfxApi: vi.fn() }));
vi.mock("@/lib/access-control", () => ({ getCurrentPlatformAccess: vi.fn() }));
vi.mock("@/lib/current-store", () => ({
  getCurrentMerchantStoreAccess: vi
    .fn()
    .mockResolvedValue({ store: { id: "store-one" } }),
}));
const release = {
  id: "release",
  versionName: "1.0",
  versionCode: 1,
  architecture: "ARM64",
  filename: "app.apk",
  minSdk: 24,
  sizeBytes: 1024,
  sha256: "a".repeat(64),
  releaseNotes: "Test notes",
  status: "PUBLISHED",
  recommended: true,
  revision: 1,
  createdAt: "2026-10-21T00:00:00Z",
};
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(selfxApi).mockResolvedValue({
    data: [release],
    hasMore: false,
    nextCursor: null,
  });
  vi.mocked(getCurrentPlatformAccess).mockResolvedValue({
    isSuperadmin: false,
    permissions: ["APP_RELEASES_VIEW"],
  });
});
afterEach(cleanup);
it("lets platform viewers download without exposing management controls", async () => {
  render(<AppReleasesPage platform />);
  await screen.findByText("SelfX Kiosk 1.0");
  expect(
    screen.getByRole("button", { name: "Download", exact: true }),
  ).toBeTruthy();
  expect(screen.queryByLabelText("APK file")).toBeNull();
  expect(screen.queryByRole("button", { name: "Retire" })).toBeNull();
});
it("uploads binary FormData as a draft for a release manager", async () => {
  vi.mocked(getCurrentPlatformAccess).mockResolvedValue({
    isSuperadmin: true,
    permissions: [],
  });
  render(<AppReleasesPage platform />);
  const input = await screen.findByLabelText("APK file");
  fireEvent.change(input, {
    target: {
      files: [
        new File(["fixture"], "signed.apk", {
          type: "application/vnd.android.package-archive",
        }),
      ],
    },
  });
  fireEvent.change(screen.getByLabelText("Release notes"), {
    target: { value: "Release description" },
  });
  fireEvent.submit(
    screen.getByRole("button", { name: "Upload draft" }).closest("form")!,
  );
  await waitFor(() =>
    expect(selfxApi).toHaveBeenCalledWith(
      "/api/v1/platform/app-releases",
      expect.objectContaining({ method: "POST", body: expect.any(FormData) }),
    ),
  );
  await screen.findByText(
    "APK validated and saved as a draft. Review it before publishing.",
  );
});
