"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  Button,
  ConfirmDialog,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  PageContainer,
  PageHeader,
  PageSection,
  StatusBadge,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
} from "@selfx/ui";
import {
  getCurrentMerchantStoreAccess,
  hasStoreResourcePermission,
  type CurrentStoreAccess,
} from "@/lib/current-store";
import {
  changeStoreKioskState,
  listStoreKiosks,
  pairExistingStoreKiosk,
  pairStoreKiosk,
} from "@/lib/stores";
import { type KioskDevice } from "@/lib/kiosks";
import { useSession } from "@/lib/session";
import { SafeApiError } from "@/lib/api";

export default function KiosksPage() {
  const session = useSession();
  const token = session.status === "authenticated" ? session.accessToken : null;
  const [context, setContext] = useState<CurrentStoreAccess | null>(null);
  const [devices, setDevices] = useState<KioskDevice[]>([]);
  const [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const [busy, setBusy] = useState(false),
    [pairOpen, setPairOpen] = useState(false);
  const [pairingDevice, setPairingDevice] = useState<KioskDevice | null>(null);
  const [code, setCode] = useState(""),
    [name, setName] = useState("");
  const [pairError, setPairError] = useState("");
  const can = (permission: string) =>
    hasStoreResourcePermission(context?.permissions ?? null, permission);
  const storeId = context?.store?.id;

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError("");
    try {
      const access = await getCurrentMerchantStoreAccess(token);
      setContext(access);
      if (
        !access.store ||
        !hasStoreResourcePermission(access.permissions, "kiosks.view")
      ) {
        setDevices([]);
        setError("Store membership and kiosk viewing permission are required.");
        return;
      }
      setDevices(await listStoreKiosks(token, access.store.id));
    } catch (caught) {
      setDevices([]);
      setError(messageFor(caught));
    } finally {
      setLoading(false);
    }
  }, [token]);
  useEffect(() => {
    void load();
    const refresh = () => {
      setContext(null);
      setDevices([]);
      setPairOpen(false);
      void load();
    };
    window.addEventListener("selfx:impersonation-changed", refresh);
    return () =>
      window.removeEventListener("selfx:impersonation-changed", refresh);
  }, [load]);

  async function change(
    device: KioskDevice,
    action: "revoke" | "activate" | "deactivate" | "delete",
  ) {
    if (!token || !storeId || busy) return;
    setBusy(true);
    setError("");
    try {
      await changeStoreKioskState(token, storeId, device.id, action);
      await load();
    } catch (caught) {
      setError(messageFor(caught));
    } finally {
      setBusy(false);
    }
  }
  function openPair(device: KioskDevice | null) {
    setPairingDevice(device);
    setCode("");
    setName(device?.displayName ?? "");
    setPairError("");
    setPairOpen(true);
  }
  async function pair() {
    if (!token || !storeId || busy) return;
    const pairingCode = code.replace(/\s/g, "");
    if (!/^\d{6}$/.test(pairingCode)) {
      setPairError("Enter the six-digit code shown on the kiosk.");
      return;
    }
    setBusy(true);
    setPairError("");
    try {
      if (pairingDevice)
        await pairExistingStoreKiosk(
          token,
          storeId,
          pairingDevice.id,
          pairingCode,
        );
      else
        await pairStoreKiosk(token, storeId, {
          pairingCode,
          displayName: name.trim(),
        });
      setPairOpen(false);
      setCode("");
      await load();
    } catch (caught) {
      setPairError(messageFor(caught));
    } finally {
      setBusy(false);
    }
  }
  return (
    <PageContainer width="wide">
      <PageHeader
        eyebrow="Store kiosks"
        title="Kiosks"
        description={`Connect and manage kiosks for ${context?.store?.name ?? "your Store"}.`}
        actions={
          <div className="flex gap-2">
            <Button
              variant="outline"
              disabled={loading || busy}
              onClick={() => void load()}
            >
              Refresh
            </Button>
            <Button
              disabled={loading || busy || !can("kiosks.pair")}
              onClick={() => openPair(null)}
            >
              Pair New Kiosk
            </Button>
          </div>
        }
      />
      {error ? (
        <PageSection>
          <p role="alert" className="text-destructive">
            {error}
          </p>
        </PageSection>
      ) : null}
      <PageSection>
        <TableContainer
          title="Store devices"
          description="Enter the code shown on a physical kiosk to connect it to this Store."
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Device</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Device platform</TableHead>
                <TableHead>Last seen</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={5}>Loading kiosks…</TableCell>
                </TableRow>
              ) : devices.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5}>No kiosks paired yet.</TableCell>
                </TableRow>
              ) : (
                devices.map((device) => (
                  <TableRow key={device.id}>
                    <TableCell>{device.displayName}</TableCell>
                    <TableCell>
                      <StatusBadge status={device.status} />
                    </TableCell>
                    <TableCell>
                      {device.platform ?? "Unknown"}
                      {device.appVersion ? ` / ${device.appVersion}` : ""}
                    </TableCell>
                    <TableCell>
                      {device.lastSeenAt
                        ? new Date(device.lastSeenAt).toLocaleString()
                        : "Never"}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-2">
                        {can("kiosks.configure") ? (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={busy}
                            render={
                              <Link href={`/app/kiosks/${device.id}/edit`} />
                            }
                          >
                            Configure
                          </Button>
                        ) : null}
                        {device.status === "REVOKED" && can("kiosks.pair") ? (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={busy}
                            onClick={() => openPair(device)}
                          >
                            Pair again
                          </Button>
                        ) : null}
                        {device.status !== "REVOKED" && can("kiosks.update") ? (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={busy}
                            onClick={() =>
                              void change(
                                device,
                                device.status === "ACTIVE"
                                  ? "deactivate"
                                  : "activate",
                              )
                            }
                          >
                            {device.status === "ACTIVE"
                              ? "Deactivate"
                              : "Activate"}
                          </Button>
                        ) : null}
                        {device.status !== "REVOKED" && can("kiosks.revoke") ? (
                          <ConfirmDialog
                            title="Unpair kiosk?"
                            description="This revokes device sessions and returns the physical kiosk to its pairing screen. Its Store link and configuration are retained for re-pairing."
                            confirmLabel="Unpair"
                            destructive
                            onConfirm={() => change(device, "revoke")}
                            trigger={
                              <Button
                                variant="destructive"
                                size="sm"
                                disabled={busy}
                              >
                                Unpair
                              </Button>
                            }
                          />
                        ) : null}
                        {can("kiosks.revoke") ? (
                          <ConfirmDialog
                            title="Remove kiosk?"
                            description="This removes the kiosk from this Store's device list and revokes its sessions. Audit history remains."
                            confirmLabel="Remove"
                            destructive
                            onConfirm={() => change(device, "delete")}
                            trigger={
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={busy}
                              >
                                Remove
                              </Button>
                            }
                          />
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </PageSection>
      <Dialog
        open={pairOpen}
        onOpenChange={(open) => {
          if (!busy) setPairOpen(open);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {pairingDevice
                ? `Pair ${pairingDevice.displayName} again`
                : "Pair New Kiosk"}
            </DialogTitle>
            <DialogDescription>
              Enter the six-digit code shown on the physical kiosk. It will
              connect to {context?.store?.name}.
            </DialogDescription>
          </DialogHeader>
          {pairError ? (
            <p role="alert" className="text-destructive">
              {pairError}
            </p>
          ) : null}
          <div className="space-y-3">
            <Label htmlFor="pairing-code">Pairing Code</Label>
            <Input
              id="pairing-code"
              inputMode="numeric"
              autoComplete="off"
              maxLength={6}
              value={code}
              disabled={busy}
              onChange={(event) => setCode(event.target.value)}
            />
            {!pairingDevice ? (
              <>
                <Label htmlFor="kiosk-name">Kiosk name</Label>
                <Input
                  id="kiosk-name"
                  value={name}
                  maxLength={160}
                  disabled={busy}
                  onChange={(event) => setName(event.target.value)}
                />
              </>
            ) : null}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => setPairOpen(false)}
            >
              Cancel
            </Button>
            <Button
              disabled={
                busy ||
                !/^\d{6}$/.test(code) ||
                (!pairingDevice && !name.trim())
              }
              onClick={() => void pair()}
            >
              {busy ? "Pairing…" : "Pair Kiosk"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}
function messageFor(error: unknown) {
  return error instanceof SafeApiError
    ? error.message
    : "Could not complete the kiosk action. Try again.";
}
