"use client";

import type { ReactNode } from "react";

import { SelfxUiProvider, ToastProvider } from "@selfx/ui";

import { SessionProvider } from "@/lib/session";
import { RegionalSettingsProvider } from "@/lib/regional-settings";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <SelfxUiProvider>
      <ToastProvider>
        <SessionProvider>
          <RegionalSettingsProvider>{children}</RegionalSettingsProvider>
        </SessionProvider>
      </ToastProvider>
    </SelfxUiProvider>
  );
}
