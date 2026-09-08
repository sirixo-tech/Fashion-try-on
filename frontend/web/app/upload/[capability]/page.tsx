import type { Metadata } from "next";

import { CustomerUploadPageClient } from "./upload-page-client";

export const metadata: Metadata = {
  title: "Add your photo | SelfX",
  referrer: "no-referrer",
};

export default async function CustomerUploadPage({
  params,
  searchParams,
}: {
  params: Promise<{ capability: string }>;
  searchParams: Promise<{ jewelleryType?: string | string[] }>;
}) {
  const { capability } = await params;
  const { jewelleryType } = await searchParams;
  return (
    <CustomerUploadPageClient
      capability={capability}
      jewelleryType={
        typeof jewelleryType === "string" ? jewelleryType : undefined
      }
    />
  );
}
