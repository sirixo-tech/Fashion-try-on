import type { Metadata } from "next";
import { CommerceSessionPage } from "@/components/commerce/commerce-session-page";
export const metadata: Metadata = {
  title: "SelfX Try-On",
  description: "Try on a product with SelfX.",
  referrer: "no-referrer",
  robots: { index: false, follow: false },
};
export default function Page() {
  return <CommerceSessionPage />;
}
