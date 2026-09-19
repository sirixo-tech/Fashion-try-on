import type { Metadata } from "next";

import { WebKioskClient } from "@/components/web-kiosk-client";

export const metadata: Metadata = {
  title: "SelfX Kiosk",
  description: "Customer-facing SelfX kiosk web app",
};

export default function KioskPage() {
  return <WebKioskClient />;
}
