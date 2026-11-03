"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EmptyState,
  Input,
  Label,
  LoadingState,
  PageContainer,
  PageHeader,
  SectionCard,
  SelectMenu,
  Textarea,
  useToast,
} from "@selfx/ui";
import { selfxApi, selfxApiUrl } from "@/lib/api";
import { getCurrentPlatformAccess } from "@/lib/access-control";
import { getCurrentMerchantStoreAccess } from "@/lib/current-store";
import { useSession } from "@/lib/session";
import { RegionalDateTime } from "@/lib/regional-settings";

type AppCode = "KIOSK" | "CUSTOMER" | "CUSTOM";
type CustomApp = {
  id: string;
  slug: string;
  name: string;
  description: string;
};
type Release = {
  id: string;
  versionName: string;
  versionCode: number;
  architecture: string;
  packageName: string;
  customAppId?: string | null;
  customApp?: CustomApp | null;
  app?: AppCode;
  filename: string;
  minSdk: number;
  sha256: string;
  sizeBytes: number;
  releaseNotes: string;
  status: "DRAFT" | "PUBLISHED" | "RETIRED";
  recommended: boolean;
  revision: number;
  createdAt: string;
  publishedAt: string | null;
  uploadedBy?: { displayName: string | null; email: string } | null;
};
type ReleasePage = {
  data: Release[];
  apps?: CustomApp[];
  nextCursor: string | null;
  hasMore: boolean;
};
type UploadJob = {
  id: string;
  status: "AWAITING_UPLOAD" | "QUEUED" | "PROCESSING" | "COMPLETED" | "FAILED";
  filename: string;
  createdAt: string;
  failureCode: string | null;
  releaseId: string | null;
};
type UploadTicket = {
  id: string;
  url: string;
  headers: Record<string, string>;
};
type UploadTarget = "KIOSK" | "CUSTOMER" | "NEW_CUSTOM" | `CUSTOM:${string}`;
const notifiedUploadFailuresKey = "selfx:app-release-failure-toasts";

function putApk(
  url: string,
  file: File,
  headers: Record<string, string>,
  onProgress: (value: number) => void,
) {
  return new Promise<void>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("PUT", url);
    request.timeout = 15 * 60_000;
    for (const [name, value] of Object.entries(headers))
      request.setRequestHeader(name, value);
    request.upload.onprogress = (event) => {
      if (event.lengthComputable)
        onProgress(
          Math.min(100, Math.round((event.loaded / event.total) * 100)),
        );
    };
    request.onload = () =>
      request.status >= 200 && request.status < 300
        ? resolve()
        : reject(
            new Error(
              "Private storage rejected the APK upload. Check storage CORS and bucket permissions.",
            ),
          );
    request.onerror = () =>
      reject(
        new Error(
          "Could not reach private app storage. Check the connection and storage CORS configuration.",
        ),
      );
    request.ontimeout = () =>
      reject(new Error("APK upload timed out. Retry on a stable connection."));
    request.onabort = () => reject(new Error("APK upload was cancelled."));
    request.send(file);
  });
}

function displayApp(release: Release) {
  if (release.customApp) return release.customApp.name;
  return release.app === "CUSTOMER" ||
    release.packageName === "com.selfx.selfx_customer"
    ? "SelfX Mobile"
    : "SelfX Kiosk";
}

function notifyUploadFailures(
  jobs: UploadJob[],
  showToast: ReturnType<typeof useToast>["showToast"],
) {
  let notified = new Set<string>();
  try {
    const stored = window.sessionStorage.getItem(notifiedUploadFailuresKey);
    const parsed: unknown = stored ? JSON.parse(stored) : [];
    if (Array.isArray(parsed))
      notified = new Set(
        parsed.filter((value): value is string => typeof value === "string"),
      );
  } catch {
    // A blocked session store should not prevent upload failure feedback.
  }

  const newFailures = jobs.filter(
    (job) => job.status === "FAILED" && !notified.has(job.id),
  );
  const grouped = new Map<string, UploadJob>();
  for (const job of newFailures) {
    const key = `${job.filename}\u0000${job.failureCode ?? ""}`;
    if (!grouped.has(key)) grouped.set(key, job);
  }
  for (const job of grouped.values()) {
    showToast({
      title: "APK validation failed",
      description: `${job.filename}${job.failureCode ? ` (${job.failureCode})` : ""}. Upload it again after checking the file.`,
      variant: "error",
    });
  }

  for (const job of jobs) if (job.status === "FAILED") notified.add(job.id);
  try {
    window.sessionStorage.setItem(
      notifiedUploadFailuresKey,
      JSON.stringify([...notified].slice(-100)),
    );
  } catch {
    // In-memory toast behavior still works when session storage is unavailable.
  }
}

export function AppReleasesPage({ platform = false }: { platform?: boolean }) {
  const session = useSession();
  const { showToast } = useToast();
  const token = session.accessToken;
  const [base, setBase] = useState("");
  const [canManage, setCanManage] = useState(false);
  const [platformMode, setPlatformMode] = useState(false);
  const [page, setPage] = useState<ReleasePage>({
    data: [],
    nextCursor: null,
    hasMore: false,
  });
  const [cursor, setCursor] = useState<string | undefined>();
  const [previous, setPrevious] = useState<Array<string | undefined>>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [uploadJobs, setUploadJobs] = useState<UploadJob[]>([]);
  const [uploadStatusUnavailable, setUploadStatusUnavailable] = useState(false);
  const [uploadPercent, setUploadPercent] = useState<number | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [notes, setNotes] = useState("");
  const [uploadTarget, setUploadTarget] = useState<UploadTarget>("KIOSK");
  const [updatingAppName, setUpdatingAppName] = useState<string | null>(null);
  const [appName, setAppName] = useState("");
  const [appDescription, setAppDescription] = useState("");
  const [uploadOpen, setUploadOpen] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const loadRevision = useRef(0);
  const [pending, setPending] = useState<{
    release: Release;
    action: "publish" | "recommend" | "delete_release" | "delete_app";
  } | null>(null);

  useEffect(() => {
    if (!error) return;
    showToast({
      title: "Apps & Downloads",
      description: error,
      variant: "error",
    });
    setError("");
  }, [error, showToast]);

  useEffect(() => {
    if (!message) return;
    showToast({
      title: "Apps & Downloads",
      description: message,
      variant: "success",
    });
    setMessage("");
  }, [message, showToast]);

  const load = useCallback(
    async (silent = false) => {
      const revision = ++loadRevision.current;
      if (!token) return;
      if (!silent) {
        setLoading(true);
        setError("");
      }
      try {
        let path = "";
        let usePlatformReleases = false;
        let canManagePlatformReleases = false;
        if (platform) {
          const access = await getCurrentPlatformAccess(token);
          const manage =
            access.isSuperadmin ||
            access.permissions.includes("APP_RELEASES_MANAGE");
          canManagePlatformReleases = manage;
          usePlatformReleases =
            manage ||
            access.isSuperadmin ||
            access.permissions.includes("APP_RELEASES_VIEW");
          if (revision !== loadRevision.current) return;
          setCanManage(manage);
          path = usePlatformReleases
            ? "/api/v1/platform/app-releases"
            : "/api/v1/apps/downloads";
          setPlatformMode(usePlatformReleases);
        } else {
          const access = await getCurrentMerchantStoreAccess(token);
          if (!access.store)
            throw new Error("Select an active Store with kiosk access.");
          path = `/api/v1/admin/stores/${access.store.id}/app-releases`;
          setPlatformMode(false);
          setCanManage(false);
        }
        const appQuery = platform && usePlatformReleases ? "&app=ALL" : "";
        const result = await selfxApi<ReleasePage>(
          `${path}?pageSize=100${appQuery}${cursor ? `&cursor=${cursor}` : ""}`,
          { accessToken: token },
        );
        if (revision !== loadRevision.current) return;
        setBase(path);
        setPage(result);
        if (platform && usePlatformReleases && canManagePlatformReleases) {
          try {
            const jobs = await selfxApi<{ data: UploadJob[] }>(
              `${path}/uploads`,
              { accessToken: token },
            );
            if (revision !== loadRevision.current) return;
            setUploadJobs(jobs.data);
            notifyUploadFailures(jobs.data, showToast);
            setUploadStatusUnavailable(false);
          } catch {
            if (revision !== loadRevision.current) return;
            setUploadStatusUnavailable(true);
          }
        } else {
          setUploadJobs([]);
          setUploadStatusUnavailable(false);
        }
      } catch (caught) {
        if (revision !== loadRevision.current) return;
        if (!silent) {
          setBase("");
          setCanManage(false);
          setPlatformMode(false);
          setPage({ data: [], nextCursor: null, hasMore: false });
          setUploadJobs([]);
          setUploadStatusUnavailable(false);
          setError(
            caught instanceof Error
              ? caught.message
              : "App releases could not be loaded.",
          );
        }
      } finally {
        if (revision === loadRevision.current && !silent) setLoading(false);
      }
    },
    [token, platform, cursor, showToast],
  );

  useEffect(() => {
    void load();
    return () => {
      loadRevision.current++;
    };
  }, [load]);

  useEffect(() => {
    if (!platformMode || !canManage) return;
    const hasPendingUpload = uploadJobs.some((job) =>
      ["AWAITING_UPLOAD", "QUEUED", "PROCESSING"].includes(job.status),
    );
    if (!hasPendingUpload && !uploadStatusUnavailable) return;
    const timer = window.setInterval(() => void load(true), 2500);
    return () => window.clearInterval(timer);
  }, [platformMode, canManage, uploadJobs, uploadStatusUnavailable, load]);

  const customApps = page.apps ?? [];
  const visibleUploadJobs = uploadJobs.filter(
    (job) => job.status !== "COMPLETED" && job.status !== "FAILED",
  );

  function openUpload() {
    setUploadTarget("KIOSK");
    setUpdatingAppName(null);
    setAppName("");
    setAppDescription("");
    setFile(null);
    setNotes("");
    setError("");
    setUploadOpen(true);
  }

  function openUpdate(release: Release) {
    const customAppId = release.customAppId ?? release.customApp?.id;
    const target: UploadTarget = customAppId
      ? `CUSTOM:${customAppId}`
      : release.app === "CUSTOMER" ||
          release.packageName === "com.selfx.selfx_customer"
        ? "CUSTOMER"
        : "KIOSK";
    setUploadTarget(target);
    setUpdatingAppName(displayApp(release));
    setAppName("");
    setAppDescription("");
    setFile(null);
    setNotes("");
    setError("");
    setUploadOpen(true);
  }

  async function upload(event: React.FormEvent) {
    event.preventDefault();
    if (!file || busy || !token) return;
    if (
      file.size > 200 * 1024 * 1024 ||
      !file.name.toLowerCase().endsWith(".apk")
    ) {
      setError("Choose an APK no larger than 200 MiB.");
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const custom =
        uploadTarget === "NEW_CUSTOM" || uploadTarget.startsWith("CUSTOM:");
      const ticket = await selfxApi<UploadTicket>(`${base}/uploads`, {
        method: "POST",
        accessToken: token,
        body: JSON.stringify({
          app: custom ? "CUSTOM" : uploadTarget,
          ...(uploadTarget === "NEW_CUSTOM"
            ? { appName, appDescription }
            : uploadTarget.startsWith("CUSTOM:")
              ? { companionAppId: uploadTarget.slice("CUSTOM:".length) }
              : {}),
          filename: file.name,
          sizeBytes: file.size,
          releaseNotes: notes,
        }),
      });
      setUploadPercent(0);
      await putApk(ticket.url, file, ticket.headers, setUploadPercent);
      setUploadPercent(null);
      await selfxApi(`${base}/uploads/${ticket.id}/complete`, {
        method: "POST",
        accessToken: token,
      });
      setFile(null);
      setNotes("");
      if (fileInput.current) fileInput.current.value = "";
      setMessage(
        "APK uploaded. SelfX is validating it in the background; the draft will appear when it is ready.",
      );
      setUploadOpen(false);
      setCursor(undefined);
      setPrevious([]);
      await load();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Upload failed. Try again.",
      );
    } finally {
      setUploadPercent(null);
      setBusy(false);
    }
  }

  async function act() {
    if (!pending || busy || !token) return;
    setBusy(true);
    setError("");
    try {
      if (pending.action === "delete_app") {
        const appId = pending.release.customAppId;
        if (!appId) throw new Error("This companion app could not be found.");
        await selfxApi(`${base}/apps/${appId}`, {
          accessToken: token,
          method: "DELETE",
        });
      } else if (pending.action === "delete_release") {
        await selfxApi(`${base}/${pending.release.id}`, {
          accessToken: token,
          method: "DELETE",
        });
      } else {
        await selfxApi(`${base}/${pending.release.id}/action`, {
          accessToken: token,
          method: "POST",
          body: JSON.stringify({
            action: pending.action,
            revision: pending.release.revision,
          }),
        });
      }
      setPending(null);
      await load();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Release could not be changed.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function getDownloadUrl(release: Release) {
    if (!token) throw new Error("Sign in again to download this app.");
    const result = await selfxApi<{ url: string }>(
      `${base}/${release.id}/download`,
      {
        method: "POST",
        accessToken: token,
      },
    );
    return result.url.startsWith("/") ? selfxApiUrl(result.url) : result.url;
  }

  async function createShareUrl(release: Release) {
    if (!token) throw new Error("Sign in again to share this app.");
    const result = await selfxApi<{ url: string }>(
      `${base}/${release.id}/share-link`,
      { method: "POST", accessToken: token },
    );
    return result.url.startsWith("/") ? selfxApiUrl(result.url) : result.url;
  }

  async function download(release: Release) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const link = document.createElement("a");
      link.href = await getDownloadUrl(release);
      link.rel = "noreferrer";
      link.click();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Download could not start.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function copyDownloadLink(release: Release) {
    if (busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await navigator.clipboard.writeText(await createShareUrl(release));
      setMessage("APK download link copied. It is valid for 24 hours.");
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not copy the download link.",
      );
    } finally {
      setBusy(false);
    }
  }

  const publishedVisible = (release: Release) => release.status === "PUBLISHED";
  return (
    <PageContainer>
      <PageHeader
        title={platform ? "Apps & Downloads" : "Download Kiosk APK"}
        description={
          platformMode
            ? "Browse SelfX app installers. Platform roles can add and manage releases."
            : platform
              ? "Download published SelfX app installers. Management is restricted to authorized Platform roles."
              : "Install a published SelfX Kiosk App build that matches your Android device."
        }
        actions={
          <div className="flex gap-2">
            <Button
              variant="outline"
              disabled={loading || busy}
              onClick={() => void load()}
            >
              Refresh
            </Button>
            {platformMode && canManage && (
              <Button disabled={loading || busy} onClick={openUpload}>
                Add App
              </Button>
            )}
          </div>
        }
      />
      {uploadStatusUnavailable && (
        <p role="status" className="text-sm text-muted-foreground">
          Upload processing status is temporarily unavailable. Refresh to check
          again.
        </p>
      )}
      {visibleUploadJobs.length > 0 && (
        <div className="space-y-2" aria-live="polite">
          {visibleUploadJobs.map((job) => (
            <div
              key={job.id}
              className="rounded-lg border bg-card px-4 py-3 text-sm"
            >
              <div>
                <p className="font-medium">{job.filename}</p>
                <p
                  className={
                    job.status === "FAILED"
                      ? "text-destructive"
                      : "text-muted-foreground"
                  }
                >
                  {job.status === "AWAITING_UPLOAD"
                    ? "Upload not finished. You can start it again."
                    : job.status === "QUEUED"
                      ? "Uploaded. Waiting for APK validation…"
                      : "Validating APK in the background…"}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
      {loading ? (
        <LoadingState label="Loading app releases" />
      ) : page.data.length === 0 ? (
        <EmptyState
          title={
            platformMode && canManage
              ? "No apps uploaded yet"
              : "No published apps available"
          }
          description={
            platformMode && canManage
              ? "Add an APK to create the first app release. App version details are read from the APK."
              : "Published app installers will appear here when available."
          }
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {page.data.map((release) => (
            <SectionCard
              key={release.id}
              title={`${displayApp(release)} · ${release.versionName}`}
              description={`${release.architecture} · Build ${release.versionCode} · Android API ${release.minSdk}+`}
            >
              <div className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline">{release.status}</Badge>
                  {release.recommended && (
                    <Badge>Recommended · {release.architecture}</Badge>
                  )}
                </div>
                <p className="break-all text-sm">{release.filename}</p>
                <dl className="grid gap-3 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-muted-foreground">File size</dt>
                    <dd>{(release.sizeBytes / 1024 / 1024).toFixed(1)} MiB</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Uploaded</dt>
                    <dd>
                      <RegionalDateTime value={release.createdAt} />
                    </dd>
                  </div>
                  {platformMode && release.uploadedBy && (
                    <div>
                      <dt className="text-muted-foreground">Uploaded by</dt>
                      <dd className="break-all">
                        {release.uploadedBy.displayName ||
                          release.uploadedBy.email}
                      </dd>
                    </div>
                  )}
                  {release.customApp && (
                    <div>
                      <dt className="text-muted-foreground">Package</dt>
                      <dd className="break-all">{release.packageName}</dd>
                    </div>
                  )}
                </dl>
                {release.releaseNotes && (
                  <p className="whitespace-pre-wrap text-sm">
                    {release.releaseNotes}
                  </p>
                )}
                <div className="flex flex-wrap gap-2">
                  {canManage && (
                    <Button
                      variant="outline"
                      disabled={busy}
                      onClick={() => openUpdate(release)}
                    >
                      Update
                    </Button>
                  )}
                  {(publishedVisible(release) || canManage) && (
                    <>
                      <Button
                        variant="outline"
                        disabled={busy}
                        onClick={() => void download(release)}
                      >
                        Download
                      </Button>
                      {publishedVisible(release) && (
                        <Button
                          variant="outline"
                          disabled={busy}
                          onClick={() => void copyDownloadLink(release)}
                        >
                          Copy URL
                        </Button>
                      )}
                    </>
                  )}
                  {canManage && release.status === "DRAFT" && (
                    <Button
                      disabled={busy}
                      onClick={() => setPending({ release, action: "publish" })}
                    >
                      Publish
                    </Button>
                  )}
                  {canManage &&
                    release.status === "PUBLISHED" &&
                    !release.recommended && (
                      <Button
                        variant="outline"
                        disabled={busy}
                        onClick={() =>
                          setPending({ release, action: "recommend" })
                        }
                      >
                        Set recommended
                      </Button>
                    )}
                  {canManage && (
                    <Button
                      variant="destructive"
                      disabled={busy}
                      onClick={() =>
                        setPending({
                          release,
                          action: release.customAppId
                            ? "delete_app"
                            : "delete_release",
                        })
                      }
                    >
                      Delete {release.customAppId ? "app" : "release"}
                    </Button>
                  )}
                </div>
                {platformMode && (
                  <div>
                    <p className="text-xs text-muted-foreground">
                      SHA-256 checksum
                    </p>
                    <code className="break-all text-xs">{release.sha256}</code>
                  </div>
                )}
              </div>
            </SectionCard>
          ))}
        </div>
      )}
      {(previous.length > 0 || page.hasMore) && (
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            disabled={loading || busy || previous.length === 0}
            onClick={() => {
              setCursor(previous.at(-1));
              setPrevious(previous.slice(0, -1));
            }}
          >
            Previous
          </Button>
          <span>Page {previous.length + 1}</span>
          <Button
            variant="outline"
            disabled={loading || busy || !page.nextCursor}
            onClick={() => {
              setPrevious([...previous, cursor]);
              setCursor(page.nextCursor!);
            }}
          >
            Next
          </Button>
        </div>
      )}
      <p className="text-sm text-muted-foreground">
        Installing a download is manual. Publishing does not update installed
        devices automatically.
      </p>

      <Dialog
        open={uploadOpen}
        onOpenChange={(open) => {
          if (!busy) setUploadOpen(open);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {updatingAppName
                ? `Update ${updatingAppName} APK`
                : "Add App APK"}
            </DialogTitle>
            <DialogDescription>
              {updatingAppName
                ? `Upload a newer signed APK for ${updatingAppName}. SelfX reads the app version, build number, supported architecture and minimum Android version directly from the file. The current release stays in history.`
                : "Upload a signed APK. SelfX reads the app version, build number, supported architecture and minimum Android version directly from the file."}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={upload} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="app-target">App</Label>
              <SelectMenu
                id="app-target"
                ariaLabel="App"
                value={uploadTarget}
                disabled={busy || updatingAppName !== null}
                onChange={(value) => setUploadTarget(value as UploadTarget)}
                options={[
                  { value: "KIOSK", label: "SelfX Kiosk" },
                  { value: "CUSTOMER", label: "SelfX Mobile" },
                  ...customApps.map((app) => ({
                    value: `CUSTOM:${app.id}`,
                    label: app.name,
                  })),
                  { value: "NEW_CUSTOM", label: "Create a new app" },
                ]}
              />
            </div>
            {uploadTarget === "NEW_CUSTOM" && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="app-name">App name</Label>
                  <Input
                    id="app-name"
                    value={appName}
                    maxLength={120}
                    required
                    disabled={busy}
                    onChange={(event) => setAppName(event.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="app-description">Description</Label>
                  <Textarea
                    id="app-description"
                    value={appDescription}
                    maxLength={500}
                    disabled={busy}
                    onChange={(event) => setAppDescription(event.target.value)}
                  />
                </div>
              </>
            )}
            <div className="space-y-2">
              <Label htmlFor="release-apk">APK file</Label>
              <Input
                ref={fileInput}
                id="release-apk"
                type="file"
                accept=".apk,application/vnd.android.package-archive"
                disabled={busy}
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="release-notes">Release notes</Label>
              <Textarea
                id="release-notes"
                value={notes}
                maxLength={4000}
                disabled={busy}
                onChange={(event) => setNotes(event.target.value)}
              />
            </div>
            <p className="text-sm text-muted-foreground">
              The APK uploads directly to private storage with progress. SelfX
              validates it in the background and then adds a draft card.
            </p>
            {uploadPercent !== null && (
              <div className="space-y-2" role="status" aria-live="polite">
                <div className="flex justify-between text-sm">
                  <span>Uploading APK</span>
                  <span>{uploadPercent}%</span>
                </div>
                <progress
                  className="h-2 w-full accent-primary"
                  max={100}
                  value={uploadPercent}
                  aria-label="APK upload progress"
                />
              </div>
            )}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => setUploadOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={
                  busy ||
                  !file ||
                  (uploadTarget === "NEW_CUSTOM" && appName.trim().length < 2)
                }
              >
                {uploadPercent !== null
                  ? `Uploading APK… ${uploadPercent}%`
                  : busy
                    ? "Preparing secure upload…"
                    : "Upload APK"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!pending}
        onOpenChange={(open) => {
          if (!open && !busy) setPending(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {pending?.action === "delete_app"
                ? `Delete ${pending.release.customApp?.name ?? "app"} and all history?`
                : pending?.action === "delete_release"
                  ? "Delete this APK release?"
                  : pending
                    ? `${pending.action[0]!.toUpperCase()}${pending.action.slice(1)} release?`
                    : "Change release"}
            </DialogTitle>
            <DialogDescription>
              {pending?.action === "publish"
                ? "This APK will become available in the shared app downloads catalog."
                : pending?.action === "delete_app"
                  ? "This permanently deletes the app, every APK release, upload history and stored APK files. Existing installs are unchanged. The audit record of this deletion is retained."
                  : pending?.action === "delete_release"
                    ? "This permanently deletes this APK release, its upload history and stored APK file. Other releases and installed apps are unchanged. The audit record of this deletion is retained."
                    : "This becomes the recommended download for this architecture."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => setPending(null)}
            >
              Cancel
            </Button>
            <Button
              variant={
                pending?.action === "delete_app" ||
                pending?.action === "delete_release"
                  ? "destructive"
                  : "default"
              }
              disabled={busy}
              onClick={() => void act()}
            >
              {busy ? "Deleting…" : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}
