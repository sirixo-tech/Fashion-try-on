"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  AlertDescription,
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  SectionCard,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@selfx/ui";
import {
  getStorePaymentWorkspace,
  getStorePaymentTest,
  startStorePaymentTest,
  type StorePaymentWorkspace,
} from "@/lib/payments";
import type { PlatformPaymentTestDetail } from "@/lib/platform-payment-tests";
import { PaymentTestResult } from "./payment-test-result";
import { useActivePaymentTest } from "./use-active-payment-test";

const labels = {
  NOT_CONFIGURED: "Not configured",
  NOT_TESTED: "Configured · Not tested",
  PENDING: "Test pending",
  PASSED: "Test passed",
  FAILED: "Test failed",
  UNKNOWN: "Confirmation pending",
};

export function StorePaymentVerification({
  accessToken,
  storeId,
  canEdit,
  enabled,
  disabled = false,
}: {
  accessToken: string;
  storeId: string;
  canEdit: boolean;
  enabled: boolean;
  disabled?: boolean;
}) {
  const [workspace, setWorkspace] = useState<StorePaymentWorkspace | null>(
    null,
  );
  const [selected, setSelected] = useState<PlatformPaymentTestDetail | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false),
    [dialogError, setDialogError] = useState<string | null>(null);
  const [operation, setOperation] = useState<"GENERATE" | "OPEN">("GENERATE");
  const openId = useRef<string | null>(null);
  const inFlight = useRef(false);
  const [busy, setBusy] = useState(false),
    [checking, setChecking] = useState(false),
    [revision, setRevision] = useState(0);
  const startKey = useRef<string | null>(null);
  const locked = busy || checking || disabled;
  useEffect(() => {
    let current = true;
    void getStorePaymentWorkspace(accessToken, storeId)
      .then((value) => {
        if (current) setWorkspace(value);
      })
      .catch((caught) => {
        if (current) setError(message(caught));
      });
    return () => {
      current = false;
    };
  }, [accessToken, storeId, revision]);
  const update = useCallback((value: PlatformPaymentTestDetail) => {
    setSelected(value);
    setRevision((old) => old + 1);
  }, []);
  const activeTest = useActivePaymentTest(workspace, selected);
  const live = workspace?.connection?.environment === "PRODUCTION";
  const popupLive = selected ? selected.environment === "PRODUCTION" : live;
  const ready =
    enabled &&
    (live
      ? workspace?.productionEndpointConfigured
      : workspace?.connection?.environment === "UAT" &&
        workspace.connection.dqrAccessConfirmed) &&
    workspace?.executionEnabled &&
    workspace?.callbackConfigured;
  async function start() {
    if (activeTest && !startKey.current) {
      await open(activeTest.id);
      return;
    }
    if (
      locked ||
      inFlight.current ||
      !canEdit ||
      (!ready && !startKey.current) ||
      !workspace?.connection
    )
      return;
    inFlight.current = true;
    setOperation("GENERATE");
    setDialogOpen(true);
    setDialogError(null);
    setSelected(null);
    setBusy(true);
    setError(null);
    startKey.current ??= crypto.randomUUID();
    try {
      update(
        await startStorePaymentTest(
          accessToken,
          storeId,
          workspace.connection.version,
          startKey.current,
        ),
      );
      startKey.current = null;
    } catch (caught) {
      setDialogError(message(caught));
      setRevision((value) => value + 1);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  async function open(id: string) {
    if (locked || inFlight.current || !canEdit) return;
    inFlight.current = true;
    openId.current = id;
    setOperation("OPEN");
    setDialogOpen(true);
    setDialogError(null);
    setSelected(null);
    setBusy(true);
    setError(null);
    try {
      setSelected(await getStorePaymentTest(accessToken, storeId, id));
      startKey.current = null;
    } catch (caught) {
      setDialogError(message(caught));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  return (
    <SectionCard
      title="PhonePe account verification"
      description={
        live
          ? "Verify this Store's saved production account with a ₹1 real payment. This does not create an order or enable customer checkout."
          : "Test this Store's saved account. Tests do not create orders, reserve stock or enable live checkout."
      }
    >
      <div className="space-y-4">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
            {!workspace && (
              <Button
                variant="outline"
                disabled={locked}
                onClick={() => {
                  setError(null);
                  setRevision((old) => old + 1);
                }}
              >
                Retry verification
              </Button>
            )}
          </Alert>
        )}
        {!workspace ? (
          error ? null : (
            <p>Loading account verification…</p>
          )
        ) : (
          <>
            <div className="flex flex-wrap gap-2">
              <Badge
                variant={
                  workspace.testStatus === "PASSED" ? "default" : "outline"
                }
              >
                {live && workspace.testStatus === "PASSED"
                  ? "Live verification passed"
                  : labels[workspace.testStatus]}
              </Badge>
              <Badge variant="outline">
                {live
                  ? "Customer checkout: Not enabled"
                  : "Live payments: Not enabled"}
              </Badge>
            </div>
            {workspace.connection?.environment !== "UAT" && !live && (
              <p>
                Configure production credentials or confirmed UAT credentials
                before account verification.
              </p>
            )}
            {!live && !workspace.connection?.dqrAccessConfirmed && (
              <p>
                Dynamic QR test access has not been confirmed for this Store
                account.
              </p>
            )}
            {!workspace.executionEnabled && (
              <p>
                {live
                  ? "Live account verification has not been enabled by SelfX."
                  : "Payment testing has not been enabled by SelfX."}
              </p>
            )}
            {live && !workspace.productionEndpointConfigured && (
              <p>
                PhonePe's production Dynamic QR endpoint must be confirmed and
                configured by SelfX before a live QR can be generated.
              </p>
            )}
            {live && (
              <p>
                Scanning and paying this verification QR transfers ₹1 in real
                money to the configured merchant account.
              </p>
            )}
            {!workspace.callbackConfigured && (
              <p>
                Payment confirmation setup is incomplete. Contact SelfX support.
              </p>
            )}
            {!enabled && (
              <p>
                PhonePe setup and new tests are disabled by the platform.
                Existing tests can still be inspected.
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              {canEdit && (
                <Button
                  disabled={locked || !ready}
                  onClick={() => void start()}
                >
                  {busy
                    ? "Please wait…"
                    : live
                      ? "Generate ₹1 live verification QR"
                      : "Generate ₹1 test QR"}
                </Button>
              )}
              <Button
                variant="outline"
                disabled={locked}
                onClick={() => {
                  setError(null);
                  setRevision((old) => old + 1);
                }}
              >
                Refresh verification
              </Button>
            </div>
            {activeTest && (
              <p className="text-sm text-muted-foreground">
                An unexpired test already exists. Generate reopens that test; a
                fresh QR can be generated after its deadline.
              </p>
            )}
            <p className="text-sm text-muted-foreground">
              {live
                ? "A successful live verification applies only to this Store's saved production configuration. It does not enable customer checkout."
                : "A passed UAT test verifies only this saved Store configuration. It does not verify live credentials or another Store's account."}{" "}
              Callback delivery is shown separately in each result.
            </p>
            <h3 className="font-medium">Recent Store tests</h3>
            {!workspace.tests.length ? (
              <p>No tests yet. Saving credentials is not a passed test.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Created</TableHead>
                    <TableHead>Configuration</TableHead>
                    <TableHead>Environment</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {workspace.tests.map((test) => (
                    <TableRow key={test.id}>
                      <TableCell>
                        {new Date(test.createdAt).toLocaleString()}
                      </TableCell>
                      <TableCell>
                        {test.connectionVersion ===
                        workspace.connection?.version
                          ? "Current account"
                          : "Previous account configuration"}
                      </TableCell>
                      <TableCell>
                        {test.environment === "PRODUCTION"
                          ? "Production / real payment"
                          : "UAT / test"}
                      </TableCell>
                      <TableCell>
                        {test.verificationPending
                          ? "Confirmation pending"
                          : test.status === "SUCCEEDED"
                            ? test.environment === "PRODUCTION"
                              ? "Live verification passed"
                              : "Test passed"
                            : test.status}
                      </TableCell>
                      <TableCell>
                        {canEdit && (
                          <Button
                            variant="outline"
                            disabled={locked}
                            onClick={() => void open(test.id)}
                          >
                            Open test
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </>
        )}
      </div>
      {canEdit && (
        <Dialog
          open={dialogOpen}
          onOpenChange={(value) => {
            if (!locked && !inFlight.current) setDialogOpen(value);
          }}
        >
          <DialogContent
            className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl"
            showCloseButton={!locked}
          >
            <DialogHeader>
              <DialogTitle>
                {popupLive
                  ? "PhonePe live account verification"
                  : "PhonePe test payment"}
              </DialogTitle>
              <DialogDescription>
                {popupLive
                  ? "₹1.00 real payment using this Store's saved production merchant account."
                  : "₹1.00 UAT test for this Store."}{" "}
                Closing keeps the verification in Recent Store tests.
              </DialogDescription>
            </DialogHeader>
            {busy && (
              <p role="status">
                {operation === "GENERATE"
                  ? "Generating your test QR…"
                  : "Opening saved test…"}
              </p>
            )}
            {dialogError && (
              <Alert variant="destructive">
                <AlertDescription>{dialogError}</AlertDescription>
                <p className="mt-2 text-sm">
                  {operation === "GENERATE"
                    ? "The request outcome may be uncertain. Retry the same request or open its saved test. A fresh QR is available after that test's QR deadline."
                    : "Retry opening this saved test."}
                </p>
                <Button
                  variant="outline"
                  disabled={locked}
                  onClick={() =>
                    operation === "GENERATE"
                      ? void start()
                      : openId.current
                        ? void open(openId.current)
                        : undefined
                  }
                >
                  {operation === "GENERATE"
                    ? "Retry same request"
                    : "Retry opening test"}
                </Button>
              </Alert>
            )}
            {selected && (
              <PaymentTestResult
                key={selected.id}
                accessToken={accessToken}
                storeId={storeId}
                initial={selected}
                disabled={locked}
                onBusyChange={setChecking}
                onResultChange={update}
                onClose={() => setDialogOpen(false)}
                closeLabel="Close test"
              />
            )}
            {!selected && !busy && (
              <Button
                variant="outline"
                disabled={locked}
                onClick={() => setDialogOpen(false)}
              >
                Close
              </Button>
            )}
          </DialogContent>
        </Dialog>
      )}
    </SectionCard>
  );
}
function message(caught: unknown) {
  return caught instanceof Error
    ? caught.message
    : "Account verification could not be loaded.";
}
