import type { Metadata } from "next";
import type { ReactNode } from "react";

import { SelfxUiProvider } from "@selfx/ui";
import "@selfx/ui/globals.css";

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
    <html lang="en">
      <body>
        <SelfxUiProvider>{children}</SelfxUiProvider>
      </body>
    </html>
  );
}
