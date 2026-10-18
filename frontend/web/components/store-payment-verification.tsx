"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  AlertDescription,
  Badge,
  Button,
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
  const pending =
    (selected?.connectionVersion === workspace?.connection?.version &&
      !!selected &&
      (["PREPARING", "PENDING", "UNKNOWN"].includes(selected.status) ||
        selected.verificationPending ||
        selected.failureCode === "PAYMENT_EVIDENCE_CONFLICT")) ||
    workspace?.tests.some(
      (test) =>
        test.connectionVersion === workspace.connection?.version &&
        (["PREPARING", "PENDING", "UNKNOWN"].includes(test.status) ||
          test.verificationPending ||
          test.failureCode === "PAYMENT_EVIDENCE_CONFLICT"),
    );
  const ready =
    enabled &&
    workspace?.connection?.environment === "UAT" &&
    workspace.connection.dqrAccessConfirmed &&
    workspace.executionEnabled &&
    workspace.callbackConfigured &&
    !pending;
  async function start() {
    if (locked || !canEdit || !ready || !workspace?.connection) return;
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
      setError(message(caught));
    } finally {
      setBusy(false);
    }
  }
  async function open(id: string) {
    if (locked || !canEdit) return;
    setBusy(true);
    setError(null);
    try {
      setSelected(await getStorePaymentTest(accessToken, storeId, id));
    } catch (caught) {
      setError(message(caught));
    } finally {
      setBusy(false);
    }
  }
  return (
    <SectionCard
      title="PhonePe account verification"
      description="Test this Store's saved account. Tests do not create orders, reserve stock or enable live checkout."
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
                {labels[workspace.testStatus]}
              </Badge>
              <Badge variant="outline">Live payments: Not enabled</Badge>
            </div>
            {workspace.connection?.environment !== "UAT" && (
              <p>
                Configure confirmed UAT credentials before testing. Live and
                unconfirmed accounts cannot generate test QRs.
              </p>
            )}
            {!workspace.connection?.dqrAccessConfirmed && (
              <p>
                Dynamic QR test access has not been confirmed for this Store
                account.
              </p>
            )}
            {!workspace.executionEnabled && (
              <p>Payment testing has not been enabled by SelfX.</p>
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
                  {busy ? "Please wait…" : "Generate ₹1 test QR"}
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
            {selected && canEdit && (
              <PaymentTestResult
                key={selected.id}
                accessToken={accessToken}
                storeId={storeId}
                initial={selected}
                disabled={locked}
                onBusyChange={setChecking}
                onResultChange={update}
                onClose={() => setSelected(null)}
              />
            )}
            <p className="text-sm text-muted-foreground">
              A passed UAT test verifies only this saved Store configuration. It
              does not verify live credentials or another Store's account.
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
                        {test.verificationPending
                          ? "Confirmation pending"
                          : test.status === "SUCCEEDED"
                            ? "Test passed"
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
    </SectionCard>
  );
}
function message(caught: unknown) {
  return caught instanceof Error
    ? caught.message
    : "Account verification could not be loaded.";
}
