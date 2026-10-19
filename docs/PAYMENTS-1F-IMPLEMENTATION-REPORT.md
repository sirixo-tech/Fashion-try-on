# PAYMENTS-1F — Generate a fresh test QR after expiry

Date: 19 October 2026

## Result

Generate now reopens an unexpired test. After its five-minute QR deadline, the
same button creates a fresh test even when the previous result is still PENDING,
UNKNOWN or PREPARING. This applies to Store and platform UAT testing.

The old QR is hidden at expiry. Its test stays in history and continues background
status checks and callback handling. A late verified success belongs to that old
test; it does not mark the newer test successful. Expiry itself does not mark a
payment failed. There is no automatic generation loop: the user clicks Generate.

## Why it was blocked

Three layers treated unresolved payment status as an indefinite block: the web
page, the API query, and the database's unique unresolved-test index. Changing
only the button would still fail at the API or database.

The API guard now considers only unresolved tests with a future QR deadline. New
test creation still runs under the existing Store row lock or platform advisory
transaction lock, so concurrent requests cannot create two active tests. The
database migration replaces the indefinite unique index with an expiry lookup
index. Transaction-id and idempotency uniqueness remain intact.

Workspace responses now include API time. A shared web hook uses it to update the
Generate/reopen decision as the deadline passes, including when the browser clock
differs from the API clock. The backend remains authoritative. Existing request
retries keep their original key and return their original test after expiry;
they do not silently initialize another payment.

Account readiness, UAT-only execution, Store isolation, management permissions,
rate limits, diagnostic redaction and reconciliation remain in place. Shopping
orders, stock, live checkout and APK Buy were not changed.

## Validation

Provider calls were simulated against isolated localhost PostgreSQL. No real
PhonePe requests, production database changes or deployments were performed.

| Check | Result |
| --- | --- |
| Store/platform verification and order-payment integration | 54 passed |
| Payment UI/settings regressions | 43 passed |
| Payment access and API/OpenAPI contract tests | 14 passed |
| API and web TypeScript checks | Passed |
| Changed-file ESLint | Passed |
| QR-renewal migration on local PostgreSQL | Applied successfully |

Coverage includes active-test reopening, expired pending/unknown/preparing tests,
distinct transaction ids, same-key replay after expiry, concurrent starts, UI
expiry without refresh, old-test late success, and unchanged live-payment flags.

## Deploy and test

1. Apply `20261019010000_payment_test_qr_renewal` through the normal migration
   process: `npm run db:migrate:deploy` in the API deployment environment.
2. Deploy the updated API, then web. No new environment variable is required.
   PAYMENTS-1E's earlier diagnostic migration is still required; normal migration
   deployment applies any outstanding migrations in order.
3. Open Store Payment Settings. For an already expired UNKNOWN test, click
   **Generate ₹1 test QR**. A fresh test should open in the popup, while the older
   test remains in history. Whether a usable QR is returned still depends on the
   provider/account; existing safe diagnostics explain request failures.
4. While the new test is unexpired, click Generate again after closing the popup.
   It should reopen that same test. After the deadline, Generate can create a new
   test with a new transaction id. Old tests remain available through Open test.

No manual deletion or status rewrite of existing UNKNOWN tests is needed. New
test writers must continue using the shared locked service; payment status alone
can no longer be protected by an indefinite unique unresolved-test index.
