import type { Metadata } from "next";

import { CustomerUploadPageClient } from "./upload-page-client";

export const metadata: Metadata = {
  title: "Add your photo | SelfX",
  referrer: "no-referrer",
};

export default async function CustomerUploadPage({
  params,
}: {
  params: Promise<{ capability: string }>;
}) {
  const { capability } = await params;
  return <CustomerUploadPageClient capability={capability} />;
}
