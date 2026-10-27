# CUSTOMER-MOBILE-11 — Email/mobile access and verification diagnostics

Approved 2026-10-27. Source **0.10.0+11**. This supersedes the earlier
email-only password login, optional secondary signup phone field, signup terms
checkbox and SelfX SMS request cooldown. It changes customer authentication only.

## Entry and signup

Sign in and signup use the shared country-aware **Email or mobile number** field.
Email signup needs name, email and password. Number-first signup also collects
an email before submission, with a clear message that the verification code goes
there. Email verification remains required; SMS verification is optional.
Phone-only signup without an email is not offered in this approved email
verification flow. Existing account IDs, passwords, balances and history remain.

The existing signup API still accepts `email` plus optional canonical
`phoneNumber`. The selected number remains `pendingPhoneNumber`; no client can
assert phone ownership or set `phoneVerifiedAt`. Signup and new OAuth account
creation record existing versioned terms acceptance when the customer presses
Continue/Create account. One wrapping inline notice links Terms and Privacy
Policy, without a checkbox or separate policy button row. Forms scroll manually
when needed for screen size/keyboard; switching views jumps to the top without
an animated scroll.

## Password login and phone ownership

The existing `/auth/login` request's `email` field now accepts either a valid
email or a canonical international mobile number, preserving older clients.
Emails use the existing unique password identity. Numbers first resolve the
verified phone owner, if one exists, then that owner's password identity.
Otherwise an ACTIVE, email-verified account's unverified pending number can act
as a password-login alias. The query is bounded to two candidates: a shared or
ambiguous pending number must use email rather than guessing an account.
Password verification, generic credential failures, suspension checks and
existing login attempt limits apply to both paths.

An unverified number never authorizes SMS login, recovery, account linking or
merging, and never overrides a verified owner's number. Existing duplicate
pending contacts are preserved. Migration
`20261027050000_customer_phone_password_lookup` adds only a non-unique pending
phone lookup index; no customer/contact data is rewritten.

## Google access

Android Google Sign-In can read the web OAuth client from the registered native
`google-services.json`/generated `default_web_client_id`; the redundant Dart
server-client-ID build flag is no longer mandatory. Explicit overrides continue
to take precedence. Google is visible on supported native devices. If server
capabilities are unavailable, the button refreshes them and reports an error
before opening a provider flow. The actual audience allowlist and signing keys
must still be configured correctly.

Continue with Google signs in an already linked identity or creates a new
account after the visible inline terms notice. Existing email accounts are not
merged by email matching. Customers sign in once with their existing method and
choose **Profile → Link Google**, then later use Google directly. New
`POST /api/v1/customer/me/oauth` accepts a Google ID token and requires an active
SelfX session authenticated within ten minutes, the same provider-verified email,
and an unclaimed provider identity. Session refresh does not renew that original
authentication time. Conflicts/mismatches fail without replacing credentials or
changing account identity, credits or history. Apple nonce/token checks remain.

## Phone retries and diagnostics

SelfX admits a number's next SMS preflight after **10 seconds**, with **30 admitted
requests per number/hour**, **100 per number/day** and **120 per IP/hour**.
Atomic PostgreSQL admission locks and existing HMAC-keyed rate buckets prevent
concurrent bypass. Cooldown rejection happens before send-budget increments;
rejected transactions consume no send budget. Rejections return a remaining
`error.retryAfterSeconds`; the shared error filter also sets `Retry-After`.
The versioned bucket keys avoid carrying the former 3-per-15-minute request cap
into this policy. Email code/resend and password guessing limits are unchanged.

The client starts the phone cooldown after successful SelfX admission, even if
Firebase subsequently fails, and respects server retry delays. It keeps Firebase
Android resend tokens only for the current number/project in memory, clears them
on cancellation, and passes them on an explicit retry. Firebase's own delivery,
quota and abuse controls can still delay or refuse SMS; SelfX's ten-second UI
does not guarantee ten-second SMS delivery. The separate explicit SMS consent
notice/checkbox remains before sending a number to Firebase.

Firebase callback failures are normalized once. The app preserves allowlisted
provider error codes and reports a safe stage such as SELFX_PREFLIGHT,
FIREBASE_REQUEST, FIREBASE_VERIFY or SELFX_LINK next to a failed attempt.
Unknown errors use a stable generic diagnostic; raw provider messages, phone
numbers, OTPs, tokens and credentials are not diagnostic output or logs.
New entry/link labels and diagnostic prefixes are bundled in all 20 languages.

## Rollout and verification

Apply the lookup-index migration and deploy the API before distributing the
updated app. Rebuild/reinstall the signed APK separately. Tests use a dedicated
localhost customer_auth_test database and simulated Google/Firebase/mail; no real
SMS, production data changes or external account deletion are part of this work.

Real-device SMS acceptance still requires Firebase Phone provider activation,
Blaze billing, intended SMS regions, the installed APK's SHA-1/SHA-256 fingerprints
and working Play Integrity/reCAPTCHA configuration. A fictional Firebase number
uses its configured code and intentionally sends no SMS. Console configuration
and actual delivery cannot be established by the SelfX capability flag alone.

References: [Google Sign-In Android native client configuration](https://pub.dev/packages/google_sign_in_android),
[Firebase Android phone authentication](https://firebase.google.com/docs/auth/android/phone-auth),
[Firebase SMS limits](https://firebase.google.com/docs/auth/limits).

Completed validation: **123 mobile tests** and **33 backend tests** passed;
Flutter analysis, API TypeScript, affected-file ESLint and whitespace checks
passed. The migration applied successfully to the disposable localhost auth
database. Tests cover both identifiers, ambiguous aliases/verified-owner
precedence, inactive accounts, Google email/session mismatch and recent-auth
requirements, atomic admission/concurrent requests, preserved callback errors,
retry timers, all 20 locale layouts and existing auth/profile flows.
Rendered sign-in, email-first signup and number-first signup were inspected;
previews are in ignored `tmp/customer-mobile-review/`.
The Android app's matching native configuration contains a web OAuth client
entry; console allowlists, signing registration, billing, regions and real SMS
delivery have not been changed or verified through a device in this task.
No APK was built and no production migration/deployment was performed.
