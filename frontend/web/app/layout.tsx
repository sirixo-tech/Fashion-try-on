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
      { url: "/brand/selfx-favicon-32.png", type: "image/png", sizes: "32x32" },
      { url: "/brand/selfx-icon-192.png", type: "image/png", sizes: "192x192" },
    ],
    shortcut: "/favicon.ico",
    apple: [
      {
        url: "/brand/selfx-apple-touch-icon.png",
        sizes: "180x180",
        type: "image/png",
      },
    ],
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
