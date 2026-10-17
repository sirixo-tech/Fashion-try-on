# MAIL-1 — Mail Settings and Forgot password

Implemented 2026-10-17. No production database, SMTP account or email recipient was
accessed during development.

## What changed

The navigation now reads **Platform Settings**, with **General Settings** and
**Mail Settings** as direct siblings. Mail Settings is at
`/app/platform/mail-settings`; there is no extra Settings layer above it.

Only protected Superadmins can read/edit/test SMTP configuration. Store roles and
ordinary platform staff cannot use the API or see its navigation entry. The form
supports enable/disable, hostname, port, TLS/STARTTLS, username/password, sender
name/email and optional reply-to. Settings are versioned; stale updates fail.
Credentials are encrypted in the database. Reads expose the username and password
presence, never the password/ciphertext. Blank password preserves it, and entered
secrets clear after save attempts. A server key is required before saving.

Test email uses the saved configuration and an explicit recipient. Saving changes
clears the prior test result. Tests are limited to three per minute across API
instances. SMTP-accepted means the server accepted the message; inbox delivery
must be checked separately. Tests may be sent while normal outgoing mail is off.

Forgot password is linked from login. Users submit their registered login email
at `/forgot-password`. Every syntactically valid address gets the same response
and encrypted work item; user lookup and SMTP happen in the worker. The account
must be ACTIVE. Suspended/disabled/unknown users receive no email. Store contact
email is never used as an account-recovery identity.

Reset links expire 15 minutes from the request and are single-use. They open
`/reset-password#token=...`. The fragment is not sent to the web server in an HTTP
request; the page removes it from the address bar and keeps it only in memory.
Reloading that cleared URL requires reopening the original email link. Passwords
must match and use the existing 12–256 character policy. An expired/used link
offers Request a new link. Success offers ordinary sign-in without auto-login.

## Password/session behavior

The database keeps SHA-256 reset-token hashes. A successful reset locks the user,
checks expiry/current credential version, stores an Argon2id password hash,
consumes all outstanding links, increments the user's credential version, revokes
refresh sessions and active impersonations, audits, and queues confirmation in
one transaction. Existing access tokens are also rejected on their next protected
request. A session created by a racing old-password login retains the old version
and cannot refresh into valid new credentials.

Existing sessions/JWTs start at version zero and remain compatible until a reset.
The account keeps all Store memberships, ownership, roles, products and billing.
The password belongs to the shared SelfX user, so recovery affects that user's
login across every Store they belong to. It does not change other users.

## Delivery and security

Mail runs in the existing API process, without a new microservice, Redis or queue
dependency. PostgreSQL provides encrypted durable jobs, claims/leases and bounded
retries (four attempts with backoff). After a transient failure the same reset
link is retried. Pending jobs survive restarts; multiple API instances cannot
normally claim the same live lease. SMTP acceptance followed by a process crash
can result in duplicate delivery; reset links remain one-use. This is not an
exactly-once external email guarantee.

Sensitive payloads are removed after send, skip, final failure or expiry. Recovery
requests expire after 15 minutes; confirmation messages after 24 hours. Terminal
job metadata and expired reset rows are pruned after seven days. Rate buckets are
pruned after expiry. Cleanup runs with the worker while the API is running.
SMTP-disabled/missing-key/missing-origin recovery requests return a generic
service-unavailable response without checking account existence.

Request limits are database-backed: ten requests per IP per 15 minutes, three
queued requests per email per 15 minutes, and twenty reset submissions per IP per
15 minutes. Excess per-email requests keep the generic response. Identifiers are
HMACs under the existing server pepper. Existing trusted-origin checks protect
public POSTs. Sender/header fields and reset inputs use validated contracts.

IP limits use Fastify's existing request IP resolution. A deployment that presents
all visitors as one reverse-proxy IP shares that IP budget; verify this against
your existing proxy configuration before a wider rollout. This feature does not
start trusting arbitrary client-supplied forwarding headers.

SMTP uses certificate-verified TLS or required STARTTLS with timeouts and no
protocol/body logging. It rejects private/reserved DNS addresses and pins a public
address before connecting. Invalid certificates and unencrypted SMTP are not
supported. Only username/password SMTP authentication is in this milestone;
provider OAuth2 and private-network relay exceptions are not added.

The reset web origin comes from the API's configured public web URL, not request
Host/Origin or user-supplied redirect input. No passwords, links, SMTP errors or
token contents enter audit metadata. Audit records contain action, actor,
configuration version and safe failure codes.

Implementation references: [Nodemailer SMTP documentation](https://nodemailer.com/smtp)
for transport/TLS options and [OWASP password recovery guidance](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html)
for reset-token handling, generic responses, throttling and session invalidation.

## Railway deployment

1. Generate a random 32-byte Base64 key on your own computer, for example:

   ```sh
   node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
   ```

   Set **SELFX_MAIL_ENCRYPTION_KEY** on the **API service only**, with
   **SELFX_MAIL_ENCRYPTION_KEY_VERSION=v1**. Back up this key securely and keep it
   stable across redeployments. Do not use a NEXT_PUBLIC variable or paste the key
   into chat. SMTP credentials themselves are configured only in the dashboard.
2. Verify **SELFX_PUBLIC_WEB_BASE_URL** on the API is the actual public HTTPS web
   origin, e.g. your deployed web hostname without a path, query or fragment.
   **SELFX_WEB_BASE_URL** is used only when the public variable is absent. The
   frontend origin must also be in the existing API CORS allowed origins.
3. Back up PostgreSQL. Deploy the API with the normal Prisma generation/build and
   run the normal migration deployment command before serving the new API:

   ```sh
   npm run db:migrate:deploy
   ```

   The new migration is `20261017000000_mail_and_password_recovery`. Deploy the web
   application as well. No SMTP credentials or real emails are required at build.
4. Sign in as your working protected Superadmin. Open **Platform Settings -> Mail
   Settings** and enter the SMTP settings supplied by your email provider. Use its
   SMTP/app password if required, and a sender it permits. Save configuration.
5. Send a test to an inbox you control. Check inbox/spam and the safe test result.
   Then enable outgoing email and save if it was initially disabled. Saving resets
   the test badge; test the final configuration again if desired.
6. Use Forgot password on a real Store login email. Verify reception, reset, old
   password/session rejection, new-password login, and unchanged Store products.
   Verify an expired/used link fails. Keep another admin login available.

Demo `.local` login addresses cannot receive normal internet email. Changing the
Store Contact email does not change the login identity or make it deliverable.
Existing accounts need an actual reachable login mailbox for email recovery.

For deliberate encryption-key rotation, keep old version/key pairs in
**SELFX_MAIL_PREVIOUS_ENCRYPTION_KEYS** (JSON object) until old jobs and saved
credentials have been re-encrypted or expired. Save SMTP settings under the new
current key before retiring a previous key. This release does not add a key-rotation
dashboard or automatically rewrite all pending jobs.

## Validation

The focused suites passed 48 backend tests across five files and 41 frontend tests
across five files. They cover SMTP isolation/socket cancellation, credentials,
authorization, reset lifecycle, retries/concurrency, session invalidation and UI
states. All 56 schema migrations applied to a fresh disposable localhost database;
Prisma schema validation passed. SMTP was simulated throughout. API/web production
builds and changed-file lint passed, and git diff whitespace checks passed. The web
build can still report existing image-performance warnings in unrelated catalog,
share and Shopify pages. Real provider/network delivery is verified only after
the operator supplies their account in the dashboard.
