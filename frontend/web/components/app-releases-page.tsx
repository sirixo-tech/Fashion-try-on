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
} from "@selfx/ui";
import { selfxApi } from "@/lib/api";
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
type UploadTarget = "KIOSK" | "CUSTOMER" | "NEW_CUSTOM" | `CUSTOM:${string}`;

function displayApp(release: Release) {
  if (release.customApp) return release.customApp.name;
  return release.app === "CUSTOMER" ||
    release.packageName === "com.selfx.selfx_customer"
    ? "SelfX Mobile"
    : "SelfX Kiosk";
}

export function AppReleasesPage({ platform = false }: { platform?: boolean }) {
  const session = useSession();
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
  const [file, setFile] = useState<File | null>(null);
  const [notes, setNotes] = useState("");
  const [uploadTarget, setUploadTarget] = useState<UploadTarget>("KIOSK");
  const [appName, setAppName] = useState("");
  const [appDescription, setAppDescription] = useState("");
  const [uploadOpen, setUploadOpen] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const loadRevision = useRef(0);
  const [pending, setPending] = useState<{
    release: Release;
    action: "publish" | "recommend" | "retire";
  } | null>(null);

  const load = useCallback(async () => {
    const revision = ++loadRevision.current;
    if (!token) return;
    setLoading(true);
    setError("");
    try {
      let path = "";
      let usePlatformReleases = false;
      if (platform) {
        const access = await getCurrentPlatformAccess(token);
        const manage =
          access.isSuperadmin ||
          access.permissions.includes("APP_RELEASES_MANAGE");
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
    } catch (caught) {
      if (revision !== loadRevision.current) return;
      setBase("");
      setCanManage(false);
      setPlatformMode(false);
      setPage({ data: [], nextCursor: null, hasMore: false });
      setError(
        caught instanceof Error
          ? caught.message
          : "App releases could not be loaded.",
      );
    } finally {
      if (revision === loadRevision.current) setLoading(false);
    }
  }, [token, platform, cursor]);

  useEffect(() => {
    void load();
    return () => {
      loadRevision.current++;
    };
  }, [load]);

  const customApps = page.apps ?? [];

  function openUpload() {
    setUploadTarget("KIOSK");
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
      const body = new FormData();
      const custom =
        uploadTarget === "NEW_CUSTOM" || uploadTarget.startsWith("CUSTOM:");
      body.set("app", custom ? "CUSTOM" : uploadTarget);
      if (uploadTarget === "NEW_CUSTOM") {
        body.set("appName", appName);
        body.set("description", appDescription);
      } else if (uploadTarget.startsWith("CUSTOM:")) {
        body.set("companionAppId", uploadTarget.slice("CUSTOM:".length));
      }
      body.set("releaseNotes", notes);
      body.set("apk", file);
      await selfxApi(base, { method: "POST", accessToken: token, body });
      setFile(null);
      setNotes("");
      if (fileInput.current) fileInput.current.value = "";
      setMessage(
        "APK validated and saved as a draft. Review it before publishing.",
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
      setBusy(false);
    }
  }

  async function act() {
    if (!pending || busy || !token) return;
    setBusy(true);
    setError("");
    try {
      await selfxApi(`${base}/${pending.release.id}/action`, {
        accessToken: token,
        method: "POST",
        body: JSON.stringify({
          action: pending.action,
          revision: pending.release.revision,
        }),
      });
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
    return result.url;
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
      await navigator.clipboard.writeText(await getDownloadUrl(release));
      setMessage("Secure download link copied. It is valid for 60 seconds.");
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
      {error && (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      )}
      {message && <p role="status">{message}</p>}
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
                  {(publishedVisible(release) || canManage) && (
                    <>
                      <Button
                        variant="outline"
                        disabled={busy}
                        onClick={() => void download(release)}
                      >
                        Download
                      </Button>
                      <Button
                        variant="outline"
                        disabled={busy}
                        onClick={() => void copyDownloadLink(release)}
                      >
                        Copy URL
                      </Button>
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
                  {canManage && release.status !== "RETIRED" && (
                    <Button
                      variant="destructive"
                      disabled={busy}
                      onClick={() => setPending({ release, action: "retire" })}
                    >
                      Retire
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
            <DialogTitle>Add App APK</DialogTitle>
            <DialogDescription>
              Upload a signed APK. SelfX reads the app version, build number,
              supported architecture and minimum Android version directly from
              the file.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={upload} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="app-target">App</Label>
              <SelectMenu
                id="app-target"
                ariaLabel="App"
                value={uploadTarget}
                disabled={busy}
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
              Each upload creates an immutable draft APK card. Publishing is a
              separate step.
            </p>
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
                {busy ? "Validating APK…" : "Upload APK"}
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
              {pending
                ? `${pending.action[0]!.toUpperCase()}${pending.action.slice(1)} release?`
                : "Change release"}
            </DialogTitle>
            <DialogDescription>
              {pending?.action === "publish"
                ? "This APK will become available in the shared app downloads catalog."
                : pending?.action === "retire"
                  ? "This release will no longer be available for new downloads. Installed apps are unchanged."
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
            <Button disabled={busy} onClick={() => void act()}>
              {busy ? "Saving…" : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}
