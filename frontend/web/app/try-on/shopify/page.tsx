import type { Metadata } from "next";

import { ShopifyTryOnPageClient } from "./shopify-try-on-page-client";

export const metadata: Metadata = {
  title: "SelfX Try-On",
  description: "Start a SelfX virtual try-on from Shopify.",
  referrer: "no-referrer",
};

type SearchParams = Record<string, string | string[] | undefined>;

export default async function ShopifyTryOnPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  return <ShopifyTryOnPageClient sessionToken={firstParam(params.session)} />;
}

function firstParam(value: string | string[] | undefined): string | null {
  const first = Array.isArray(value) ? value[0] : value;
  const clean = first?.trim();
  return clean ? clean : null;
}
