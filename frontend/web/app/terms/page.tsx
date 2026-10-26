import type { Metadata } from "next";
import { PublicLegalLinks } from "@/components/public-legal-links";
import { supportEmail, supportMailto } from "@/lib/public-contact";

export const metadata: Metadata = {
  title: "Terms | SelfX Virtual Try-On",
  description:
    "Terms for SelfX customer accounts, virtual Try-On, free trials and Store-sponsored sessions.",
};
const sections = [
  [
    "Using SelfX",
    "SelfX provides AI-generated visual previews of clothing and accessories. Results can differ from a physical garment, its details, fit or appearance. A preview does not guarantee sizing, availability or a purchase outcome. Follow the merchant’s own product, payment and return terms for purchases from that merchant.",
  ],
  [
    "Accounts and authorized images",
    "Keep your account credentials and verification codes private. Provide accurate account information. Upload only images you own or are authorized to use, with the permission of people shown. Do not upload unlawful, exploitative, abusive or non-consensual material, impersonate another person, or attempt to bypass access controls, quotas or service protections.",
  ],
  [
    "Free trials and personal plans",
    "Personal trial credits are granted once to an eligible SelfX customer account according to the configured allowance. A generation reserves one credit and uses it when a result is saved. A failed generation releases its reservation. Deleting photos or reinstalling the app does not reset used trial credits. Personal paid products are separate from Store subscriptions and are offered only when their price and purchase terms are available for approval. No paid subscription is created by accepting these Terms.",
  ],
  [
    "Store QR sponsorship",
    "A participating Store’s QR opens a Store-specific session with its eligible products and displayed limits. The Store is the payer for admitted Store-sponsored Try-Ons. Personal credits are not silently used if the Store’s allowance or daily limit is exhausted. The session and code can expire or be revoked. Store-session consent describes permitted access to generated results; original person photos remain private from merchant staff.",
  ],
  [
    "Photos, results and deletion",
    "Original customer photos, outfit captures and sensitive provider inputs expire within seven days. Mobile saved generated results expire within 30 days of creation; generated results in other channels retain their seven-day maximum. Download a result before expiry if you want your own copy. You can remove saved looks, delete your photos or delete your account in the app. Some non-image consent, security, delivery and usage records remain for the operation and protection of the service. See the Privacy Policy for details.",
  ],
  [
    "Availability, notifications and updates",
    "Network access, permissions, device compatibility and service configuration affect availability. Optional device notifications require your permission. You can disable them. Direct Android updates open a published customer APK download and require Android installation approval; SelfX does not silently install updates. Keep the app current and use official SelfX distribution links. Features may change; the app identifies the current policy version when requesting acceptance.",
  ],
  [
    "Support",
    "Contact SelfX for account access, technical issues, privacy or deletion requests. Include your app version and a short description, and never include passwords or verification codes. These Terms do not replace rights that apply to you under applicable law.",
  ],
];
export default function TermsPage() {
  return (
    <main className="min-h-dvh bg-background px-4 py-10 text-foreground">
      <article className="mx-auto max-w-3xl space-y-8">
        <header className="space-y-3">
          <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
            SelfX Virtual Try-On
          </p>
          <h1 className="text-4xl font-semibold">Terms of Use</h1>
          <p className="text-muted-foreground">
            Effective October 26, 2026 · Version 2026-10-26
          </p>
        </header>
        {sections.map(([title, body]) => (
          <section key={title} className="space-y-3">
            <h2 className="text-xl font-semibold">{title}</h2>
            <p className="leading-7 text-muted-foreground">{body}</p>
          </section>
        ))}
        <a className="text-primary underline" href={supportMailto}>
          {supportEmail}
        </a>
        <footer className="border-t pt-6">
          <PublicLegalLinks />
        </footer>
      </article>
    </main>
  );
}
