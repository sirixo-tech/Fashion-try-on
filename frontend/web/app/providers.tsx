"use client";

import type { ReactNode } from "react";

import { SelfxUiProvider } from "@selfx/ui";

import { SessionProvider } from "@/lib/session";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <SelfxUiProvider>
      <SessionProvider>{children}</SessionProvider>
    </SelfxUiProvider>
  );
}
