"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { toDataURL } from "qrcode";
import { Alert, AlertDescription, Badge, Button } from "@selfx/ui";
import { getStorePaymentTest, checkStorePaymentTest } from "@/lib/payments";
import {
  getPlatformPaymentTest,
  checkPlatformPaymentTest,
  type PlatformPaymentTest,
  type PlatformPaymentTestDetail,
} from "@/lib/platform-payment-tests";

export function PaymentTestResult({
  accessToken,
  initial,
  onClose,
  onBusyChange,
  onResultChange,
  disabled,
  storeId,
  closeLabel = "Hide result",
}: {
  accessToken: string;
  initial: PlatformPaymentTestDetail;
  onClose: () => void;
  onBusyChange: (busy: boolean) => void;
  onResultChange: (result: PlatformPaymentTestDetail) => void;
  disabled: boolean;
  storeId?: string;
  closeLabel?: string;
}) {
  const [test, setTest] = useState(initial),
    [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false),
    [qrImage, setQrImage] = useState<string | null>(null);
  const currentTest = useRef(initial);
  const [clock, setClock] = useState(Date.now());
  const serverClock = useRef({
    client: Date.now(),
    server: Number.isFinite(Date.parse(initial.serverTime))
      ? Date.parse(initial.serverTime)
      : Date.now(),
  });
  const remaining = Math.max(
    0,
    Math.ceil(
      (Date.parse(test.expiresAt) -
        (serverClock.current.server +
          Math.max(0, clock - serverClock.current.client))) /
        1000,
    ),
  );
  useEffect(() => {
    const timer = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
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
        previous.verificationPending !== result.verificationPending ||
        previous.failureCode !== result.failureCode
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
      void (
        storeId
          ? getStorePaymentTest(accessToken, storeId, initial.id)
          : getPlatformPaymentTest(accessToken, initial.id)
      )
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
  }, [accessToken, initial.id, applyResult, storeId]);
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
    if (busy || disabled || checking.current) return;
    checking.current = true;
    ++requestVersion.current;
    setBusy(true);
    onBusyChange(true);
    setError(null);
    try {
      applyResult(
        await (storeId
          ? checkStorePaymentTest(accessToken, storeId, test.id)
          : checkPlatformPaymentTest(accessToken, test.id)),
      );
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
      <h3 className="font-medium">
        {test.environment === "PRODUCTION"
          ? "PhonePe live verification result"
          : "PhonePe test result"}
      </h3>
      <p className="text-sm text-muted-foreground">
        {test.environment === "PRODUCTION"
          ? "₹1.00 · Production. Paying this QR transfers real money to the configured merchant account."
          : "₹1.00 · UAT only. Use PhonePe's supported test tooling."}
      </p>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <Badge variant={test.status === "SUCCEEDED" ? "default" : "outline"}>
        {resultLabel(test)}
      </Badge>
      {busy && <p role="status">Checking payment confirmation…</p>}
      {test.status === "PENDING" && test.qrString && remaining > 0 && (
        <p role="timer" aria-label="QR time remaining">
          QR expires in {Math.floor(remaining / 60)}:
          {String(remaining % 60).padStart(2, "0")}
        </p>
      )}
      {test.status !== "SUCCEEDED" && remaining === 0 && (
        <p>
          QR expired. You can generate a fresh test QR. This test stays in
          history and continues checking for delayed payment confirmation.
        </p>
      )}
      {qrImage &&
        test.qrString &&
        test.status === "PENDING" &&
        remaining > 0 && (
          <Image
            unoptimized
            src={qrImage}
            width={280}
            height={280}
            alt={
              test.environment === "PRODUCTION"
                ? "PhonePe live verification payment QR"
                : "PhonePe UAT test payment QR"
            }
            className="mx-auto rounded-lg bg-white"
          />
        )}
      {["PREPARING", "PENDING", "UNKNOWN"].includes(test.status) &&
        !test.qrString && (
          <p>
            No usable QR is available for this test. Check its status and review
            the diagnostic below.
          </p>
        )}
      {test.status === "UNKNOWN" &&
        !test.diagnostics?.initialization &&
        !test.diagnostics?.status && (
          <p>
            No diagnostic was recorded for this earlier request. Check this same
            test to capture the latest status-check reason.
          </p>
        )}
      {test.diagnostics && (
        <div className="space-y-3">
          {(["initialization", "status"] as const).map((stage) => {
            const diagnostic = test.diagnostics?.[stage];
            return diagnostic ? (
              <Alert key={stage}>
                <AlertDescription>
                  <strong>
                    {stage === "initialization"
                      ? "QR generation attempt"
                      : "Latest status check"}
                    :
                  </strong>{" "}
                  {diagnostic.message}
                  <span className="mt-1 block text-xs">
                    Reference: {diagnostic.code}
                    {diagnostic.httpStatus
                      ? ` · HTTP ${diagnostic.httpStatus}`
                      : ""}
                    {diagnostic.providerCode
                      ? ` · ${diagnostic.providerCode}`
                      : ""}
                  </span>
                </AlertDescription>
              </Alert>
            ) : null;
          })}
        </div>
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
          {closeLabel}
        </Button>
      </div>
    </section>
  );
}
function resultLabel(test: PlatformPaymentTest) {
  if (test.environment === "PRODUCTION" && test.status === "SUCCEEDED")
    return "Live verification passed";
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
    return "PhonePe confirmed failure for this verification. Review the account configuration and payment result before trying again.";
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
