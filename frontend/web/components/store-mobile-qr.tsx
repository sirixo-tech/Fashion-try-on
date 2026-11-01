"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toDataURL } from "qrcode";
import {
  DownloadIcon,
  QrCodeIcon,
  Share2Icon,
  XIcon,
} from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Input,
} from "@selfx/ui";
import { selfxApi, SafeApiError } from "@/lib/api";
import { RegionalDateTime } from "@/lib/regional-settings";

interface StoreQr {
  id: string;
  label: string;
  dailyCustomerLimit: number;
  expiresAt: string;
  revokedAt: string | null;
  createdAt: string;
}

export function StoreMobileQr({
  accessToken,
  storeId,
  canManage,
}: {
  accessToken: string;
  storeId: string;
  canManage: boolean;
}) {
  const [current, setCurrent] = useState<StoreQr | null>(null);
  const [label, setLabel] = useState("In-store Try-On");
  const [limit, setLimit] = useState("5");
  const [qr, setQr] = useState<{ id: string; image: string } | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const key = `${accessToken}:${storeId}`;
  const active = useRef(key);
  active.current = key;
  const path = `/api/v1/admin/stores/${storeId}/mobile-qrs`;

  const load = useCallback(async () => {
    const data = await selfxApi<{ data: StoreQr[] }>(path, { accessToken });
    if (active.current === key) setCurrent(data.data[0] ?? null);
  }, [path, accessToken, key]);

  useEffect(() => {
    let live = true;
    active.current = key;
    setBusy(false);
    setCurrent(null);
    setQr(null);
    setDialogOpen(false);
    setError(null);
    setNotice(null);
    void load().catch((caught: unknown) => {
      if (live)
        setError(
          caught instanceof SafeApiError
            ? caught.message
            : "Store QR could not be loaded.",
        );
    });
    return () => {
      live = false;
      active.current = "";
    };
  }, [load, key]);

  async function perform(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await action();
    } catch (caught) {
      if (active.current === key)
        setError(
          caught instanceof SafeApiError
            ? caught.message
            : "The Store QR action could not be completed.",
        );
    } finally {
      if (active.current === key) setBusy(false);
    }
  }

  async function shareQr() {
    if (!qr) return;
    try {
      const blob = await (await fetch(qr.image)).blob();
      const file = new File([blob], `SelfX-Store-QR-${qr.id}.png`, {
        type: "image/png",
      });
      if (
        !navigator.share ||
        !navigator.canShare?.({ files: [file] })
      ) {
        setNotice(
          "Sharing QR images is not available in this browser. Download the QR to share it.",
        );
        return;
      }
      await navigator.share({
        title: "SelfX Store Try-On QR",
        text: "Scan this QR in the SelfX app to explore this Store’s eligible products.",
        files: [file],
      });
    } catch (caught) {
      if (caught instanceof Error && caught.name === "AbortError") return;
      setError("The QR could not be shared. Download it to share manually.");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <QrCodeIcon size={20} /> Mobile Store QR
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <p className="text-sm text-muted-foreground">
          Customers scan this code in the SelfX mobile app to see this Store’s
          eligible products. Successful Try-Ons use this Store’s allowance or
          pay-as-you-go billing; personal credits stay separate.
        </p>
        <p className="text-sm text-muted-foreground">
          The Store plan must include Mobile Store QR. Sessions last 2 hours.
          One active QR is allowed per Store; creating a replacement disables
          the previous code.
        </p>

        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
        {notice ? (
          <p role="status" className="text-sm text-muted-foreground">
            {notice}
          </p>
        ) : null}

        {current ? (
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border bg-muted/20 p-4">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{current.label}</span>
                <Badge variant="outline">Active</Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                {current.dailyCustomerLimit} Try-Ons per customer / day · Expires{" "}
                <RegionalDateTime value={current.expiresAt} />
              </p>
              <p className="text-xs text-muted-foreground">
                The QR is shown once when created. Replace it to generate and
                share a fresh code.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {qr?.id === current.id ? (
                <Button
                  variant="outline"
                  onClick={() => setDialogOpen(true)}
                  disabled={busy}
                >
                  <QrCodeIcon size={16} /> View QR
                </Button>
              ) : null}
              {canManage ? (
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() =>
                    void perform(async () => {
                      await selfxApi(path + `/${current.id}`, {
                        accessToken,
                        method: "DELETE",
                      });
                      if (active.current !== key) return;
                      setQr(null);
                      setDialogOpen(false);
                      await load();
                    })
                  }
                >
                  <XIcon size={16} /> Revoke QR
                </Button>
              ) : null}
            </div>
          </div>
        ) : (
          <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
            No active Store QR. Create one to display it and share or download
            the image.
          </p>
        )}

        {canManage ? (
          <form
            className="grid items-end gap-3 sm:grid-cols-[minmax(0,1fr)_12rem_auto]"
            onSubmit={(event) => {
              event.preventDefault();
              void perform(async () => {
                const result = await selfxApi<StoreQr & { payload: string }>(
                  path,
                  {
                    accessToken,
                    method: "POST",
                    body: JSON.stringify({
                      label: label.trim(),
                      dailyCustomerLimit: Number(limit),
                    }),
                  },
                );
                const image = await toDataURL(result.payload, {
                  width: 640,
                  margin: 3,
                  errorCorrectionLevel: "M",
                });
                if (active.current !== key) return;
                setQr({ id: result.id, image });
                setDialogOpen(true);
                await load();
              });
            }}
          >
            <label className="grid gap-2 text-sm">
              Code name
              <Input
                value={label}
                onChange={(event) => setLabel(event.target.value)}
                maxLength={100}
                required
                disabled={busy}
              />
            </label>
            <label className="grid gap-2 text-sm">
              Try-Ons per customer / day
              <Input
                type="number"
                min={1}
                max={100}
                value={limit}
                onChange={(event) => setLimit(event.target.value)}
                required
                disabled={busy}
              />
            </label>
            <Button type="submit" disabled={busy || !label.trim()}>
              {busy
                ? "Creating…"
                : current
                  ? "Replace active QR"
                  : "Create Store QR"}
            </Button>
          </form>
        ) : null}

        <Dialog
          open={dialogOpen && Boolean(qr)}
          onOpenChange={setDialogOpen}
        >
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Store QR ready</DialogTitle>
              <DialogDescription>
                Share or download this code. Replacing it will deactivate this
                QR.
              </DialogDescription>
            </DialogHeader>
            {qr ? (
              <div className="space-y-5 text-center">
                {/* Locally generated QR image; only its hashed token is stored. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={qr.image}
                  width={288}
                  height={288}
                  alt="SelfX Store Try-On QR code"
                  className="mx-auto size-72 max-w-full rounded-lg border bg-white p-3"
                />
                <div className="grid grid-cols-2 gap-3">
                  <a
                    href={qr.image}
                    download={`SelfX-Store-QR-${qr.id}.png`}
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-input bg-background px-4 text-sm font-medium hover:bg-accent hover:text-accent-foreground"
                  >
                    <DownloadIcon size={16} /> Download
                  </a>
                  <Button onClick={() => void shareQr()}>
                    <Share2Icon size={16} /> Share
                  </Button>
                </div>
              </div>
            ) : null}
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
