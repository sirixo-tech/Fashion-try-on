"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toDataURL } from "qrcode";
import { QrCodeIcon, DownloadIcon, RefreshCwIcon } from "lucide-react";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Badge,
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
  const [rows, setRows] = useState<StoreQr[]>([]);
  const [label, setLabel] = useState("In-store Try-On");
  const [limit, setLimit] = useState("5");
  const [qr, setQr] = useState<{ id: string; image: string } | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null);
  const key = `${accessToken}:${storeId}`;
  const active = useRef(key);
  active.current = key;
  const path = `/api/v1/admin/stores/${storeId}/mobile-qrs`;
  const load = useCallback(async () => {
    const data = await selfxApi<{ data: StoreQr[] }>(path, { accessToken });
    if (active.current === key) setRows(data.data);
  }, [path, accessToken, key]);
  useEffect(() => {
    let live = true;
    active.current = key;
    setBusy(false);
    setRows([]);
    setQr(null);
    setError(null);
    void load().catch((e) => {
      if (live)
        setError(
          e instanceof SafeApiError
            ? e.message
            : "Store QR codes could not be loaded.",
        );
    });
    return () => {
      live = false;
      active.current = "";
    };
  }, [load]);
  async function perform(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (e) {
      if (active.current === key)
        setError(
          e instanceof SafeApiError
            ? e.message
            : "The QR action could not be completed.",
        );
    } finally {
      if (active.current === key) setBusy(false);
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
          pay-as-you-go billing. Their personal credits are kept separate.
        </p>
        <p className="text-sm text-muted-foreground">
          The Store plan must include Mobile Store QR. Sessions last 2 hours.
          Daily limits apply per signed-in customer across all this Store’s
          codes.
        </p>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        {canManage && (
          <form
            className="grid items-end gap-3 sm:grid-cols-[1fr_12rem_auto]"
            onSubmit={(e) => {
              e.preventDefault();
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
                await load();
              });
            }}
          >
            <label className="grid gap-2 text-sm">
              Code name
              <Input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
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
                onChange={(e) => setLimit(e.target.value)}
                required
                disabled={busy}
              />
            </label>
            <Button type="submit" disabled={busy || !label.trim()}>
              Create Store QR
            </Button>
          </form>
        )}
        {qr && (
          <div className="grid gap-3 rounded-xl border bg-muted/20 p-4 sm:grid-cols-[12rem_1fr]">
            {/* Locally generated QR data URL, never a customer photograph. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={qr.image}
              width={192}
              height={192}
              alt="SelfX Store Try-On QR code"
            />
            <div className="space-y-3">
              <p className="text-sm">
                Download this code now. The access token is shown only when
                created. You can revoke the code and create another if you lose
                it.
              </p>
              <a
                href={qr.image}
                download={`SelfX-Store-QR-${qr.id}.png`}
                className="inline-flex items-center gap-2 text-sm font-medium underline underline-offset-4"
              >
                <DownloadIcon size={16} /> Download QR
              </a>
            </div>
          </div>
        )}
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Store codes</h3>
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => void perform(load)}
          >
            <RefreshCwIcon size={15} /> Refresh
          </Button>
        </div>
        {!rows.length && (
          <p className="text-sm text-muted-foreground">No Store codes yet.</p>
        )}
        <ul className="divide-y">
          {rows.map((row) => (
            <li
              key={row.id}
              className="flex flex-wrap items-center justify-between gap-3 py-3"
            >
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{row.label}</span>
                  <Badge variant="outline">
                    {row.revokedAt
                      ? "Revoked"
                      : new Date(row.expiresAt) <= new Date()
                        ? "Expired"
                        : "Active"}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  {row.dailyCustomerLimit} per customer / day · Expires{" "}
                  <RegionalDateTime value={row.expiresAt} />
                </p>
              </div>
              {canManage && !row.revokedAt && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={() =>
                    void perform(async () => {
                      await selfxApi(path + `/${row.id}`, {
                        accessToken,
                        method: "DELETE",
                      });
                      if (active.current !== key) return;
                      if (qr?.id === row.id) setQr(null);
                      await load();
                    })
                  }
                >
                  Revoke code
                </Button>
              )}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
