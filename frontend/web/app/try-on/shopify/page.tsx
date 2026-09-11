import type { Metadata } from "next";

import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  SelfxLogo,
} from "@selfx/ui";

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
  const source = firstParam(params.source);
  const shop = firstParam(params.shop);
  const externalProductId = firstParam(params.externalProductId);
  const productHandle = firstParam(params.productHandle);
  const hasProductContext = Boolean(productHandle || externalProductId);
  const valid = source === "shopify" && Boolean(shop) && hasProductContext;

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-4 py-8">
      <Card className="w-full max-w-md">
        <CardHeader>
          <SelfxLogo />
          <CardTitle className="pt-4 text-3xl">SelfX Try-On</CardTitle>
          <CardDescription>
            {valid
              ? "Your Shopify product is ready for virtual try-on."
              : "This Try-On link is missing product details."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {valid ? (
            <>
              <div className="rounded-lg border bg-muted px-4 py-3">
                <div className="text-xs font-semibold uppercase tracking-normal text-muted-foreground">
                  Product
                </div>
                <div className="mt-1 break-words text-sm font-medium">
                  {productHandle || externalProductId}
                </div>
              </div>
              <Button className="w-full" disabled>
                Start Try-On
              </Button>
              <p className="text-center text-sm text-muted-foreground">
                The full storefront Try-On runtime is coming soon.
              </p>
            </>
          ) : (
            <div className="rounded-lg border bg-muted px-4 py-5">
              <div className="font-semibold">Invalid Try-On link</div>
              <p className="mt-1 text-sm text-muted-foreground">
                Return to the product page and select Try It On again.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </main>
  );
}

function firstParam(value: string | string[] | undefined): string | null {
  const first = Array.isArray(value) ? value[0] : value;
  const clean = first?.trim();
  return clean ? clean : null;
}
