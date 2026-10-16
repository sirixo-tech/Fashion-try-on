"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { toDataURL } from "qrcode";
import { FlaskConicalIcon, RefreshCwIcon, Settings2Icon } from "lucide-react";
import {
  Alert,
  AlertDescription,
  Badge,
  Button,
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  PageSection,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@selfx/ui";
import {
  listPaymentGateways,
  updatePaymentGateway,
  type Gateway,
} from "@/lib/payments";
import {
  checkPlatformPaymentTest,
  getPlatformPaymentTest,
  getPlatformPaymentWorkspace,
  savePlatformPhonePeTest,
  startPlatformPaymentTest,
  type PlatformPaymentTest,
  type PlatformPaymentTestDetail,
  type PlatformPaymentWorkspace,
} from "@/lib/platform-payment-tests";
import { PhonePeConfigurationForm } from "./phonepe-configuration";

const descriptions: Record<string, string> = {
  PHONEPE: "Dynamic UPI QR payments.",
  RAZORPAY: "Payments for India.",
  STRIPE: "Cards and international payments.",
  PAYTM: "UPI and merchant payments.",
  PAYPAL: "PayPal checkout.",
};
const testLabels = {
  NOT_CONFIGURED: "Needs setup",
  NOT_TESTED: "Not tested",
  PENDING: "Test pending",
  PASSED: "Test passed",
  FAILED: "Test failed",
  UNKNOWN: "Confirmation pending",
};

export function PlatformPaymentGateways({
  accessToken,
  canEdit,
}: {
  accessToken: string;
  canEdit: boolean;
}) {
  const [gateways, setGateways] = useState<Gateway[] | null>(null);
  const [workspace, setWorkspace] = useState<PlatformPaymentWorkspace | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null),
    [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false),
    [reload, setReload] = useState(0);
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const [editingCredentials, setEditingCredentials] = useState(false);
  const [savingCredentials, setSavingCredentials] = useState(false);
  const [checkingTest, setCheckingTest] = useState(false);
  const locked = busy || savingCredentials || checkingTest;
  const [selectedTest, setSelectedTest] =
    useState<PlatformPaymentTestDetail | null>(null);
  const startKey = useRef<string | null>(null);
  const refreshTestHistory = useCallback(
    (result: PlatformPaymentTestDetail) => {
      setSelectedTest(result);
      setReload((value) => value + 1);
    },
    [],
  );
  useEffect(() => {
    let current = true;
    setError(null);
    void Promise.all([
      listPaymentGateways(accessToken),
      getPlatformPaymentWorkspace(accessToken),
    ])
      .then(([list, tests]) => {
        if (current) {
          setGateways(list.data);
          setWorkspace(tests);
        }
      })
      .catch((caught) => {
        if (current) setError(message(caught));
      });
    return () => {
      current = false;
    };
  }, [accessToken, reload]);

  async function availability(gateway: Gateway, enabled: boolean) {
    if (locked || !canEdit || !gateway.setupAvailable) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      setGateways(
        (await updatePaymentGateway(accessToken, gateway, enabled)).data,
      );
      setNotice(
        `${gateway.name} Store setup ${enabled ? "enabled" : "disabled"}.`,
      );
    } catch (caught) {
      setError(message(caught));
    } finally {
      setBusy(false);
    }
  }
  async function start() {
    if (locked || !canEdit || !workspace?.connection) return;
    setBusy(true);
    setError(null);
    // Keep the same key after a browser/network error; do not create another test.
    startKey.current ??= crypto.randomUUID();
    try {
      const test = await startPlatformPaymentTest(
        accessToken,
        workspace.connection.version,
        startKey.current,
      );
      startKey.current = null;
      setSelectedTest(test);
      setReload((value) => value + 1);
    } catch (caught) {
      setError(message(caught));
    } finally {
      setBusy(false);
    }
  }
  async function openTest(id: string) {
    if (locked || !canEdit) return;
    setBusy(true);
    setError(null);
    try {
      setSelectedTest(await getPlatformPaymentTest(accessToken, id));
    } catch (caught) {
      setError(message(caught));
    } finally {
      setBusy(false);
    }
  }
  const currentPending =
    (selectedTest?.connectionVersion === workspace?.connection?.version &&
      !!selectedTest &&
      (["PREPARING", "PENDING", "UNKNOWN"].includes(selectedTest.status) ||
        selectedTest.verificationPending)) ||
    workspace?.tests.some(
      (test) =>
        test.connectionVersion === workspace.connection?.version &&
        (["PREPARING", "PENDING", "UNKNOWN"].includes(test.status) ||
          test.verificationPending ||
          test.failureCode === "PAYMENT_EVIDENCE_CONFLICT"),
    );
  const canStart =
    !!workspace?.connection?.dqrAccessConfirmed &&
    workspace.executionEnabled &&
    workspace.callbackConfigured &&
    !currentPending &&
    !editingCredentials;
  return (
    <PageSection>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-3xl text-sm text-muted-foreground">
          Choose which gateways Stores can configure. Each Store uses its own
          merchant account. Platform test credentials are kept separate.
        </p>
        <Button
          variant="outline"
          disabled={locked}
          onClick={() => setReload((value) => value + 1)}
        >
          <RefreshCwIcon aria-hidden="true" /> Refresh
        </Button>
      </div>
      {error && !workspaceOpen && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {notice && (
        <p role="status" className="text-sm">
          {notice}
        </p>
      )}
      {!gateways && !error && <p>Loading payment gateways…</p>}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {gateways?.map((gateway) => (
          <Card key={gateway.provider}>
            <CardHeader className="flex flex-row items-center gap-3">
              <GatewayMark provider={gateway.provider} />
              <div className="min-w-0 space-y-2">
                <CardTitle>{gateway.name}</CardTitle>
                <div className="flex flex-wrap gap-2">
                  <Badge
                    variant={
                      gateway.setupAvailable && gateway.enabled
                        ? "default"
                        : "outline"
                    }
                  >
                    {!gateway.setupAvailable
                      ? "Coming soon"
                      : gateway.enabled
                        ? "Available to Stores"
                        : "Store setup disabled"}
                  </Badge>
                  {gateway.provider === "PHONEPE" && workspace && (
                    <Badge variant="outline">
                      {testLabels[workspace.testStatus]}
                    </Badge>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                {descriptions[gateway.provider]}
              </p>
              <div className="flex items-center justify-between gap-4 rounded-lg border bg-muted/30 p-3">
                <div>
                  <p className="text-sm font-medium">Available to Stores</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Stores configure their own account when enabled.
                  </p>
                </div>
                <Switch
                  aria-label={`Make ${gateway.name} available to Stores`}
                  checked={gateway.enabled}
                  disabled={busy || !canEdit || !gateway.setupAvailable}
                  onCheckedChange={(enabled) =>
                    void availability(gateway, enabled)
                  }
                />
              </div>
            </CardContent>
            <CardFooter>
              <Button
                className="w-full"
                variant="outline"
                disabled={!gateway.setupAvailable}
                onClick={() => {
                  setError(null);
                  setSelectedTest(null);
                  setEditingCredentials(false);
                  setWorkspaceOpen(true);
                }}
              >
                <Settings2Icon aria-hidden="true" />
                {gateway.setupAvailable
                  ? canEdit
                    ? "Set up & test"
                    : "View test history"
                  : "Coming soon"}
              </Button>
            </CardFooter>
          </Card>
        ))}
      </div>
      {workspaceOpen && workspace && (
        <Dialog
          open
          onOpenChange={(open) => {
            if (!open && !locked) {
              setWorkspaceOpen(false);
              setSelectedTest(null);
              setEditingCredentials(false);
              setReload((value) => value + 1);
            }
          }}
        >
          <DialogContent
            className="max-h-[90dvh] overflow-y-auto sm:max-w-4xl"
            showCloseButton={!locked}
          >
            <DialogHeader>
              <DialogTitle>PhonePe platform testing</DialogTitle>
              <DialogDescription>
                Use confirmed UAT credentials and PhonePe test tooling. Tests do
                not create Store orders, reserve stock or enable live checkout.
              </DialogDescription>
            </DialogHeader>
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">UAT / test only</Badge>
              <Badge variant="outline">
                {testLabels[workspace.testStatus]}
              </Badge>
            </div>
            <section
              aria-label="Test account"
              className="space-y-4 rounded-lg border p-4"
            >
              <h3 className="font-medium">Test account</h3>
              {canEdit && (!workspace.connection || editingCredentials) ? (
                <>
                  <p className="text-sm text-muted-foreground">
                    Enter confirmed UAT credentials. Saving replaces the full
                    configuration; the Salt Key is never displayed again.
                  </p>
                  <PhonePeConfigurationForm
                    platformTest
                    disabled={busy || checkingTest}
                    onBusyChange={setSavingCredentials}
                    onCancel={() => {
                      if (workspace.connection) setEditingCredentials(false);
                      else setWorkspaceOpen(false);
                    }}
                    saveConfiguration={async (input) => {
                      const result = await savePlatformPhonePeTest(
                        accessToken,
                        workspace.connection?.version ?? 0,
                        input,
                      );
                      setWorkspace(result);
                      startKey.current = null;
                      setEditingCredentials(false);
                      setSelectedTest(null);
                      setNotice("Platform test configuration saved securely.");
                    }}
                  />
                </>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground">
                    {workspace.connection
                      ? `Configuration saved · version ${workspace.connection.version}. Credential values are never displayed.`
                      : "No platform test account configured."}
                  </p>
                  {canEdit && (
                    <Button
                      variant="outline"
                      disabled={locked}
                      onClick={() => {
                        setError(null);
                        setSelectedTest(null);
                        setEditingCredentials(true);
                      }}
                    >
                      Replace credentials
                    </Button>
                  )}
                </>
              )}
            </section>
            <ul className="space-y-1 text-sm text-muted-foreground">
              <li>
                UAT Dynamic QR access:{" "}
                {workspace.connection?.dqrAccessConfirmed
                  ? "Confirmed by administrator"
                  : "Not confirmed"}
              </li>
              <li>
                API test execution:{" "}
                {workspace.executionEnabled
                  ? "Enabled"
                  : "Disabled — configure the API UAT switch before testing"}
              </li>
              <li>
                HTTPS callback address:{" "}
                {workspace.callbackConfigured
                  ? "Configured"
                  : "Not configured on the API"}
              </li>
            </ul>
            {canEdit && (
              <Button
                disabled={locked || !canStart}
                onClick={() => void start()}
              >
                <FlaskConicalIcon aria-hidden="true" />
                {busy ? "Working…" : "Generate ₹1 test QR"}
              </Button>
            )}
            {currentPending && (
              <p className="text-sm text-muted-foreground">
                An existing test is awaiting confirmation. Open it below; do not
                start another payment.
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              A successful test does not verify any Store's account or switch on
              live payments. Callback delivery is tracked separately.
            </p>
            {selectedTest && canEdit && (
              <PlatformTestResult
                key={selectedTest.id}
                accessToken={accessToken}
                initial={selectedTest}
                disabled={busy || savingCredentials}
                onBusyChange={setCheckingTest}
                onResultChange={refreshTestHistory}
                onClose={() => {
                  setSelectedTest(null);
                  setReload((value) => value + 1);
                }}
              />
            )}
            <Collapsible className="rounded-lg border p-2">
              <CollapsibleTrigger disabled={locked}>
                Recent tests ({workspace.tests.length})
              </CollapsibleTrigger>
              <CollapsibleContent className="px-2 pb-2 pt-3">
                {!workspace.tests.length ? (
                  <p className="text-sm text-muted-foreground">
                    No tests yet. Saving credentials alone does not count as a
                    passed test.
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Created</TableHead>
                        <TableHead>Result</TableHead>
                        <TableHead>Callback</TableHead>
                        <TableHead>Account version</TableHead>
                        {canEdit && <TableHead>Details</TableHead>}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {workspace.tests.map((test) => (
                        <TableRow key={test.id}>
                          <TableCell>{date(test.createdAt)}</TableCell>
                          <TableCell>{resultLabel(test)}</TableCell>
                          <TableCell>
                            {test.callbackReceived
                              ? "Received and verified"
                              : "Not received"}
                          </TableCell>
                          <TableCell>{test.connectionVersion}</TableCell>
                          {canEdit && (
                            <TableCell>
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={locked}
                                onClick={() => void openTest(test.id)}
                              >
                                Open test
                              </Button>
                            </TableCell>
                          )}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CollapsibleContent>
            </Collapsible>
          </DialogContent>
        </Dialog>
      )}
    </PageSection>
  );
}

function PlatformTestResult({
  accessToken,
  initial,
  onClose,
  onBusyChange,
  onResultChange,
  disabled,
}: {
  accessToken: string;
  initial: PlatformPaymentTestDetail;
  onClose: () => void;
  onBusyChange: (busy: boolean) => void;
  onResultChange: (result: PlatformPaymentTestDetail) => void;
  disabled: boolean;
}) {
  const [test, setTest] = useState(initial),
    [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false),
    [qrImage, setQrImage] = useState<string | null>(null);
  const currentTest = useRef(initial);
  const checking = useRef(false);
  const requestVersion = useRef(0);
  const applyResult = useCallback(
    (result: PlatformPaymentTestDetail) => {
      const previous = currentTest.current;
      if (previous.status === "SUCCEEDED" && result.status !== "SUCCEEDED")
        return;
      currentTest.current = result;
      setTest(result);
      if (
        previous.status !== result.status ||
        previous.callbackReceived !== result.callbackReceived ||
        previous.verificationPending !== result.verificationPending
      )
        onResultChange(result);
    },
    [onResultChange],
  );
  useEffect(() => {
    let current = true,
      fetching = false;
    const timer = setInterval(() => {
      if (fetching || checking.current) return;
      fetching = true;
      const version = ++requestVersion.current;
      void getPlatformPaymentTest(accessToken, initial.id)
        .then((result) => {
          if (current && version === requestVersion.current)
            applyResult(result);
        })
        .catch((caught) => {
          if (current) {
            setError(message(caught));
            clearInterval(timer);
          }
        })
        .finally(() => {
          fetching = false;
        });
    }, 5000);
    return () => {
      current = false;
      clearInterval(timer);
    };
  }, [accessToken, initial.id, applyResult]);
  useEffect(() => {
    let current = true;
    setQrImage(null);
    if (test.qrString)
      void toDataURL(test.qrString, {
        width: 280,
        margin: 2,
        errorCorrectionLevel: "M",
      })
        .then((value) => {
          if (current) setQrImage(value);
        })
        .catch(() => {
          if (current)
            setError(
              "The QR could not be displayed. Reopen this test; do not generate another payment.",
            );
        });
    return () => {
      current = false;
    };
  }, [test.qrString]);
  async function check() {
    if (busy || disabled) return;
    checking.current = true;
    ++requestVersion.current;
    setBusy(true);
    onBusyChange(true);
    setError(null);
    try {
      applyResult(await checkPlatformPaymentTest(accessToken, test.id));
    } catch (caught) {
      setError(message(caught));
    } finally {
      checking.current = false;
      setBusy(false);
      onBusyChange(false);
    }
  }
  return (
    <section
      aria-label="PhonePe test result"
      className="space-y-4 rounded-lg border p-4"
    >
      <h3 className="font-medium">PhonePe test result</h3>
      <p className="text-sm text-muted-foreground">
        ₹1.00 · UAT only. Use PhonePe's supported test tooling.
      </p>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <Badge variant={test.status === "SUCCEEDED" ? "default" : "outline"}>
        {resultLabel(test)}
      </Badge>
      {qrImage && test.qrString && (
        <Image
          unoptimized
          src={qrImage}
          width={280}
          height={280}
          alt="PhonePe UAT test payment QR"
          className="mx-auto rounded-lg bg-white"
        />
      )}
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
        <dt className="text-muted-foreground">Test ID</dt>
        <dd className="break-all">{test.id}</dd>
        <dt className="text-muted-foreground">QR deadline</dt>
        <dd>{date(test.expiresAt)}</dd>
        <dt className="text-muted-foreground">Callback</dt>
        <dd>
          {test.callbackReceived ? "Received and verified" : "Not received"}
        </dd>
        <dt className="text-muted-foreground">Last status check</dt>
        <dd>{test.checkedAt ? date(test.checkedAt) : "Not checked yet"}</dd>
        {test.nextCheckAt && (
          <>
            <dt className="text-muted-foreground">Next scheduled check</dt>
            <dd>{date(test.nextCheckAt)}</dd>
          </>
        )}
        {test.providerReference && (
          <>
            <dt className="text-muted-foreground">Provider reference</dt>
            <dd className="break-all">{test.providerReference}</dd>
          </>
        )}
      </dl>
      <p className="text-sm text-muted-foreground">{guidance(test)}</p>
      <div className="flex flex-wrap gap-2">
        <Button
          disabled={busy || disabled || test.status === "SUCCEEDED"}
          onClick={() => void check()}
        >
          {busy ? "Checking…" : "Check payment status"}
        </Button>
        <Button variant="outline" disabled={busy || disabled} onClick={onClose}>
          Hide result
        </Button>
      </div>
    </section>
  );
}
function GatewayMark({ provider }: { provider: string }) {
  const marks: Record<string, { text: string; color: string }> = {
    PHONEPE: { text: "Pe", color: "text-purple-700 bg-purple-50" },
    RAZORPAY: { text: "R", color: "text-blue-700 bg-blue-50" },
    STRIPE: { text: "S", color: "text-indigo-600 bg-indigo-50" },
    PAYTM: { text: "Pay", color: "text-sky-700 bg-sky-50" },
    PAYPAL: { text: "P", color: "text-blue-800 bg-blue-50" },
  };
  const mark = marks[provider];
  return (
    <span
      aria-hidden="true"
      className={`grid size-12 shrink-0 place-items-center rounded-xl border font-heading text-lg font-bold ${mark?.color ?? "bg-muted text-foreground"}`}
    >
      {mark?.text ?? provider[0]}
    </span>
  );
}
function resultLabel(test: PlatformPaymentTest) {
  if (
    test.verificationPending ||
    test.failureCode === "PAYMENT_EVIDENCE_CONFLICT"
  )
    return "Confirmation pending";
  return {
    PREPARING: "Preparing",
    PENDING: "Payment pending",
    UNKNOWN: "Confirmation pending",
    FAILED: "Test failed",
    SUCCEEDED: "Test passed",
  }[test.status];
}
function guidance(test: PlatformPaymentTest) {
  if (test.status === "SUCCEEDED")
    return test.callbackReceived
      ? "Payment success and authenticated callback delivery were observed for this test."
      : "Payment success was verified by status check. Callback delivery has not been observed yet.";
  if (test.failureCode === "PAYMENT_EVIDENCE_CONFLICT")
    return "The notification and status response disagree. Verification continues; do not start another payment.";
  if (test.status === "FAILED")
    return "PhonePe confirmed failure for this test. Inspect your UAT account and test scenario before trying again.";
  return "Payment is not confirmed yet. An expired QR or a network timeout does not prove failure. Background checks continue; use Open test to resume after leaving this page.";
}
function date(value: string) {
  return new Date(value).toLocaleString();
}
function message(caught: unknown) {
  return caught instanceof Error
    ? caught.message
    : "Payment testing could not be completed.";
}
