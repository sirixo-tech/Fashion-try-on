"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  PencilIcon,
  MonitorIcon,
  PlusIcon,
  RefreshCwIcon,
  ShieldAlertIcon,
  Trash2Icon,
} from "lucide-react";

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
  TableHead,
  TableHeader,
  TableRow,
  TableContainer,
} from "@selfx/ui";

import { SafeApiError } from "@/lib/api";
import {
  deleteKioskDevice,
  listKioskAssignmentOptions,
  listKioskDevices,
  pairExistingKioskDevice,
  pairKioskDevice,
  requestKioskCatalogSync,
  unpairKioskDevice,
  type KioskAssignmentOptions,
  type KioskAssignmentScope,
  type KioskDevice,
} from "@/lib/kiosks";
import { useSession } from "@/lib/session";

const assignmentScopes: KioskAssignmentScope[] = ["PLATFORM", "ORGANIZATION"];

export default function KiosksPage() {
  const session = useSession();
  const accessToken =
    session.status === "authenticated" ? session.accessToken : null;
  const [devices, setDevices] = useState<KioskDevice[]>([]);
  const [options, setOptions] = useState<KioskAssignmentOptions>({
    organizations: [],
    stores: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pairOpen, setPairOpen] = useState(false);
  const [pairingDevice, setPairingDevice] = useState<KioskDevice | null>(null);

  const load = useCallback(async () => {
    if (!accessToken) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [nextDevices, nextOptions] = await Promise.all([
        listKioskDevices(accessToken),
        listKioskAssignmentOptions(accessToken),
      ]);
      setDevices(nextDevices);
      setOptions(nextOptions);
    } catch (caught) {
      setError(messageFor(caught));
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    void load();
  }, [load]);

  const refreshAndSyncCatalog = useCallback(async () => {
    if (!accessToken) {
      return;
    }
    try {
      await requestKioskCatalogSync(accessToken);
    } catch {
      // Some operators can view kiosks without catalog-sync permission.
    }
    await load();
  }, [accessToken, load]);

  const activeCount = devices.filter(
    (device) => device.status === "ACTIVE",
  ).length;

  return (
    <PageContainer width="wide">
      <PageHeader
        eyebrow="Platform fleet"
        title="Kiosks"
        description="Pair and manage SelfX kiosk devices before production device-authenticated Try-On endpoints arrive."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => void refreshAndSyncCatalog()}
            >
              <RefreshCwIcon aria-hidden="true" />
              Refresh
            </Button>
            <Button onClick={() => setPairOpen(true)}>
              <PlusIcon aria-hidden="true" />
              Pair New Kiosk
            </Button>
          </div>
        }
        status={<StatusBadge status="ACTIVE" label={`${activeCount} active`} />}
      />

      <PageSection>
        <TableContainer
          title="Fleet devices"
          description="Kiosks belong to the SelfX platform fleet and may be assigned to platform or Store scope."
        >
          {error ? (
            <div className="flex items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
              <ShieldAlertIcon size={18} aria-hidden="true" />
              {error}
            </div>
          ) : null}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Device</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Assignment</TableHead>
                <TableHead>Platform</TableHead>
                <TableHead>Last Seen</TableHead>
                <TableHead>Paired</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={7}>Loading kiosks...</TableCell>
                </TableRow>
              ) : devices.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7}>
                    <div className="flex items-center gap-3 py-8 text-muted-foreground">
                      <MonitorIcon size={20} aria-hidden="true" />
                      No kiosks paired yet.
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                devices.map((device) => (
                  <TableRow key={device.id}>
                    <TableCell>
                      <div className="font-medium">{device.displayName}</div>
                      <div className="text-xs text-muted-foreground">
                        {device.id}
                      </div>
                    </TableCell>
                    <TableCell>
                      <StatusBadge
                        status={device.status}
                        label={device.status}
                      />
                    </TableCell>
                    <TableCell>{assignmentLabel(device)}</TableCell>
                    <TableCell>
                      {device.platform ?? "Unknown"}
                      {device.appVersion ? ` / ${device.appVersion}` : ""}
                    </TableCell>
                    <TableCell>{formatDate(device.lastSeenAt)}</TableCell>
                    <TableCell>{formatDate(device.pairedAt)}</TableCell>
                    <TableCell className="text-right">
                      <KioskLifecycleActions
                        device={device}
                        onPair={() => setPairingDevice(device)}
                        onUnpair={() => void unpair(device.id)}
                        onDelete={() => void remove(device.id)}
                      />
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </PageSection>

      <PairKioskDialog
        open={pairOpen}
        options={options}
        onOpenChange={setPairOpen}
        onPaired={(device) => {
          setDevices((current) => [device, ...current]);
          setPairOpen(false);
        }}
      />
      <PairExistingKioskDialog
        device={pairingDevice}
        onOpenChange={(open) => {
          if (!open) {
            setPairingDevice(null);
          }
        }}
        onPaired={(updatedDevice) => {
          setDevices((current) =>
            current.map((device) =>
              device.id === updatedDevice.id
                ? updatedDevice
                : device,
            ),
          );
          setPairingDevice(null);
        }}
      />
    </PageContainer>
  );

  async function unpair(deviceId: string) {
    await updateDevice((token) => unpairKioskDevice(token, deviceId));
  }

  async function remove(deviceId: string) {
    await updateDevice((token) => deleteKioskDevice(token, deviceId), {
      removeFromList: true,
    });
  }

  async function updateDevice(
    action: (accessToken: string) => Promise<KioskDevice>,
    options: { removeFromList?: boolean } = {},
  ) {
    if (session.status !== "authenticated") {
      return;
    }
    setError(null);
    try {
      const updated = await action(session.accessToken);
      setDevices((current) =>
        options.removeFromList
          ? current.filter((device) => device.id !== updated.id)
          : current.map((device) =>
              device.id === updated.id ? updated : device,
            ),
      );
    } catch (caught) {
      setError(messageFor(caught));
    }
  }
}

function KioskLifecycleActions({
  device,
  onPair,
  onUnpair,
  onDelete,
}: {
  device: KioskDevice;
  onPair: () => void;
  onUnpair: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex flex-wrap justify-end gap-2">
      <Button
        variant="outline"
        size="sm"
        render={<Link href={`/app/kiosks/${device.id}/edit`} />}
      >
        <PencilIcon aria-hidden="true" />
        Edit
      </Button>
      {device.status !== "REVOKED" ? (
        <ConfirmDialog
          title="Unpair kiosk?"
          description="This unpairs the kiosk, revokes active device sessions, and sends the physical display back to the pairing screen so it can show a new code."
          confirmLabel="Unpair"
          destructive
          onConfirm={onUnpair}
          trigger={
            <Button variant="destructive" size="sm">
              Unpair
            </Button>
          }
        />
      ) : (
        <Button variant="outline" size="sm" onClick={onPair}>
          <PlusIcon aria-hidden="true" />
          Pair
        </Button>
      )}
      <ConfirmDialog
        title="Delete kiosk?"
        description="This removes the kiosk from the fleet list and revokes any remaining device sessions. Audit history is retained."
        confirmLabel="Delete"
        onConfirm={onDelete}
        trigger={
          <Button variant="outline" size="sm">
            <Trash2Icon aria-hidden="true" />
            Delete
          </Button>
        }
      />
    </div>
  );
}

function PairKioskDialog({
  open,
  options,
  onOpenChange,
  onPaired,
}: {
  open: boolean;
  options: KioskAssignmentOptions;
  onOpenChange: (open: boolean) => void;
  onPaired: (device: KioskDevice) => void;
}) {
  const session = useSession();
  const [pairingCode, setPairingCode] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [assignmentScope, setAssignmentScope] =
    useState<KioskAssignmentScope>("PLATFORM");
  const [organizationId, setOrganizationId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const stores = options.organizations;

  async function submit() {
    if (session.status !== "authenticated") {
      return;
    }
    const canonicalCode = pairingCode.replace(/\s/g, "");
    if (!/^\d{6}$/.test(canonicalCode)) {
      setError("Pairing code expired or invalid.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const device = await pairKioskDevice(session.accessToken, {
        pairingCode: canonicalCode,
        displayName,
        assignmentScope,
        ...(assignmentScope !== "PLATFORM" ? { organizationId } : {}),
      });
      onPaired(device);
      setPairingCode("");
      setDisplayName("");
      setAssignmentScope("PLATFORM");
      setOrganizationId("");
    } catch (caught) {
      setError(messageFor(caught));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Pair New Kiosk</DialogTitle>
          <DialogDescription>
            Enter the six-digit code shown on the physical kiosk.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {error ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              {error}
            </div>
          ) : null}
          <div className="space-y-2">
            <Label htmlFor="pairing-code">Pairing Code</Label>
            <Input
              id="pairing-code"
              value={pairingCode}
              inputMode="numeric"
              placeholder="482 731"
              maxLength={7}
              onChange={(event) => setPairingCode(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="device-name">Device Name</Label>
            <Input
              id="device-name"
              value={displayName}
              maxLength={160}
              onChange={(event) => setDisplayName(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="assignment-scope">Assignment Scope</Label>
            <select
              id="assignment-scope"
              className="h-10 w-full rounded-md border bg-background px-3 text-sm"
              value={assignmentScope}
              onChange={(event) => {
                setAssignmentScope(event.target.value as KioskAssignmentScope);
                setOrganizationId("");
              }}
            >
              {assignmentScopes.map((scope) => (
                <option key={scope} value={scope}>
                  {scope === "ORGANIZATION" ? "STORE" : scope}
                </option>
              ))}
            </select>
          </div>
          {assignmentScope !== "PLATFORM" ? (
            <div className="space-y-2">
              <Label htmlFor="organization">Store</Label>
              <select
                id="organization"
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                value={organizationId}
                onChange={(event) => setOrganizationId(event.target.value)}
              >
                <option value="">Select Store</option>
                {stores.map((store) => (
                  <option key={store.id} value={store.id}>
                    {store.name}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={submitting || !displayName.trim()} onClick={submit}>
            Pair
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PairExistingKioskDialog({
  device,
  onOpenChange,
  onPaired,
}: {
  device: KioskDevice | null;
  onOpenChange: (open: boolean) => void;
  onPaired: (device: KioskDevice) => void;
}) {
  const session = useSession();
  const [pairingCode, setPairingCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const open = device !== null;

  function close() {
    setPairingCode("");
    setError(null);
    onOpenChange(false);
  }

  async function submit() {
    if (session.status !== "authenticated" || !device) {
      return;
    }
    const canonicalCode = pairingCode.replace(/\s/g, "");
    if (!/^\d{6}$/.test(canonicalCode)) {
      setError("Pairing code expired or invalid.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const updatedDevice = await pairExistingKioskDevice(
        session.accessToken,
        device.id,
        { pairingCode: canonicalCode },
      );
      setPairingCode("");
      onPaired(updatedDevice);
    } catch (caught) {
      setError(messageFor(caught));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          setPairingCode("");
          setError(null);
        }
        onOpenChange(nextOpen);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Pair Kiosk</DialogTitle>
          <DialogDescription>
            Enter the six-digit code shown on the physical kiosk to connect it
            to {device?.displayName ?? "this kiosk"}.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {error ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              {error}
            </div>
          ) : null}
          <div className="space-y-2">
            <Label htmlFor="existing-pairing-code">Pairing Code</Label>
            <Input
              id="existing-pairing-code"
              value={pairingCode}
              inputMode="numeric"
              placeholder="482 731"
              maxLength={7}
              onChange={(event) => setPairingCode(event.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={close}>
            Cancel
          </Button>
          <Button disabled={submitting || !device} onClick={submit}>
            Pair
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function assignmentLabel(device: KioskDevice): string {
  if (device.assignment.scope === "PLATFORM") {
    return "Platform";
  }
  if (device.assignment.scope === "ORGANIZATION") {
    return device.assignment.organizationName ?? "Store";
  }
  return [
    device.assignment.organizationName ?? "Store",
    device.assignment.storeName ?? "Store",
  ].join(" / ");
}

function formatDate(value: string | null): string {
  return value ? new Date(value).toLocaleString() : "-";
}

function messageFor(caught: unknown): string {
  if (caught instanceof SafeApiError) {
    return caught.message;
  }
  return "The kiosk request could not be completed.";
}
