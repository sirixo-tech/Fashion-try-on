import type { Metadata } from "next";

import { PublicLegalLinks } from "@/components/public-legal-links";
import { supportEmail, supportMailto } from "@/lib/public-contact";

export const metadata: Metadata = {
  title: "Privacy Policy | SelfX Virtual Try-On",
  description:
    "Privacy policy for SelfX Virtual Try-On, including Shopify integration and customer image handling.",
};

const effectiveDate = "October 27, 2026";

export default function PrivacyPage() {
  return (
    <main className="min-h-dvh bg-background px-4 py-10 text-foreground">
      <article className="mx-auto max-w-3xl space-y-8">
        <header className="space-y-3">
          <p className="text-sm font-medium uppercase tracking-[0.08em] text-muted-foreground">
            SelfX Virtual Try-On
          </p>
          <h1 className="text-4xl font-semibold tracking-tight">
            Privacy Policy
          </h1>
          <p className="text-muted-foreground">Effective {effectiveDate}</p>
        </header>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">Overview</h2>
          <p className="leading-7 text-muted-foreground">
            SelfX provides virtual try-on tools for merchants and shoppers. This
            policy explains the information we collect, how we use it, and how
            merchants or customers can contact us about privacy requests.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">Information We Collect</h2>
          <p className="leading-7 text-muted-foreground">
            We may collect account information from SelfX users, store and
            catalog information from connected commerce platforms, product
            images and metadata, usage logs, device and diagnostic information,
            and customer-provided images used to generate virtual try-on
            results.
          </p>
          <p className="leading-7 text-muted-foreground">
            For Shopify integrations, SelfX may receive the Shopify shop domain,
            product catalog data, product images, theme app block status,
            webhook delivery metadata, and app installation or uninstallation
            events. SelfX does not request Shopify order access unless a future
            sales attribution feature is implemented and disclosed.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">How We Use Information</h2>
          <p className="leading-7 text-muted-foreground">
            We use information to operate SelfX, connect merchant stores, sync
            eligible products, provide virtual try-on experiences, manage
            credits and usage, detect errors, secure the service, provide
            support, and comply with legal or platform requirements.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">Customer Images</h2>
          <p className="leading-7 text-muted-foreground">
            Customer photos and generated try-on images are treated as sensitive
            data. They are used only to provide the requested try-on experience
            and related support. Customer person images, temporary provider
            inputs and customer-session outfit captures expire within seven
            days. Generated results saved by the SelfX customer mobile app
            expire within 30 days of result creation. Generated results from
            other channels retain the seven-day maximum. You can delete mobile
            photos/results sooner from Me or Saved. Expired or deleted assets
            lose application access; private download links have a short
            lifetime and failed storage deletions are retried. A result you
            explicitly download to your own device remains under your control.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">
            Customer Accounts and Store Visits
          </h2>
          <p className="leading-7 text-muted-foreground">
            Your personal SelfX customer account is separate from merchant staff
            accounts. Email verification, sign-in providers and security records
            support account access and recovery. A Store QR session identifies
            the sponsoring Store before generation. Only eligible Store products
            use that Store’s allowance; personal credits are not an automatic
            fallback. Explicit Store-session consent permits access to generated
            results, not your original person photo. Durable consent and
            non-image usage records may remain after image deletion.
          </p>
          <p className="leading-7 text-muted-foreground">
            If you choose phone sign-in, we store your verified phone number to
            access your existing SelfX account. Firebase Authentication,
            provided by Google, sends and verifies SMS codes. Google receives
            and stores the number for authentication and spam and abuse
            prevention across Google services. You consent before requesting
            phone verification. Email and other available sign-in methods remain
            available.
          </p>
        </section>
        <section className="space-y-3">
          <h2 className="text-xl font-semibold">
            Notifications and App Downloads
          </h2>
          <p className="leading-7 text-muted-foreground">
            The app can show an in-app notification when a look is ready.
            Optional device alerts use Firebase Cloud Messaging when configured
            and enabled by you. Delivery uses an encrypted device registration
            token and sends a generic message with resource identifiers, not
            photographs or private image links. Disable device alerts in the app
            or device settings; sign-out revokes the device registration.
            Notification records expire with the result. Android update checks
            use app version, supported architecture and Android version to find
            a compatible published customer APK. Support email opens your email
            application; choose what information and attachments to send.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">Sharing and Processors</h2>
          <p className="leading-7 text-muted-foreground">
            SelfX may use infrastructure, storage, analytics, and AI processing
            providers to deliver the service. These providers are used only for
            service operation and are not permitted to use merchant or customer
            data for unrelated purposes.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">Shopify Privacy Webhooks</h2>
          <p className="leading-7 text-muted-foreground">
            SelfX supports Shopify privacy webhooks for customer data requests,
            customer redaction, and shop redaction. When a Shopify store
            uninstalls SelfX or Shopify sends a privacy request, SelfX processes
            the request and deletes or redacts applicable Shopify-owned data.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">Your Choices</h2>
          <p className="leading-7 text-muted-foreground">
            Merchants can uninstall the Shopify app or disconnect an integration
            from SelfX. Customers or merchants can request access, correction,
            deletion, or privacy support by contacting us at{" "}
            <a
              className="font-medium text-primary underline"
              href={supportMailto}
            >
              {supportEmail}
            </a>
            .
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">Contact</h2>
          <p className="leading-7 text-muted-foreground">
            For privacy questions or requests, contact SelfX at{" "}
            <a
              className="font-medium text-primary underline"
              href={supportMailto}
            >
              {supportEmail}
            </a>
            .
          </p>
        </section>
        <footer className="border-t pt-6">
          <PublicLegalLinks />
        </footer>
      </article>
    </main>
  );
}
