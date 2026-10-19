"use client";

import { useEffect, useMemo, useState } from "react";
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
  // Resolve the server clock during this render, before Generate is clickable.
  // An effect-only offset briefly treated active QRs as expired on initial load.
  const anchor = useMemo(() => {
    const server = Date.parse(serverTime ?? "");
    const client = Date.now();
    return { server: Number.isFinite(server) ? server : client, client };
  }, [serverTime]);
  const now = anchor.server + Math.max(0, clock - anchor.client);
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
      Date.parse(test.expiresAt) > now &&
      (["PREPARING", "PENDING", "UNKNOWN"].includes(test.status) ||
        test.verificationPending ||
        test.failureCode === "PAYMENT_EVIDENCE_CONFLICT"),
  );
}
