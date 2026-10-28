# CUSTOMER-MOBILE-12 — Automatic Google linking and editorial welcome

Approved 2026-10-28. Source **0.11.0+12**. This changes the welcome cover and
eligible existing-account Google sign-in only; account deletion, trial allocation
and SMS verification behavior are outside this slice.

## Automatic account linking

Continue with Google may attach an unclaimed Google identity to an existing
ACTIVE SelfX customer when both sides establish ownership of the same email:

- Google ID token signature, audience, issuer and expiry are verified by the
  official server library. `email_verified` must be the boolean `true`.
- Google must be authoritative for the email: a Gmail address, or a verified
  Google Workspace address with a non-empty signed `hd` claim. An arbitrary
  third-party email's `email_verified` claim alone is insufficient.
- The existing SelfX account must have a verified identity for that same email,
  and must not already have a different Google subject linked to it.

The service attaches the Google identity to that existing customer ID and creates
a normal SelfX session. It does not merge customer records, reset a password,
grant a new trial, transfer credit balances or rewrite profile/history. Already
linked Google identities continue to resolve by provider subject. Pending,
suspended and deleted accounts are not activated by automatic linking. Ambiguous
or conflicting cases retain the existing additional-verification/manual-link
flow. Apple behavior is unchanged.

Existing-account linking does not require a new-account terms acceptance signal;
new account creation still requires the current terms version and acceptance.
Provider-subject advisory locking, the shared signup email lock, a locked current
customer row and existing uniqueness constraints protect concurrent operations.
Email authority is internal verified-provider metadata, never a client field.
No schema migration or new persistence structure is needed.

This supersedes the earlier blanket manual-link requirement in CUSTOMER-MOBILE-5
and CUSTOMER-MOBILE-11 for the eligible Google matches above. Explicit recent-
session Profile → Link Google remains available for cases needing another proof.

## Welcome cover

Replace the single-person welcome background with a generated premium editorial
cover showing two adult models in contrasting ivory/charcoal outfits, a cream
studio and restrained orange accents. The official branding and controls remain
Flutter widgets. The asset is bundled offline as
`mobile/assets/editorial/welcome-editorial-v2.webp`; it does not change the
existing information-screen images. See the full generation prompt and provenance
in `mobile/design/welcome-editorial-v2-prompt.md`.

## Validation and rollout

Use simulated Google tokens and mail with the disposable local customer_auth_test
database. Verify Gmail/Workspace authority versus third-party emails, invalid
claims, preserved account/password/wallet state, concurrent linking, conflicting
subjects and inactive accounts. Render the welcome screen and check entry-flow
regressions, static analysis, TypeScript and affected-file lint.

Deploy the API for automatic linking to take effect; rebuilding the APK alone
does not change that backend behavior. Rebuild/reinstall the customer app to show
the new cover. No APK build, production deployment or console-setting change is
included in this implementation.

Reference: [Google's authoritative email ownership rules](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token).

Completed verification: **48 backend tests** and **19 focused mobile entry/auth
tests** passed. API TypeScript, affected-file ESLint, Flutter analysis and
whitespace checks passed. Tests include concurrent automatic linking, preserved
wallet/password/customer state, trusted versus ambiguous claims, inactive accounts,
conflicting subjects and rejection of client-supplied authority flags. The actual
rendered welcome screen was inspected at
`tmp/customer-mobile-review/welcome.png`. No real provider sign-in, production
deployment or APK assembly was performed.
