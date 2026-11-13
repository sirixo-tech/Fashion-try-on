import type { Metadata } from "next";
import { Card, CardContent, CardHeader, CardTitle } from "@selfx/ui";
import { PublicLegalLinks } from "@/components/public-legal-links";
import { CustomerDeletionForm } from "@/components/customer-deletion-form";
import { supportEmail, supportMailto } from "@/lib/public-contact";

export const metadata: Metadata = {
  title: "SelfX — Customer Account & Data Deletion",
  description:
    "Request deletion of your SelfX customer account and associated data, with or without the mobile app.",
  referrer: "no-referrer",
};

export default function DeleteAccountPage() {
  return (
    <main className="min-h-dvh bg-background px-4 py-10 text-foreground sm:py-16">
      <article className="mx-auto max-w-4xl space-y-8">
        <header className="space-y-4">
          <p className="text-sm font-semibold uppercase tracking-widest text-primary">
            SelfX Virtual Try-On
          </p>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            SelfX — Customer Account &amp; Data Deletion
          </h1>
          <p className="max-w-2xl leading-7 text-muted-foreground">
            You can permanently close your SelfX customer account from the app
            or verify a deletion request here. You do not need to install the
            app or sign in to use this page.
          </p>
          <p className="text-sm text-muted-foreground">
            This page is for customer mobile accounts. It cannot delete Stores,
            merchant accounts, staff memberships or platform administrator
            accounts.
          </p>
        </header>

        <div className="grid items-start gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle role="heading" aria-level={2}>
                Delete without the app
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm leading-6 text-muted-foreground">
                Enter the email registered to your customer account. If
                eligible, you will receive a single-use, six-digit deletion
                code. Enter it here and confirm deletion within 10 minutes of
                your request.
              </p>
              <CustomerDeletionForm />
            </CardContent>
          </Card>
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle role="heading" aria-level={2}>
                  Delete in the SelfX app
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ol className="list-decimal space-y-3 pl-5 text-sm leading-6 text-muted-foreground">
                  <li>Open SelfX and sign in to your customer account.</li>
                  <li>
                    Open <strong>Me</strong>, then{" "}
                    <strong>Delete account</strong>.
                  </li>
                  <li>
                    Verify using your password or the available Google/Apple
                    option, then confirm deletion.
                  </li>
                </ol>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle role="heading" aria-level={2}>
                  Need help or use a phone number?
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm leading-6 text-muted-foreground">
                <p>
                  If you use phone sign-in without a registered email, cannot
                  access your email, have a pending payment or need other
                  assistance, request customer account deletion at{" "}
                  <a
                    className="break-all font-medium text-primary underline"
                    href={`${supportMailto}?subject=SelfX%20customer%20account%20deletion`}
                  >
                    {supportEmail}
                  </a>
                  . Include your registered email or phone number and say that
                  you want your SelfX customer account deleted.
                </p>
                <p>
                  Support must verify account ownership before processing a
                  request. Entering someone’s contact details does not authorize
                  deletion. Never send passwords, verification codes, payment
                  details or photos to support.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>

        <section className="space-y-4" aria-labelledby="deletion-data">
          <h2 id="deletion-data" className="text-2xl font-semibold">
            What happens to your data
          </h2>
          <ul className="list-disc space-y-3 pl-5 leading-7 text-muted-foreground">
            <li>
              <strong>Account and access:</strong> your email, phone number and
              profile name are removed or anonymized. SelfX sign-in identities,
              saved-garment entries, device registrations and notifications are
              deleted, and customer sessions are revoked. The closed account
              cannot be restored through sign-in.
            </li>
            <li>
              <strong>Photos and Saved looks:</strong> your profile photo, saved
              avatar photos, uploaded customer photos and generated looks lose
              application access. Private storage cleanup runs separately and
              failed deletions are retried; this is not a promise of
              instantaneous physical erasure. Files you downloaded or shared
              outside SelfX remain under their recipients’ control.
            </li>
            <li>
              <strong>Normal image expiry:</strong> temporary customer/person
              and captured-outfit images and derived inputs expire within seven
              days. Generated results saved by the customer mobile app expire
              within 30 days. Saved profile and avatar photos remain until
              replaced, removed or account deletion. You can request earlier
              deletion.
            </li>
            <li>
              <strong>Records retained:</strong> an anonymized customer record
              and non-image consent, Try-On usage, credit, purchase/payment and
              security records may remain for service integrity, accounting and
              audit purposes. Account closure does not delete merchant billing
              or business records, or separately held Google, Apple or Firebase
              accounts.
            </li>
          </ul>
          <p className="text-sm leading-6 text-muted-foreground">
            The current service does not define one fixed retention period for
            all retained non-image records or backup copies. Contact SelfX for
            the applicable details; no additional fixed retention or
            deletion-completion period is promised here. Pending payments must
            be resolved before account deletion can complete.
          </p>
        </section>
        <footer className="border-t pt-6">
          <PublicLegalLinks />
        </footer>
      </article>
    </main>
  );
}
