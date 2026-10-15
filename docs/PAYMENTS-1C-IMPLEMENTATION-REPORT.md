# PAYMENTS-1C — Platform gateway controls and PhonePe testing

Date: 2026-10-16

## What changed

Platform → Payment Gateways now has compact cards with provider marks, clear
availability/test badges, an accessible availability switch and a small Refresh
action. PhonePe has **Set up & test**. Razorpay, Stripe, Paytm and PayPal remain
**Coming soon** with disabled controls until their connectors are implemented.

Platform administrators control which gateways Stores can configure. The platform
can also test PhonePe using its own separate UAT credentials. **Those credentials
are never used for Store checkout.** Each Store continues to configure its own
merchant account and select its gateway independently.

The PhonePe workspace provides:

- Encrypted UAT-only test account setup and full credential replacement.
- Separate indications for DQR access confirmation, API execution and callback
  configuration. Saving credentials does not count as a passed test.
- A fixed **₹1.00 UAT test QR**, with a five-minute QR deadline.
- Payment status checks, separate authenticated callback delivery status and
  recent test history. QR creation alone is not payment success.
- Reopening an existing test after leaving the page or restarting the API.
- Read-only history for platform integration viewers; management permission is
  required for credentials, QR access and provider checks.

Platform testing works independently of the Store availability switch, so SelfX
can test a connector before making its configuration available to Stores. There
is no platform checkout default or shared merchant-account fallback option.

## How a test works

1. Open PhonePe → Set up & test → Configure test account.
2. Enter confirmed UAT credentials and declare whether Dynamic QR test access
   has been confirmed. The form defaults that declaration to unconfirmed.
3. Once the API execution switch and HTTPS callback address are configured,
   generate a ₹1 test QR and exercise it with PhonePe's supported UAT tooling.
4. Inspect the result. A signed callback is recorded and schedules verification;
   SelfX independently checks the provider before showing Test passed.
5. Inspect callback receipt separately. A payment can be verified successful
   while callback delivery still needs investigation.

Tests create no Store order, stock reservation or stock deduction. They do not
create a fake merchant tenant and are separate from shopping sales records.
Replacing credentials starts a new configuration version and resets its displayed
test result. Existing tests retain their original encrypted credential snapshot
and remain inspectable/reconcilable.

## Failure and retry behavior

Each test start has an actor-scoped idempotency key. Retries return the same test
without resending QR initialization. The browser retains the same key after a
start request error. One unresolved test is allowed per credential version, and
new tests are capped at 100 per rolling 24 hours across the platform.

A network timeout, expired QR or unknown status does not prove payment failure.
Such tests retain durable verification schedules. The shared reconciliation
timer resumes checks after restart, uses database leases and bounded batches,
and backs off repeated checks up to one hour. Signed late success is retained;
contradictory evidence keeps verification pending and blocks another start for
that account version. A successful test cannot be downgraded by an older failure.

Some uncertain tests may require provider investigation. SelfX does not invent a
failure or resend an uncertain payment request to clear the test history.

## Security and permissions

Platform metadata/history requires `INTEGRATIONS_VIEW`. Test setup, QR access,
starting and checking require `INTEGRATIONS_MANAGE`. Store integration permissions
do not grant access to this workspace. Store impersonation blocks platform test
access, including for platform administrators. Audit records identify the actual
actor without credentials or raw provider payloads.

Credentials use the existing API-only AES-256-GCM encryption and versioned-key
support. Payloads bind the `PLATFORM_TEST` scope; Store credential payloads are
rejected by the platform test adapter. Read APIs expose allowlisted metadata only.
QR data is limited to management-authorized test detail and is hidden after expiry
or a terminal result. Raw callbacks, payer identity and bank details are not stored.

The implementation reuses the existing PhonePe DQR adapter, fixed UAT transport,
callback-origin validation, snapshot decryption/key rotation and reconciliation
timer. Platform probes have separate persistence rather than invoking commerce
order or stock services.

## Database and API

The additive migration is:

`backend/database/prisma/migrations/20261016000000_platform_payment_testing/migration.sql`

It adds `platform_payment_test_connections`, `platform_payment_tests` and
`platform_payment_test_events`. SQL constraints enforce PhonePe/UAT, the fixed
amount, valid states, confirmed-success timestamps and one unresolved test per
configuration version. Snapshots preserve history across credential replacement.
The project documents 01–06 describe the new approved workflow and boundary.

The internal API base is:

`/api/v1/admin/payment-gateways/PHONEPE/testing`

| Method and suffix | Purpose |
| --- | --- |
| GET base | Safe configuration metadata and recent history |
| PUT `/connection` | Replace platform UAT configuration |
| POST `/tests` | Create/replay a fixed-amount test |
| GET `/tests/:testId` | Management-authorized result and unexpired QR |
| POST `/tests/:testId/check` | Independent provider status check |

Signed test callbacks use
`POST /api/v1/payments/phonepe/platform-tests/:testId/callback` and receive HTTP 200
after durable ingestion. These endpoints are documented internally and excluded
from the Public API.

## Verification

- **146 targeted backend tests passed:** 122 existing payment/shopping/stock
  regression tests and 24 platform tests, including 20 real-PostgreSQL integration
  cases with simulated provider responses.
- **25 selected frontend tests passed:** platform switches/setup, readiness gates,
  retry key reuse, existing-test reopening, QR/result display, read-only history,
  and Store payment/shopping regressions.
- All **54 migrations** applied to a fresh disposable PostgreSQL database. The
  new migration also upgraded the existing disposable payment regression database.
- API and web production builds, API/shared-UI type checks, targeted lint and
  `git diff --check` passed. Existing unrelated web image warnings remain.
- A fully initialized NestJS/Fastify HTTP smoke check verified real platform
  authentication, read-only history/QR restrictions, input rejection, idempotent
  QR creation, signed callbacks, independent success confirmation, Store resource
  isolation, impersonation denial, cache headers and internal OpenAPI contracts.

No actual PhonePe network requests were sent. Test credentials were synthetic and
provider responses simulated. No browser was connected for visual review. Real
provider acceptance and callback delivery remain to be tested with confirmed UAT
access. Existing card-hover changes were preserved.

## What to do after pushing

1. Deploy the updated API and web application together and ensure the new
   migration is applied to the intended deployment database using the repository's
   established migration process. Take the normal database backup first.
2. Keep `SELFX_PHONEPE_UAT_ENABLED=false` until the credential supplier confirms
   UAT environment and offline Dynamic QR entitlement. Production credentials
   cannot be used in this workspace.
3. Configure the existing API-only payment encryption key/version and a reachable
   HTTPS API origin in `SELFX_PAYMENT_CALLBACK_BASE_URL`. Preserve previous keys
   while old encrypted snapshots still need verification. No new environment
   variable is required by this milestone.
4. Save the separate confirmed UAT account through the platform workspace, confirm
   DQR access, then deliberately enable the API UAT switch in staging. The existing
   switch also controls Store UAT execution; do not enable it casually in a trading
   environment.
5. Exercise success, failure, pending/delayed responses, callback delivery,
   duplicate notifications and restart recovery with PhonePe test tooling. Verify
   both payment status and callback receipt before declaring integration acceptance.

This work did not migrate the configured application database, change `.env`, push
code or deploy. Live payments, APK Buy, other connectors, printing, collection,
refunds and shopping analytics remain later stages. No additional product decision
is needed for this milestone; actual testing still requires confirmed UAT access.

The protocol follows PhonePe's official
[DQR initialization](https://developer.phonepe.com/offline-integration/dynamic-qr-solution/dqr-init-api)
and [server callback](https://developer.phonepe.com/offline-integration/response-capturing-api/server-to-server-callback)
documentation.
