"use client";

import type { ReactNode } from "react";

export function SelfxUiProvider({
  children,
}: {
  children: ReactNode;
}) {
  return <>{children}</>;
}
