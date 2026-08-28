"use client";

import { useEffect, useState } from "react";

import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  cn,
} from "@selfx/ui";

import { SafeApiError } from "@/lib/api";
import {
  getPublicTryOnShare,
  publicTryOnLookDownloadUrl,
  type PublicTryOnShare,
} from "@/lib/try-on-share-api";

type PageState =
  | { status: "LOADING" }
  | { status: "READY"; share: PublicTryOnShare }
  | { status: "EXPIRED" }
  | { status: "INVALID" };

export function LooksSharePageClient({ capability }: { capability: string }) {
  const [state, setState] = useState<PageState>({ status: "LOADING" });
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [downloadingLookId, setDownloadingLookId] = useState<string | null>(
    null,
  );

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      getPublicTryOnShare(capability)
        .then((share) => {
          if (!cancelled) {
            setState({ status: "READY", share });
          }
        })
        .catch((error) => {
          if (cancelled) {
            return;
          }
          if (error instanceof SafeApiError && error.status === 410) {
            setState({ status: "EXPIRED" });
            return;
          }
          setState({ status: "INVALID" });
        });
    };
    load();
    const refreshTimer = window.setInterval(load, 4 * 60 * 1000);
    return () => {
      cancelled = true;
      window.clearInterval(refreshTimer);
    };
  }, [capability]);

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const remainingSeconds =
    state.status === "READY"
      ? Math.max(
          0,
          Math.ceil((Date.parse(state.share.expiresAt) - nowMs) / 1000),
        )
      : 0;
  const downloadExpired = state.status === "READY" && remainingSeconds <= 0;

  async function downloadLook(
    look: PublicTryOnShare["looks"][number],
    index: number,
  ) {
    if (downloadExpired || downloadingLookId) {
      return;
    }
    const url = publicTryOnLookDownloadUrl(capability, look.lookId);
    setDownloadingLookId(look.lookId);
    try {
      const response = await fetch(url, { cache: "no-store" });
      if (!response.ok) {
        throw new Error("Download request failed.");
      }
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = `selfx-look-${index + 1}${extensionFor(blob.type)}`;
      anchor.rel = "noreferrer";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    } catch {
      window.location.assign(url);
    } finally {
      setDownloadingLookId(null);
    }
  }

  return (
    <main className="min-h-screen bg-background px-4 py-6">
      <div className="mx-auto max-w-md">
        <div className="mb-6 flex justify-center">
          <img
            src="/brand/selfx-logo.png"
            alt="SelfX"
            className="h-14 w-auto max-w-48 object-contain"
          />
        </div>

        {state.status === "LOADING" ? (
          <ShareState title="Getting your looks..." />
        ) : state.status === "EXPIRED" ? (
          <ShareState title="This link has expired." />
        ) : state.status === "INVALID" ? (
          <ShareState title="This link is unavailable." />
        ) : state.share.looks.length === 0 ? (
          <ShareState title="No looks are available." />
        ) : (
          <div className="space-y-4">
            <FloatingDownloadTimer
              remainingSeconds={remainingSeconds}
              expired={downloadExpired}
            />
            <header className="text-center">
              <h1 className="text-3xl font-black tracking-normal">Your Looks</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                {downloadExpired
                  ? "Download link expired"
                  : `Available for ${mmss(remainingSeconds)}`}
              </p>
            </header>

            {state.share.looks.map((look, index) => (
              <Card key={look.lookId} className="overflow-hidden">
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg">Look {index + 1}</CardTitle>
                  {look.productName ? (
                    <CardDescription>{look.productName}</CardDescription>
                  ) : null}
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="overflow-hidden rounded-lg border bg-muted">
                    <img
                      src={look.imageReadUrl}
                      alt={`SelfX look ${index + 1}`}
                      className="max-h-[72vh] w-full object-contain"
                    />
                  </div>
                  <Button
                    className={cn(
                      "w-full",
                      downloadExpired && "pointer-events-none opacity-60",
                    )}
                    disabled={downloadExpired || downloadingLookId !== null}
                    aria-disabled={downloadExpired}
                    onClick={() => {
                      void downloadLook(look, index);
                    }}
                  >
                    {downloadExpired
                      ? "Download Expired"
                      : downloadingLookId === look.lookId
                        ? "Preparing..."
                        : "Download"}
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}

function extensionFor(contentType: string): string {
  const normalized = contentType.toLowerCase();
  if (normalized.includes("png")) {
    return ".png";
  }
  if (normalized.includes("webp")) {
    return ".webp";
  }
  return ".jpg";
}

function FloatingDownloadTimer({
  remainingSeconds,
  expired,
}: {
  remainingSeconds: number;
  expired: boolean;
}) {
  return (
    <div
      aria-live="polite"
      className={cn(
        "fixed left-3 top-24 z-50 rounded-xl border bg-white/95 px-3 py-2 shadow-lg backdrop-blur",
        "motion-safe:animate-pulse",
        expired
          ? "border-destructive/30 text-destructive"
          : "border-orange-200 text-orange-700",
      )}
    >
      <div className="text-[11px] font-black uppercase tracking-normal">
        Downloads
      </div>
      <div className="mt-0.5 flex items-center gap-1.5 text-sm font-black">
        <span aria-hidden="true" className="h-2 w-2 rounded-full bg-current" />
        <span>{expired ? "Expired" : mmss(remainingSeconds)}</span>
      </div>
    </div>
  );
}

function mmss(totalSeconds: number): string {
  const seconds = Math.max(0, totalSeconds);
  const minutes = Math.floor(seconds / 60).toString().padStart(2, "0");
  const rest = (seconds % 60).toString().padStart(2, "0");
  return `${minutes}:${rest}`;
}

function ShareState({ title }: { title: string }) {
  return (
    <Card>
      <CardContent className="py-8 text-center">
        <div className="font-semibold">{title}</div>
      </CardContent>
    </Card>
  );
}
