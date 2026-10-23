"use client";
import { useEffect, useState } from "react";
import { LoadingState } from "@selfx/ui";
import { CommerceTryOnPageClient } from "./commerce-try-on-page-client";
export function CommerceSessionPage() {
  const [session, setSession] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    const value = new URLSearchParams(window.location.hash.slice(1)).get(
      "session",
    );
    setSession(value);
    // Fragment capabilities do not enter HTTP/referrer logs; retain in this document only.
    window.history.replaceState(null, "", window.location.pathname);
  }, []);
  return session === undefined ? (
    <LoadingState label="Preparing Try-On" />
  ) : (
    <CommerceTryOnPageClient sessionToken={session} />
  );
}
