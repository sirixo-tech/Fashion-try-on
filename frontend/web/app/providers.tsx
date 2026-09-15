"use client";

import type { ReactNode } from "react";

import { SelfxUiProvider, ToastProvider } from "@selfx/ui";

import { SessionProvider } from "@/lib/session";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <SelfxUiProvider>
      <ToastProvider>
        <SessionProvider>{children}</SessionProvider>
      </ToastProvider>
    </SelfxUiProvider>
  );
}
