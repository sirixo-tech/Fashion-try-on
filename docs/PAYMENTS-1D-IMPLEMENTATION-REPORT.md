# PAYMENTS-1D — Store payment settings and PhonePe account verification

## Result

Stores can open **Payment Settings directly from their sidebar**, configure their
own PhonePe merchant account, select the gateway and verify a confirmed UAT
configuration with a separate test QR. The signed-in account determines the Store
automatically. Existing explicit Store payment links reuse the same setup screen.

This milestone completes Store setup and UAT verification. **Live payment
collection and the APK Buy button remain disabled.** Razorpay, Stripe, Paytm and
PayPal remain Planned; their credential forms/connectors are not enabled.

## Follow-up — Store Payment Settings access fix (19 October 2026)

The shared Payment Settings page was calling the platform-only impersonation
status API for every account. A normal Store login therefore received
`PLATFORM_PERMISSION_DENIED` before its payment settings could load, despite
having the correct Store payment access.

The page now reads impersonation status from the existing authenticated current
Store context. Explicit Store links still use the requested Store's server-resolved
`paymentAccess.view/manage`; the default Store's permissions are never substituted.
Store logins make no platform access or platform impersonation API requests.
Impersonation still disables payment editing, and context failures remain blocking
with a Retry action. Platform gateway access still requires its own integration
permissions and remains blocked during impersonation.

Regression coverage includes the actual Store payment route, viewers, Admins,
explicit Store selection, context failure/retry and platform gateway access without
impersonation privileges. All 35 targeted payment/gateway tests, web typechecking,
changed-file lint and the production web build passed. The build retains existing
image-optimization warnings on unrelated pages. This fix changes only the web page and its tests;
redeploy the web service. No API change, permission grant, database migration or
new environment variable is required.

## What changed

- Store Admins with `integrations.manage` can replace credentials, select/clear
  the gateway, start tests, open their QR and request provider status checks.
  Actual active Store membership and Admin authority are checked centrally on
  the server, within the Store permission ceiling.
- Safe configuration/history viewing requires the Store's `integrations.view`
  permission. Staff cannot change payment credentials, even if they receive
  integration management permission. Platform authority alone grants no Store
  payment access. Impersonation cannot change credentials/selection or access
  test QR/start/check operations. Independently granted Store viewing access can
  still inspect safe metadata during impersonation.
- Platform gateway availability and platform testing remain independent. A
  platform test does not verify Store credentials, and no Store uses the
  platform test account as a fallback.
- Reused existing encrypted configuration and provider transport. Secrets are
  never returned to the browser/APK, placed in browser storage or included in
  test history/audits. Credentials are entered again for complete replacement.
- Added a Store verification panel with setup/test states, recent tests and
  **Live payments: Not enabled**. Tests require confirmed UAT Dynamic QR access,
  platform availability, enabled API UAT execution and a valid HTTPS callback
  origin. Live/unconfirmed credentials cannot run a UAT probe.
- A fixed **INR 1.00 UAT QR** expires after five minutes. Use PhonePe's supported
  UAT tooling, not an ordinary real-money payment as a substitute for UAT access.
  Verification creates no shopping order, cart, stock hold or deduction.
- A signed callback records evidence and schedules an independent provider
  status check. It cannot directly mark a test successful. Payment status and
  authenticated callback receipt are displayed separately.
- Reused durable idempotency, request snapshots, leases, backoff and background
  reconciliation. An uncertain start can be retried with the same key without
  another initialization request. Open test resumes a saved test. One unresolved
  test is allowed per account version, with a daily per-account test cap.
- Credential replacement increments its version and resets current verification.
  Prior tests retain their original encrypted snapshots for late notifications
  and checks; an old test passing does not verify replacement credentials.
  Selecting/clearing a gateway does not change its credential version.
- Store/platform test history is isolated on every user-facing read/check and
  callback route. The shared engine validates each snapshot's tenant, provider
  and UAT environment. Existing platform routes only see platform tests.
- Permanent Store deletion includes that Store's probes/events and safe audit
  counts, preserving unrelated Store/platform probes. User deletion retains the
  existing historical actor-snapshot behavior.

## API and persistence

Store configuration routes remain under
`/api/v1/admin/stores/:storeId/payments`.

| Route | Purpose |
| --- | --- |
| `GET .../phonepe/testing` | Safe Store account readiness and recent tests |
| `POST .../phonepe/testing/tests` | Create/replay a test using the saved credential version |
| `GET .../phonepe/testing/tests/:testId` | Admin-only test detail and unexpired QR |
| `POST .../phonepe/testing/tests/:testId/check` | Independently check with PhonePe |
| `POST /api/v1/payments/phonepe/stores/:storeId/tests/:testId/callback` | Authenticated provider notification |

Administrative responses use `private, no-store`. These routes are excluded from
the Public API document. No endpoint permits manually marking a test passed.

New migration:
`backend/database/prisma/migrations/20261018183000_store_payment_verification/migration.sql`.

It adds Store credential versions and scope/Store columns to the existing durable
probe tables. Historic table names remain for compatibility; runtime code now
uses the shared `PaymentGatewayTestsService`. Database constraints bind Store
scope to its tenant and include scope in idempotency/active-test uniqueness.
Existing platform tests keep their platform scope. No existing Store account,
product, stock or order is migrated or deleted by deployment.

## Deploy and configure

1. Apply the new migration using the normal reviewed Railway migration process
   (`npm run db:migrate:deploy` from the repository root with the API database
   environment configured).
   Update/generate Prisma Client as part of the normal build. Deploy the API and
   web together. Finish replacing old API instances before exposing Store tests;
   old payment-test code does not understand Store-scoped probe rows.
2. Keep the existing dedicated API encryption key and key version. Preserve
   previous encryption keys while historical payment/test snapshots need them.
   No new environment variable is introduced in this milestone.
3. In Platform Settings → Payment Gateways, make PhonePe available to Stores.
4. Sign in as the Store Admin and open **Payment Settings**. Enter that Store's
   Merchant ID, Salt Index, Salt Key and optional provider/Store references.
   If the credential environment or Dynamic QR entitlement is unknown, save
   **Environment unconfirmed**; do not claim UAT access merely to enable testing.
5. After PhonePe confirms UAT Dynamic QR access, save the confirmed UAT setup.
   Ensure the API has `SELFX_PHONEPE_UAT_ENABLED=true` and
   `SELFX_PAYMENT_CALLBACK_BASE_URL` set to its publicly reachable HTTPS origin.
   Keep `PAYMENT_RECONCILIATION_ENABLED` enabled for automatic verification.
6. Generate the Store's test QR, exercise it through supported UAT tooling, and
   inspect both status and callback delivery. Verify pending/failure/delayed
   success, retry, API restart and credential replacement behavior in staging.
7. Select PhonePe for future checkout when appropriate. Selection and UAT success
   do not enable real payments.

Existing server variables are `SELFX_PAYMENT_ENCRYPTION_KEY`,
`SELFX_PAYMENT_ENCRYPTION_KEY_VERSION`, optional
`SELFX_PAYMENT_PREVIOUS_ENCRYPTION_KEYS`, `SELFX_PHONEPE_UAT_ENABLED`,
`SELFX_PAYMENT_CALLBACK_BASE_URL` and `PAYMENT_RECONCILIATION_ENABLED`.
The callback base URL is the API origin; the normal web URL is not a substitute.

## Verification

- All **59 migrations** applied successfully to a fresh disposable localhost
  PostgreSQL database, including the final verification migration.
- **141 backend tests** passed across Store/platform verification, credential
  encryption/settings, PhonePe signing/status parsing, order payments, Store RBAC,
  user/Store deletion and initialized API/OpenAPI checks.
- **67 web tests** passed across Store setup/verification, retry/history controls,
  automatic Store resolution, platform testing, navigation, shell and Store pages.
- API/web typechecks, changed-file lint and production builds passed. The web
  build retains existing image-optimization warnings in unrelated public sharing
  and Shopify Try-On pages.

Backend integration checks used real disposable local PostgreSQL with simulated
PhonePe responses. UI checks used component tests with mocked API responses.
API initialization used example configuration and a local database with provider
execution disabled. No actual merchant credentials were loaded or tested, and no
real payment/provider request, production migration or deployment was performed.
A deployed browser and real PhonePe UAT walkthrough remain rollout checks.

## Next step and required information

First deploy this milestone and verify one Store's confirmed PhonePe UAT account.
We still need confirmation that the available Salt Key/Index and merchant/provider
IDs belong to a UAT Dynamic QR account. Possessing those values alone does not
establish the environment or enabled PhonePe product. Keep secrets out of chat;
enter them in the Store dashboard.

After provider acceptance, the next milestone is live PhonePe support and the APK
product/cart/checkout/QR/result flow, followed by receipts/printing. Confirm live
merchant onboarding/capabilities before implementing activation. A test pass must
never automatically switch a Store to live payments. Other gateway adapters can
then reuse the shared order/payment workflow while implementing their own account
setup, signatures, callbacks and provider verification.
