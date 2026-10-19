"use client";

import { useEffect, useState } from "react";
import type {
  PlatformPaymentTest,
  PlatformPaymentTestDetail,
} from "@/lib/platform-payment-tests";

// The server still enforces expiry and account scope when starting a test.
// This clock updates the action at expiry without requiring a page refresh.
export function useActivePaymentTest(
  workspace: {
    connection: { version: number } | null;
    tests: PlatformPaymentTest[];
    serverTime?: string;
  } | null,
  selected: PlatformPaymentTestDetail | null,
): PlatformPaymentTest | undefined {
  const serverTime = workspace?.serverTime ?? selected?.serverTime;
  const [clock, setClock] = useState(Date.now());
  const [offset, setOffset] = useState(0);
  useEffect(() => {
    const server = Date.parse(serverTime ?? "");
    setOffset(Number.isFinite(server) ? server - Date.now() : 0);
    setClock(Date.now());
  }, [serverTime]);
  useEffect(() => {
    const timer = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const tests =
    workspace?.tests.filter((test) => test.id !== selected?.id) ?? [];
  if (selected) tests.unshift(selected);
  return tests.find(
    (test) =>
      test.connectionVersion === workspace?.connection?.version &&
      Date.parse(test.expiresAt) > clock + offset &&
      (["PREPARING", "PENDING", "UNKNOWN"].includes(test.status) ||
        test.verificationPending ||
        test.failureCode === "PAYMENT_EVIDENCE_CONFLICT"),
  );
}
