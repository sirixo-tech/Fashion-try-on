import type { Metadata } from "next";
import type { ReactNode } from "react";

import {
  ColorSchemeScript,
  SelfxUiProvider,
  mantineHtmlProps,
} from "@selfx/ui";
import "@selfx/ui/globals.css";

import { SessionProvider } from "@/lib/session";

export const metadata: Metadata = {
  title: "SelfX Virtual Try-On",
  description: "SelfX web administration shell",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="en" {...mantineHtmlProps}>
      <head>
        <ColorSchemeScript defaultColorScheme="light" />
      </head>
      <body>
        <SelfxUiProvider>
          <SessionProvider>{children}</SessionProvider>
        </SelfxUiProvider>
      </body>
    </html>
  );
}
