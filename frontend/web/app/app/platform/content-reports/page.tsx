"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  EmptyState,
  ErrorState,
  FilterBar,
  Label,
  LoadingState,
  PageContainer,
  PageHeader,
  PageSection,
  PermissionDeniedState,
  SelectMenu,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableContainer,
  Textarea,
} from "@selfx/ui";
import { getCurrentPlatformAccess } from "@/lib/access-control";
import { useSession } from "@/lib/session";
import { RegionalDateTime } from "@/lib/regional-settings";
import {
  getContentReport,
  getContentReportImage,
  listContentReports,
  reportReasons,
  reportStatuses,
  reviewContentReport,
  type ContentReportDetail,
  type ContentReportsPage as ReportsPageData,
  type ReportReason,
  type ReportStatus,
} from "@/lib/content-reports";

const reasonLabel = (value: ReportReason) =>
  reportReasons.find((r) => r.value === value)?.label ?? value;
const statusLabel = (value: ReportStatus) =>
  reportStatuses.find((r) => r.value === value)?.label ?? value;
const message = (error: unknown) =>
  error instanceof Error
    ? error.message
    : "The request could not be completed.";

function ReportedImage({
  token,
  report,
}: {
  token: string;
  report: ContentReportDetail;
}) {
  const [image, setImage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [expired, setExpired] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    let objectUrl: string | null = null;
    const expiresIn = report.imageExpiresAt
      ? new Date(report.imageExpiresAt).getTime() - Date.now()
      : 0;
    setImage(null);
    setError(null);
    setExpired(expiresIn <= 0);
    if (!report.imageAvailable || expiresIn <= 0)
      return () => controller.abort();
    let timer: ReturnType<typeof setTimeout>;
    function expireImage() {
      const remaining = new Date(report.imageExpiresAt!).getTime() - Date.now();
      if (remaining > 0) {
        timer = setTimeout(expireImage, Math.min(remaining, 2147483647));
        return;
      }
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      objectUrl = null;
      setImage(null);
      setExpired(true);
    }
    expireImage();
    void getContentReportImage(token, report.id, controller.signal)
      .then((blob) => {
        if (controller.signal.aborted) return;
        objectUrl = URL.createObjectURL(blob);
        setImage(objectUrl);
      })
      .catch((caught) => {
        if (!controller.signal.aborted) setError(message(caught));
      });
    return () => {
      controller.abort();
      clearTimeout(timer);
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [token, report.id, report.imageAvailable, report.imageExpiresAt, attempt]);
  if (!report.imageAvailable || expired)
    return <p className="text-muted-foreground">Image no longer available.</p>;
  if (error)
    return (
      <div role="alert">
        <p>{error}</p>
        <Button variant="outline" onClick={() => setAttempt((v) => v + 1)}>
          Retry image
        </Button>
      </div>
    );
  if (!image) return <LoadingState label="Loading reported image" />;
  // Authenticated blob URLs are local to this view and revoked on close/expiry.
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={image}
      alt="Reported AI-generated Try-On result"
      className="max-h-[60vh] w-full rounded-lg object-contain"
    />
  );
}

export default function ContentReportsPage() {
  const session = useSession();
  const token = session.status === "authenticated" ? session.accessToken : null;
  const [access, setAccess] = useState<{
    view: boolean;
    manage: boolean;
  } | null>(null);
  const [status, setStatus] = useState<ReportStatus | "ALL">("ALL");
  const [reason, setReason] = useState<ReportReason | "ALL">("ALL");
  const [page, setPage] = useState(1);
  const [reports, setReports] = useState<ReportsPageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ContentReportDetail | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detailRefresh, setDetailRefresh] = useState(0);
  const [reviewStatus, setReviewStatus] = useState<ReportStatus>("NEW");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const selection = useRef(selectedId);
  selection.current = selectedId;

  useEffect(() => {
    let active = true;
    setSelectedId(null);
    setAccess(null);
    setReports(null);
    if (!token) return;
    setLoading(true);
    setError(null);
    void getCurrentPlatformAccess(token)
      .then(async (permissions) => {
        if (!active) return;
        const manage =
          permissions.isSuperadmin ||
          permissions.permissions.includes("CONTENT_REPORTS_MANAGE");
        const view =
          manage || permissions.permissions.includes("CONTENT_REPORTS_VIEW");
        setAccess({ view, manage });
        if (view) {
          const result = await listContentReports(token, {
            page,
            status,
            reason,
          });
          if (active) setReports(result);
        }
      })
      .catch((caught) => {
        if (active) setError(message(caught));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [token, page, status, reason, refresh]);

  useEffect(() => {
    let active = true;
    setDetail(null);
    setDetailError(null);
    setSaved(false);
    if (!token || !selectedId || !access?.view) return;
    void getContentReport(token, selectedId)
      .then((result) => {
        if (!active) return;
        setDetail(result);
        setReviewStatus(result.status);
        setNotes(result.reviewNotes ?? "");
      })
      .catch((caught) => {
        if (active) setDetailError(message(caught));
      });
    return () => {
      active = false;
    };
  }, [token, selectedId, access?.view, detailRefresh]);

  const save = useCallback(async () => {
    if (!token || !detail || !access?.manage || saving) return;
    setSaving(true);
    setDetailError(null);
    setSaved(false);
    try {
      await reviewContentReport(token, detail.id, {
        status: reviewStatus,
        reviewNotes: notes,
        version: detail.version,
      });
      const updated = await getContentReport(token, detail.id);
      if (selection.current !== detail.id) return;
      setDetail(updated);
      setReviewStatus(updated.status);
      setNotes(updated.reviewNotes ?? "");
      setSaved(true);
      setReports((current) =>
        current
          ? {
              ...current,
              data: current.data.map((row) =>
                row.id === updated.id ? updated : row,
              ),
            }
          : current,
      );
    } catch (caught) {
      if (selection.current === detail.id) setDetailError(message(caught));
    } finally {
      setSaving(false);
    }
  }, [token, detail, access?.manage, saving, reviewStatus, notes]);

  if (!token || loading)
    return <LoadingState label="Loading content reports" />;
  if (error)
    return (
      <ErrorState
        title="Content reports unavailable"
        description={error}
        action={{ label: "Retry", onClick: () => setRefresh((v) => v + 1) }}
      />
    );
  if (!access?.view) return <PermissionDeniedState />;
  return (
    <PageContainer width="wide">
      <PageHeader
        title="Content Reports"
        description="Review customer reports about AI-generated Try-On images."
        actions={
          <Button variant="outline" onClick={() => setRefresh((v) => v + 1)}>
            Refresh
          </Button>
        }
      />
      <PageSection>
        <FilterBar
          filters={
            <>
              <SelectMenu
                ariaLabel="Filter by status"
                value={status}
                options={[
                  { value: "ALL", label: "All statuses" },
                  ...reportStatuses,
                ]}
                onChange={(value) => {
                  setStatus(value);
                  setPage(1);
                }}
              />
              <SelectMenu
                ariaLabel="Filter by reason"
                value={reason}
                options={[
                  { value: "ALL", label: "All reasons" },
                  ...reportReasons,
                ]}
                onChange={(value) => {
                  setReason(value);
                  setPage(1);
                }}
              />
            </>
          }
        />
        <TableContainer
          footer={
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">
                {reports?.total ?? 0} reports · Page {page}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  disabled={page <= 1}
                  onClick={() => setPage((v) => v - 1)}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  disabled={
                    !reports || page * reports.pageSize >= reports.total
                  }
                  onClick={() => setPage((v) => v + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          }
        >
          {!reports?.data.length ? (
            <EmptyState
              title="No content reports"
              description="Customer reports will appear here when submitted."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Submitted</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Generated result</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reports.data.map((report) => (
                  <TableRow key={report.id}>
                    <TableCell>
                      <RegionalDateTime value={report.createdAt} />
                    </TableCell>
                    <TableCell>{reasonLabel(report.reason)}</TableCell>
                    <TableCell className="font-mono text-xs">
                      {report.resultAssetId}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {statusLabel(report.status)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="outline"
                        onClick={() => setSelectedId(report.id)}
                      >
                        View report
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </TableContainer>
      </PageSection>
      <Dialog
        open={Boolean(selectedId)}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedId(null);
            setRefresh((value) => value + 1);
          }
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle>Content report</DialogTitle>
            <DialogDescription>
              Review the reported generated image and record your assessment.
            </DialogDescription>
          </DialogHeader>
          {detailError ? (
            <div role="alert" className="space-y-2">
              <p>{detailError}</p>
              <Button
                variant="outline"
                onClick={() => setDetailRefresh((v) => v + 1)}
              >
                Reload report
              </Button>
            </div>
          ) : null}
          {!detail && !detailError ? (
            <LoadingState label="Loading report" />
          ) : null}
          {detail ? (
            <div className="grid gap-6 md:grid-cols-2">
              <div className="space-y-3">
                <ReportedImage key={detail.id} token={token} report={detail} />
                <p className="text-sm text-muted-foreground">
                  Only the reported generated result is shown. Its existing
                  expiry still applies.
                </p>
              </div>
              <div className="space-y-4">
                <dl className="space-y-2 text-sm">
                  <div>
                    <dt className="font-medium">Reason</dt>
                    <dd>{reasonLabel(detail.reason)}</dd>
                  </div>
                  <div>
                    <dt className="font-medium">Submitted</dt>
                    <dd>
                      <RegionalDateTime value={detail.createdAt} />
                    </dd>
                  </div>
                  <div>
                    <dt className="font-medium">Run reference</dt>
                    <dd className="break-all font-mono text-xs">
                      {detail.runId}
                    </dd>
                  </div>
                  <div>
                    <dt className="font-medium">Customer comment</dt>
                    <dd className="whitespace-pre-wrap break-words">
                      {detail.comment || "No comment provided."}
                    </dd>
                  </div>
                </dl>
                <div className="space-y-2">
                  <Label htmlFor="report-review-status">Status</Label>
                  <SelectMenu
                    id="report-review-status"
                    ariaLabel="Review status"
                    value={reviewStatus}
                    options={reportStatuses}
                    disabled={!access.manage || saving}
                    onChange={setReviewStatus}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="report-review-notes">
                    Internal review notes
                  </Label>
                  <Textarea
                    id="report-review-notes"
                    value={notes}
                    maxLength={4000}
                    rows={5}
                    disabled={!access.manage || saving}
                    onChange={(event) => setNotes(event.target.value)}
                  />
                  <p className="text-sm text-muted-foreground">
                    Use these findings to inform content filtering and
                    moderation. Avoid adding personal information.
                  </p>
                </div>
                {detail.reviewedAt ? (
                  <p className="break-all text-sm text-muted-foreground">
                    Last reviewed <RegionalDateTime value={detail.reviewedAt} />{" "}
                    by {detail.reviewedByUserId ?? "a former platform reviewer"}
                    .
                  </p>
                ) : null}
                {saved ? <p role="status">Review saved.</p> : null}
                {access.manage ? (
                  <Button disabled={saving} onClick={() => void save()}>
                    {saving ? "Saving…" : "Save review"}
                  </Button>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    You have view-only access.
                  </p>
                )}
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}
