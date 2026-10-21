"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  EmptyState,
  Input,
  Label,
  LoadingState,
  PageContainer,
  PageHeader,
  SectionCard,
  Textarea,
  Badge,
} from "@selfx/ui";
import { selfxApi } from "@/lib/api";
import { getCurrentPlatformAccess } from "@/lib/access-control";
import { getCurrentMerchantStoreAccess } from "@/lib/current-store";
import { useSession } from "@/lib/session";
import { RegionalDateTime } from "@/lib/regional-settings";

type Release = {
  uploadedBy?: { displayName: string | null; email: string } | null;
  id: string;
  versionName: string;
  versionCode: number;
  architecture: string;
  packageName: string;
  filename: string;
  minSdk: number;
  sha256: string;
  signerSha256: string;
  sizeBytes: number;
  releaseNotes: string;
  status: "DRAFT" | "PUBLISHED" | "RETIRED";
  recommended: boolean;
  revision: number;
  createdAt: string;
  publishedAt: string | null;
};
type ReleasePage = {
  data: Release[];
  nextCursor: string | null;
  hasMore: boolean;
};
export function AppReleasesPage({ platform = false }: { platform?: boolean }) {
  const session = useSession(),
    token = session.accessToken;
  const [base, setBase] = useState(""),
    [canManage, setCanManage] = useState(false);
  const [page, setPage] = useState<ReleasePage>({
    data: [],
    nextCursor: null,
    hasMore: false,
  });
  const [cursor, setCursor] = useState<string | undefined>(),
    [previous, setPrevious] = useState<Array<string | undefined>>([]);
  const [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [file, setFile] = useState<File | null>(null),
    [notes, setNotes] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<{
    release: Release;
    action: "publish" | "recommend" | "retire";
  } | null>(null);
  const [message, setMessage] = useState("");
  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError("");
    try {
      let path = "";
      if (platform) {
        const access = await getCurrentPlatformAccess(token);
        const manage =
          access.isSuperadmin ||
          access.permissions.includes("APP_RELEASES_MANAGE");
        if (
          !manage &&
          !access.isSuperadmin &&
          !access.permissions.includes("APP_RELEASES_VIEW")
        )
          throw new Error(
            "Platform app release viewing permission is required.",
          );
        setCanManage(manage);
        path = "/api/v1/platform/app-releases";
      } else {
        const access = await getCurrentMerchantStoreAccess(token);
        if (!access.store)
          throw new Error("Select an active Store with kiosk access.");
        path = `/api/v1/admin/stores/${access.store.id}/app-releases`;
      }
      setBase(path);
      setPage(
        await selfxApi<ReleasePage>(
          `${path}?pageSize=12${cursor ? `&cursor=${cursor}` : ""}`,
          { accessToken: token },
        ),
      );
    } catch (caught) {
      setBase("");
      setCanManage(false);
      setPage({ data: [], nextCursor: null, hasMore: false });
      setError(
        caught instanceof Error
          ? caught.message
          : "App releases could not be loaded.",
      );
    } finally {
      setLoading(false);
    }
  }, [token, platform, cursor]);
  useEffect(() => {
    void load();
  }, [load]);
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
      body.set("releaseNotes", notes);
      body.set("apk", file);
      await selfxApi(base, { method: "POST", accessToken: token, body });
      setFile(null);
      setNotes("");
      if (fileInput.current) fileInput.current.value = "";
      setMessage(
        "APK validated and saved as a draft. Review it before publishing.",
      );
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
  async function download(release: Release) {
    if (!token || busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await selfxApi<{ url: string }>(
        `${base}/${release.id}/download`,
        { method: "POST", accessToken: token },
      );
      const link = document.createElement("a");
      link.href = result.url;
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
  return (
    <PageContainer>
      <PageHeader
        title={platform ? "Apps & Downloads" : "Download Kiosk APK"}
        description={
          platform
            ? "Manage SelfX Kiosk App releases. Publishing makes a release available to eligible Stores."
            : "Install a published SelfX Kiosk App build that matches your Android device."
        }
        actions={
          <Button
            variant="outline"
            disabled={loading || busy}
            onClick={() => void load()}
          >
            Refresh
          </Button>
        }
      />
      {error && (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      )}
      {message && <p role="status">{message}</p>}
      {platform && canManage && (
        <SectionCard
          title="Upload kiosk APK"
          description="Upload a signed standalone release APK, up to 200 MiB. Package, version, architecture and checksum are verified by SelfX."
        >
          <form onSubmit={upload} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="release-apk">APK file</Label>
              <Input
                ref={fileInput}
                id="release-apk"
                type="file"
                accept=".apk,application/vnd.android.package-archive"
                disabled={busy}
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
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
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
            <Button type="submit" disabled={busy || !file}>
              {busy ? "Processing…" : "Upload draft"}
            </Button>
          </form>
        </SectionCard>
      )}
      {loading ? (
        <LoadingState label="Loading app releases" />
      ) : page.data.length === 0 && !error ? (
        <EmptyState
          title="No releases available"
          description={
            platform
              ? "Upload a validated APK draft to get started."
              : "A SelfX administrator will publish kiosk APKs here when available."
          }
        />
      ) : (
        <div className="grid gap-5 xl:grid-cols-2">
          {page.data.map((release) => (
            <SectionCard
              key={release.id}
              title={`SelfX Kiosk ${release.versionName}`}
              description={`${release.architecture} · Version code ${release.versionCode} · Android API ${release.minSdk}+`}
            >
              <div className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline">{release.status}</Badge>
                  {release.recommended && (
                    <Badge>Recommended for {release.architecture}</Badge>
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
                  {platform && release.uploadedBy && (
                    <div>
                      <dt className="text-muted-foreground">Uploaded by</dt>
                      <dd className="break-all">
                        {release.uploadedBy.displayName ||
                          release.uploadedBy.email}
                      </dd>
                    </div>
                  )}
                </dl>
                <div>
                  <p className="text-xs text-muted-foreground">
                    SHA-256 checksum
                  </p>
                  <code className="break-all text-xs">{release.sha256}</code>
                </div>
                {release.releaseNotes && (
                  <p className="whitespace-pre-wrap text-sm">
                    {release.releaseNotes}
                  </p>
                )}
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    disabled={busy}
                    onClick={() => void download(release)}
                  >
                    Download
                  </Button>
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
        Installing a download is manual. Uploading or publishing does not update
        installed kiosks automatically.
      </p>
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
                ? `${pending.action.charAt(0).toUpperCase() + pending.action.slice(1)} release?`
                : "Change release"}
            </DialogTitle>
            <DialogDescription>
              {pending?.action === "publish"
                ? "This APK will become available to eligible Stores."
                : pending?.action === "retire"
                  ? "This release will no longer be available for new Store downloads. Installed kiosks are unchanged."
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
