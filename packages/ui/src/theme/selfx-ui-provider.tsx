"use client";

import { MantineProvider, type MantineProviderProps } from "@mantine/core";
import type { ReactNode } from "react";

import { selfxTheme } from "./selfx-theme";

export function SelfxUiProvider({
  children,
  ...props
}: Omit<MantineProviderProps, "theme"> & { children: ReactNode }) {
  return (
    <MantineProvider theme={selfxTheme} defaultColorScheme="light" {...props}>
      {children}
    </MantineProvider>
  );
}
