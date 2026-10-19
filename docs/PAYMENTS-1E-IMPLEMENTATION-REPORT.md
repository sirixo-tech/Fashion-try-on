# PAYMENTS-1E — Store QR test popup and safe diagnostics

Date: 19 October 2026

## Result

**Generate ₹1 test QR** now opens one responsive popup immediately. It shows
generation progress, the usable QR and countdown, payment confirmation progress,
verified success/failure or a safe diagnostic when no usable QR was obtained.
**Open test** resumes the saved test in that same popup. Closing preserves it.

The backend now records why QR initialization or a status check could not be
verified. An `UNKNOWN` result remains uncertain; diagnostics do not invent success
or turn a timeout into a failed payment.

## What changed

- Store test results moved from the inline panel into a shared-UI dialog with a
  wider desktop layout and viewport-bounded scrolling.
- The popup opens before Generate/Open API requests resolve. Duplicate clicks and
  dismissal are blocked while an action is in flight.
- A browser request failure offers **Retry same request**, reusing its original
  idempotency key. It never silently generates another payment. A saved uncertain
  test keeps the existing pending-test guard; use Open test to resume it.
- A server-time-based countdown hides the QR at expiry. It also disappears on
  terminal results. Expiry does not establish failure; confirmation can arrive
  later.
- The result explains missing QR data, distinguishes callback receipt from
  verified payment status, and shows separate QR-generation and latest
  status-check diagnostic messages and reference codes.
- Platform testing retains its existing single workspace popup and receives the
  same diagnostic/countdown result improvements. No second nested popup is added.

## Diagnostic design

Transport classification distinguishes disabled requests, timeouts, connectivity
errors, unsuccessful HTTP responses, oversized responses and invalid JSON. The
adapter distinguishes provider rejection and merchant/transaction/amount/QR
mismatches. Unrecognized payment status remains unresolved.

Each diagnostic stores only:

- A fixed internal code.
- Numeric HTTP status, where available.
- A provider code from an explicit allowlist, otherwise null.
- Timestamp.

Display messages are generated from backend-owned text. Raw bodies, request
headers, credentials, arbitrary exception messages and stack traces are neither
persisted nor included in diagnostic logs. Logs contain the test ID, stage and
these safe fields for correlation. Stored diagnostic values are validated again
before returning them.

Initialization diagnostics are retained separately from the latest status-check
diagnostic. A valid status response clears the latest status error; initialization
history can remain after eventual verified success. Provider failure diagnostics
alone never authorize a terminal payment outcome.

Diagnostics are returned only with existing authorized test-detail/start/check
responses. Store management permission, impersonation restrictions and explicit
Store/platform scope checks remain. History summaries use an explicit field list;
they omit diagnostic snapshots and QR strings. Read-only users keep safe history
without QR/start/check access.

Merchant, transaction, amount, QR and signature validation remain strict. No
provider endpoint, credentials, authentication scheme or response-matching
requirement was relaxed to make an unverified QR appear.

## Persistence and API

New additive migration:

```text
backend/database/prisma/migrations/20261019000000_payment_test_diagnostics/migration.sql
```

It adds nullable `initialization_diagnostic` and `status_diagnostic` JSONB fields
to the existing scoped `platform_payment_tests` table. No new table or role is
introduced. Existing rows remain null; historical discarded responses cannot be
recovered or reconstructed.

Existing test-detail responses add:

```text
diagnostics.initialization: diagnostic or null
diagnostics.status: diagnostic or null
```

The web contract accepts the absence of diagnostics for compatibility with an
older API during rollout. The updated API requires the migration. Existing
background reconciliation, leases, idempotency, callback verification and Store
purge behavior are reused.

## Verification

Validated on an isolated fresh localhost PostgreSQL database with all 60
repository migrations applied. Provider execution was mocked; no live credentials
or real payment requests were used.

| Check | Result |
| --- | --- |
| Diagnostic redaction, transport/parser and payment-controller unit tests | 50 passed |
| Store/platform verification and order-payment integration tests | 50 passed |
| Payment popup/settings/gateway frontend tests | 40 passed |
| API initialization and internal OpenAPI tests | 3 passed |
| API and web TypeScript checks | Passed |
| Changed-file ESLint | Passed, zero warnings |
| API/web production builds | Passed |

Coverage includes immediate popup loading, duplicate clicks, blocked dismissal,
stable-key retry, reopening, countdown expiry, success/failure, HTTP rejection,
malformed responses, amount mismatch, diagnostic persistence after restart,
cross-Store/platform denial, log/data redaction and late verified success.
The web build retains existing image-optimization warnings on unrelated pages.

## Deploy and test

1. Apply migrations on the API environment using the repository's normal migration
   command, `npm run db:migrate:deploy`.
2. Deploy the updated API with its regenerated Prisma client, then deploy web.
   No new environment variables are required. Keep the existing UAT, callback
   origin and payment encryption configuration.
3. Sign in as Store Admin and open Payment Settings. For an existing unknown test,
   choose **Open test**, then **Check payment status**. Once a provider check runs,
   the popup can show its new status diagnostic. Existing backoff/lease scheduling
   can defer an immediate check; review Last status check and Next scheduled check.
4. For an account without an unresolved test, Generate opens the popup immediately.
   If the provider returns a valid QR, use its supported UAT tooling; if it does
   not, review the safe reason, HTTP/provider code and test ID.
5. Confirm closing/reopening preserves the test, callback receipt stays separate
   from payment success, and read-only users cannot generate/open QRs.

This improves diagnosis of the reported missing QR. It does not establish which
provider/account issue caused the previous production request; that response was
discarded by the old code. Production account acceptance, Dynamic QR entitlement
and successful provider execution must still be checked after deployment.
Pending/unknown tests are deliberately not deleted, cancelled or regenerated by
this change. Live checkout, product ordering, APK Buy and receipt printing remain
outside this milestone. No production data or deployments were changed here.

## Main files

- `frontend/web/components/store-payment-verification.tsx`: popup and resumable
  Store request workflow.
- `frontend/web/components/payment-test-result.tsx`: countdown, result states and
  diagnostic presentation shared with platform testing.
- `frontend/web/lib/platform-payment-tests.ts`: additive diagnostic contract.
- `backend/api/src/payments/payment-diagnostics.ts`: fixed safe classification.
- `backend/api/src/payments/phonepe.transport.ts` and `phonepe-dqr.adapter.ts`:
  transport/parser failure classification while preserving validation.
- `backend/api/src/payments/payment-gateway-tests.service.ts`: persistence,
  redacted logs and scoped detail response.
- Existing diagnostic DTOs, Prisma schema/migration, tests and project documents.
