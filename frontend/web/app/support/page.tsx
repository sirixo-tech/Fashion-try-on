import type { Metadata } from "next";

import { PublicLegalLinks } from "@/components/public-legal-links";
import { supportEmail, supportMailto } from "@/lib/public-contact";

export const metadata: Metadata = {
  title: "Support | SelfX Virtual Try-On",
  description:
    "Contact SelfX support for Shopify setup, product sync, virtual try-on, and account help.",
};

export default function SupportPage() {
  return (
    <main className="min-h-dvh bg-background px-4 py-10 text-foreground">
      <section className="mx-auto max-w-3xl space-y-8">
        <header className="space-y-3">
          <p className="text-sm font-medium uppercase tracking-[0.08em] text-muted-foreground">
            SelfX Virtual Try-On
          </p>
          <h1 className="text-4xl font-semibold tracking-tight">Support</h1>
          <p className="leading-7 text-muted-foreground">
            Need help with SelfX, Shopify setup, product sync, or virtual
            try-on? Contact us and include the details below so we can respond
            quickly.
          </p>
        </header>

        <div className="rounded-lg border bg-card p-6 shadow-sm">
          <h2 className="text-xl font-semibold">Contact Email</h2>
          <p className="mt-3 text-muted-foreground">
            Email us at{" "}
            <a className="font-medium text-primary underline" href={supportMailto}>
              {supportEmail}
            </a>
            .
          </p>
          <p className="mt-3 text-sm text-muted-foreground">
            We aim to respond to support requests within two business days.
          </p>
        </div>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">What To Include</h2>
          <ul className="list-disc space-y-2 pl-6 leading-7 text-muted-foreground">
            <li>Your SelfX Store name.</li>
            <li>Your Shopify shop domain, such as example.myshopify.com.</li>
            <li>The product URL or product handle involved.</li>
            <li>
              A short description of the issue, including any error message.
            </li>
            <li>
              Screenshots or a screen recording if the issue is visual or
              storefront-related.
            </li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">Common Requests</h2>
          <ul className="list-disc space-y-2 pl-6 leading-7 text-muted-foreground">
            <li>Connecting or reconnecting a Shopify store to SelfX.</li>
            <li>Syncing Shopify products into SelfX.</li>
            <li>Adding the SelfX Try-On block to product pages.</li>
            <li>Testing garment or jewellery Try-On flows.</li>
            <li>Privacy, deletion, or account access requests.</li>
          </ul>
        </section>

        <footer className="border-t pt-6">
          <PublicLegalLinks />
        </footer>
      </section>
    </main>
  );
}
