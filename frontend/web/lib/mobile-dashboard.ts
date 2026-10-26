import { selfxApi } from "./api";

export type MobileRange = "today" | "7d" | "30d" | "90d";
export type MobileDashboardSummary = {
  available: boolean;
  range: { preset: MobileRange; from: string; to: string };
  updatedAt: string;
  totals: null | {
    total: number;
    newAccounts: number;
    recentlyActive: number;
    verified: number;
    pending: number;
    suspended: number;
  };
  daily: Array<{ date: string; accounts: number }>;
  methods: Array<{ provider: string; accounts: number }>;
  unavailable: string[];
  experience?: null | {
    attempts: number;
    completed: number;
    failed: number;
    personalCompleted: number;
    storeCompleted: number;
    storeVisits: number;
    trialGranted: number;
    trialUsed: number;
    trialReserved: number;
  };
};
export function getMobileDashboard(token: string, range: MobileRange) {
  return selfxApi<MobileDashboardSummary>(
    `/api/v1/admin/mobile-dashboard/summary?range=${range}`,
    { accessToken: token },
  );
}

export function mobileDashboardCsv(summary: MobileDashboardSummary) {
  if (!summary.available || !summary.totals) return null;
  return [
    '"Mobile Dashboard","Value"',
    `"From (UTC)","${summary.range.from}"`,
    `"To (UTC, exclusive)","${summary.range.to}"`,
    `"Current registered accounts",${summary.totals.total}`,
    `"New accounts in period",${summary.totals.newAccounts}`,
    `"Recently active accounts",${summary.totals.recentlyActive}`,
    `"Current verified accounts",${summary.totals.verified}`,
    `"Current pending accounts",${summary.totals.pending}`,
    `"Current suspended accounts",${summary.totals.suspended}`,
    ...(summary.experience
      ? [
          `"Mobile generation attempts",${summary.experience.attempts}`,
          `"Mobile completed looks",${summary.experience.completed}`,
          `"Mobile failed attempts",${summary.experience.failed}`,
          `"Personal completed looks",${summary.experience.personalCompleted}`,
          `"Store-sponsored completed looks",${summary.experience.storeCompleted}`,
          `"Store QR visits",${summary.experience.storeVisits}`,
          `"Trial credits granted (lifetime)",${summary.experience.trialGranted}`,
          `"Trial credits used (lifetime)",${summary.experience.trialUsed}`,
          '"Personal paid billing","Not available"',
        ]
      : ['"Try-On, personal billing and Store QR metrics","Not available"']),
    "",
    '"Date (UTC)","New accounts"',
    ...summary.daily.map((row) => `"${row.date}",${row.accounts}`),
  ].join("\r\n");
}
