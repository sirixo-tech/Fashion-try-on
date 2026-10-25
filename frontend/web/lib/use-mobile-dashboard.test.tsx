import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useMobileDashboard } from "./use-mobile-dashboard";
import {
  mobileDashboardCsv,
  type MobileDashboardSummary,
} from "./mobile-dashboard";
const mocks = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock("./api", () => ({ selfxApi: mocks.api }));
export const mobileSummary: MobileDashboardSummary = {
  available: true,
  range: {
    preset: "30d",
    from: "2026-09-25T12:00:00.000Z",
    to: "2026-10-25T12:00:00.000Z",
  },
  updatedAt: "2026-10-25T12:00:00.000Z",
  totals: {
    total: 12,
    newAccounts: 5,
    recentlyActive: 3,
    verified: 9,
    pending: 2,
    suspended: 1,
  },
  daily: [{ date: "2026-10-25", accounts: 5 }],
  methods: [{ provider: "GOOGLE", accounts: 9 }],
  unavailable: ["tryOns", "personalBilling", "storeQr"],
};
beforeEach(() => {
  mocks.api.mockReset();
});
afterEach(cleanup);
it("drops stale data when range changes and ignores an older response", async () => {
  let finish!: (data: MobileDashboardSummary) => void;
  mocks.api
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    )
    .mockResolvedValueOnce({
      ...mobileSummary,
      totals: { ...mobileSummary.totals!, newAccounts: 2 },
    });
  const { result, rerender } = renderHook(
    ({ range }: { range: "7d" | "30d" }) =>
      useMobileDashboard("token", range, 0),
    { initialProps: { range: "30d" } },
  );
  rerender({ range: "7d" });
  await waitFor(() => expect(result.current.data?.totals?.newAccounts).toBe(2));
  await act(async () => {
    finish(mobileSummary);
  });
  expect(result.current.data?.totals?.newAccounts).toBe(2);
});
it("does not request without identity and never keeps old data after a failed refresh", async () => {
  mocks.api
    .mockResolvedValueOnce(mobileSummary)
    .mockRejectedValueOnce(new Error("Permission denied"));
  const { result, rerender } = renderHook(
    ({ token, refresh }: { token: string | null; refresh: number }) =>
      useMobileDashboard(token, "30d", refresh),
    { initialProps: { token: null as string | null, refresh: 0 } },
  );
  expect(mocks.api).not.toHaveBeenCalled();
  rerender({ token: "token", refresh: 0 });
  await waitFor(() => expect(result.current.data).toEqual(mobileSummary));
  rerender({ token: "token", refresh: 1 });
  expect(result.current.data).toBeNull();
  await waitFor(() => expect(result.current.error).toBe("Permission denied"));
  expect(result.current.loading).toBe(false);
});
it("exports only mobile account aggregates and represents unimplemented metrics as unavailable", () => {
  const csv = mobileDashboardCsv(mobileSummary)!;
  expect(csv).toContain('"New accounts in period",5');
  expect(csv).toContain(
    '"Try-On, personal billing and Store QR metrics","Not available"',
  );
  expect(csv).not.toContain("email");
  expect(
    mobileDashboardCsv({ ...mobileSummary, available: false, totals: null }),
  ).toBeNull();
});
it("invalidates visible aggregates when permission or impersonation context changes", async () => {
  mocks.api
    .mockResolvedValueOnce(mobileSummary)
    .mockRejectedValueOnce(new Error("Permission denied"));
  const { result } = renderHook(() => useMobileDashboard("token", "30d", 0));
  await waitFor(() => expect(result.current.data).toEqual(mobileSummary));
  act(() => {
    window.dispatchEvent(new Event("selfx:permissions-changed"));
  });
  expect(result.current.data).toBeNull();
  await waitFor(() => expect(result.current.error).toBe("Permission denied"));
});
