import { selfxApi, selfxApiBlob } from "./api";

export const reportReasons = [
  { value: "SEXUAL_CONTENT", label: "Sexual / inappropriate content" },
  { value: "CHILD_SAFETY", label: "Child safety" },
  { value: "VIOLENCE", label: "Violence" },
  { value: "HATE_HARASSMENT", label: "Hate / harassment" },
  {
    value: "PRIVACY_NON_CONSENSUAL",
    label: "Privacy / non-consensual content",
  },
  { value: "OTHER", label: "Other" },
] as const;
export const reportStatuses = [
  { value: "NEW", label: "New" },
  { value: "IN_REVIEW", label: "In review" },
  { value: "RESOLVED", label: "Resolved" },
  { value: "DISMISSED", label: "Dismissed" },
] as const;
export type ReportReason = (typeof reportReasons)[number]["value"];
export type ReportStatus = (typeof reportStatuses)[number]["value"];
export interface ContentReportSummary {
  id: string;
  runId: string;
  resultAssetId: string;
  reason: ReportReason;
  status: ReportStatus;
  createdAt: string;
  updatedAt: string;
}
export interface ContentReportDetail extends ContentReportSummary {
  customerId: string;
  comment: string | null;
  reviewNotes: string | null;
  reviewedByUserId: string | null;
  reviewedAt: string | null;
  version: number;
  imageAvailable: boolean;
  imageExpiresAt: string | null;
}
export interface ContentReportsPage {
  data: ContentReportSummary[];
  total: number;
  page: number;
  pageSize: number;
}
const root = "/api/v1/admin/content-reports";
export function listContentReports(
  accessToken: string,
  input: {
    page: number;
    status: ReportStatus | "ALL";
    reason: ReportReason | "ALL";
  },
) {
  const query = new URLSearchParams({
    page: String(input.page),
    pageSize: "25",
  });
  if (input.status !== "ALL") query.set("status", input.status);
  if (input.reason !== "ALL") query.set("reason", input.reason);
  return selfxApi<ContentReportsPage>(`${root}?${query}`, {
    accessToken,
    cache: "no-store",
  });
}
export function getContentReport(accessToken: string, id: string) {
  return selfxApi<ContentReportDetail>(`${root}/${id}`, {
    accessToken,
    cache: "no-store",
  });
}
export function getContentReportImage(
  accessToken: string,
  id: string,
  signal: AbortSignal,
) {
  return selfxApiBlob(`${root}/${id}/image`, { accessToken, signal });
}
export function reviewContentReport(
  accessToken: string,
  id: string,
  input: { status: ReportStatus; reviewNotes: string; version: number },
) {
  return selfxApi<{ id: string; version: number }>(`${root}/${id}`, {
    accessToken,
    method: "PATCH",
    body: JSON.stringify(input),
  });
}
