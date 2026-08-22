import type { Metadata } from "next";

import { LooksSharePageClient } from "./looks-share-page-client";

export const metadata: Metadata = {
  title: "Your Looks | SelfX",
  referrer: "no-referrer",
};

export default async function LooksSharePage({
  params,
}: {
  params: Promise<{ capability: string }>;
}) {
  const { capability } = await params;
  return <LooksSharePageClient capability={capability} />;
}
