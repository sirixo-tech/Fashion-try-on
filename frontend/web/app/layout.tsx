import type { Metadata } from "next";
import type { ReactNode } from "react";

import "@selfx/ui/globals.css";

import { Providers } from "@/app/providers";

export const metadata: Metadata = {
  title: "SelfX Virtual Try-On",
  description: "SelfX web administration shell",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/brand/selfx-logo.png", type: "image/png" },
      { url: "/kiosk/icon.svg", type: "image/svg+xml" },
    ],
    apple: [{ url: "/kiosk/icon.svg" }],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
