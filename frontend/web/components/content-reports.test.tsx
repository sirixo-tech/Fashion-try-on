import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import ContentReportsPage from "@/app/app/platform/content-reports/page";
import { getCurrentPlatformAccess } from "@/lib/access-control";
import {
  getContentReport,
  listContentReports,
  reviewContentReport,
} from "@/lib/content-reports";

vi.mock("@/lib/session", () => ({
  useSession: () => ({ status: "authenticated", accessToken: "staff-token" }),
}));
vi.mock("@/lib/access-control", () => ({ getCurrentPlatformAccess: vi.fn() }));
vi.mock("@/lib/content-reports", async (original) => ({
  ...(await original<typeof import("@/lib/content-reports")>()),
  getContentReport: vi.fn(),
  listContentReports: vi.fn(),
  reviewContentReport: vi.fn(),
  getContentReportImage: vi.fn(),
}));

const report = {
  id: "report-id",
  runId: "run-id",
  resultAssetId: "result-id",
  reason: "OTHER" as const,
  status: "NEW" as const,
  createdAt: "2026-11-23T08:00:00Z",
  updatedAt: "2026-11-23T08:00:00Z",
};
const detail = {
  ...report,
  customerId: "customer-id",
  comment: "Synthetic feedback",
  reviewNotes: null,
  reviewedByUserId: null,
  reviewedAt: null,
  version: 1,
  imageAvailable: false,
  imageExpiresAt: null,
};
beforeEach(() => {
  vi.resetAllMocks();
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }),
  });
  vi.mocked(getCurrentPlatformAccess).mockResolvedValue({
    isSuperadmin: false,
    permissions: ["CONTENT_REPORTS_VIEW", "CONTENT_REPORTS_MANAGE"],
  } as Awaited<ReturnType<typeof getCurrentPlatformAccess>>);
  vi.mocked(listContentReports).mockResolvedValue({
    data: [report],
    total: 26,
    page: 1,
    pageSize: 25,
  });
  vi.mocked(getContentReport).mockResolvedValue(detail);
  vi.mocked(reviewContentReport).mockResolvedValue({
    id: report.id,
    version: 2,
  });
});
afterEach(cleanup);
it("shows a permission state without requesting reports for unauthorized users", async () => {
  vi.mocked(getCurrentPlatformAccess).mockResolvedValue({
    isSuperadmin: false,
    permissions: ["USAGE_VIEW"],
  } as Awaited<ReturnType<typeof getCurrentPlatformAccess>>);
  render(<ContentReportsPage />);
  expect(await screen.findByText("Permission required")).toBeTruthy();
  expect(listContentReports).not.toHaveBeenCalled();
});
it("paginates reports and shows unavailable images without exposing original photos", async () => {
  render(<ContentReportsPage />);
  await screen.findByRole("button", { name: "View report" });
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  await waitFor(() =>
    expect(listContentReports).toHaveBeenLastCalledWith("staff-token", {
      page: 2,
      status: "ALL",
      reason: "ALL",
    }),
  );
  fireEvent.click(await screen.findByRole("button", { name: "View report" }));
  expect(await screen.findByText("Synthetic feedback")).toBeTruthy();
  expect(screen.getByText("Image no longer available.")).toBeTruthy();
  expect(screen.queryByRole("img")).toBeNull();
});
it("keeps review controls read-only for viewers", async () => {
  vi.mocked(getCurrentPlatformAccess).mockResolvedValue({
    isSuperadmin: false,
    permissions: ["CONTENT_REPORTS_VIEW"],
  } as Awaited<ReturnType<typeof getCurrentPlatformAccess>>);
  render(<ContentReportsPage />);
  fireEvent.click(await screen.findByRole("button", { name: "View report" }));
  expect(await screen.findByText("You have view-only access.")).toBeTruthy();
  expect(
    (screen.getByLabelText("Internal review notes") as HTMLTextAreaElement)
      .disabled,
  ).toBe(true);
  expect(screen.queryByRole("button", { name: "Save review" })).toBeNull();
});
it("saves internal notes with the loaded version and preserves input on failure", async () => {
  render(<ContentReportsPage />);
  fireEvent.click(await screen.findByRole("button", { name: "View report" }));
  const notes = await screen.findByLabelText("Internal review notes");
  fireEvent.change(notes, { target: { value: "Reviewed generated image" } });
  vi.mocked(reviewContentReport).mockRejectedValueOnce(
    new Error("This report changed. Reload it before saving your review."),
  );
  fireEvent.click(screen.getByRole("button", { name: "Save review" }));
  expect(await screen.findByText(/This report changed/)).toBeTruthy();
  expect((notes as HTMLTextAreaElement).value).toBe("Reviewed generated image");
  fireEvent.click(screen.getByRole("button", { name: "Save review" }));
  expect(await screen.findByText("Review saved.")).toBeTruthy();
  expect(reviewContentReport).toHaveBeenLastCalledWith(
    "staff-token",
    report.id,
    { status: "NEW", reviewNotes: "Reviewed generated image", version: 1 },
  );
});
