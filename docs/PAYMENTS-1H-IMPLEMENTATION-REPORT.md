# PAYMENTS-1H — Store gateway cards, Edit and Delete

Date: 19 October 2026

## Result

Store Payment Settings now presents compact gateway cards with Test/Live badges,
account verification status, summary counts and a saved on/off selection control.
PhonePe has Set up when unconfigured, and Edit, Delete configuration and Verify
payment when configured. Other planned providers remain informational.

Edit opens a wider responsive modal with the saved non-secret fields populated.
The saved Salt Key is never returned or displayed. Leaving it blank retains it;
entering a new key changes it. An unchanged edit retains account verification.
Changed account details create a new configuration version requiring verification.
The dialog uses two columns on desktop and keeps its save actions visible.

Delete requires confirmation, removes the active account and clears its selection.
Turning the selection off instead retains the account. Neither operation deletes
payment history, orders or encrypted snapshots needed to reconcile pending payments.
Recreating an account requires a Salt Key and cannot inherit old verification.

Account verification is labeled separately from checkout readiness. Customer
checkout remains unavailable; this change does not enable it. Existing Store QR
generation, expiry renewal, callbacks and status checks remain in place.

## API and authorization

Added these Store-scoped routes under
`/api/v1/admin/stores/:storeId/payments/connections/phonepe`:

- GET returns only editable non-secret account details and key-presence state.
- PATCH edits the account and permits a missing or blank Salt Key to retain it.
- DELETE removes active configuration using the expected settings revision.

All three require the existing Store payment-management authorization and reject
impersonation. Existing full-save PUT remains compatible and requires a key.
Mutations use the Store lock and expected revision to reject stale writes. Audit
metadata excludes credentials. The edit/delete UI captures the revision when the
dialog opens, preventing background updates from silently replacing that revision.

Verification status matches the current Store, provider, environment and connection
version. Connection versions advance past retained history after deletion/recreation.
Historical verification and shopping-payment snapshots remain independently usable.

Fixed initial-render server-clock timing in the shared QR UI: active tests are
recognized immediately and a five-minute countdown does not briefly show 5:01.

## Validation

Tests use isolated localhost PostgreSQL and simulated provider responses. No real
provider payments, production database changes or deployments were performed.

| Check | Result |
| --- | --- |
| Settings and payment controller unit tests | 30 passed |
| Store/platform verification, settings and order-payment integration | 67 passed |
| Payment UI, settings and page tests | 52 passed |
| API initialization and OpenAPI contracts | 3 passed |
| API and web TypeScript | Passed |
| Changed-file ESLint | Passed |
| API and web production builds | Passed |
| Git whitespace check | Passed |

Coverage includes blank-key retention, unchanged-edit verification, changed-key
signing, stale/concurrent mutations, tenant isolation, impersonation restrictions,
delete confirmation/retry, disabled-provider removal, recreation without inherited
verification, late QR callbacks and pending shopping-order reconciliation after
configuration deletion.

The web build reports existing `next/no-img-element` warnings in the Looks share
and Shopify Try-On pages, outside the changed payment components.

## Deployment

Deploy API before web. No new migration or environment variable is required.
Keep the existing payment encryption key/version and provider configuration.

The six main project documents include the PAYMENTS-1H behavior and contracts.
