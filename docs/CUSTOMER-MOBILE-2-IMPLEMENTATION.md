# Customer mobile Try-On and free trial — 26 October 2026

This is the user-approved follow-up to CUSTOMER-MOBILE-1. The customer app has
an independent Flutter presentation, the official SelfX logo/colors, original
editorial imagery, four skippable introduction slides and working Home/Saved/Me
navigation. Existing email verification, password recovery, OAuth and account
security remain in the shared customer-auth module.

## Personal allowance

There are no configured personal paid subscription products in this slice.
Customers therefore receive a free trial using the current Default Starter
plan's `trialCredits` setting (the shared default is 10 when that plan row is
absent). This borrows the trial setting, not a Store subscription or Store
identity. The grant is recorded once per customer in `CustomerCreditAccount`.
Changing the setting affects new grants; sign-in, reinstall, photo deletion and
result expiry do not reset an existing grant.

Each admitted personal run reserves one credit under a customer row lock. A
successful privately stored result changes reserved to used in the same database
transaction that creates the saved look. Failure releases the reservation once.
The API enforces exhaustion and idempotency. One active generation per customer
prevents concurrent overspending. A request UUID is retained on uncertain mobile
network failure; the same request returns the same run. Startup restores an
active run from the API. A server restart does not replay an uncertain provider
submission: abandoned runs time out after 12 minutes and release their credit.

The Plans/credits screen shows the real trial grant, used, reserved and remaining
values. It clearly states personal paid plans are not available. It does not
offer fake purchases or reuse merchant billing products.

## Images, consent and shared execution

The app requests and stores explicit processing consent **before opening the
camera or photo picker**. Android/iOS camera and photo permissions are configured;
Android uses the system picker and does not request broad photo access or audio.
Technical JPEG/PNG/WebP validation and hard size limits run server-side. The
picker reduces large photos and removes only its own private temporary copies.
Photos/previews and access tokens remain in memory; the app does not persist a
local photo gallery. Explicit Download exports a user-controlled copy.

All generation uses Client → SelfX API → existing `TryOnExecutionService` →
provider-neutral adapter. Customer clients never receive provider credentials,
prediction IDs, raw provider URLs or developer controls. Canonical sessions,
assets, runs and saved looks are reused; customer ownership and durable consent
are linked explicitly, including composite owner constraints. Legacy kiosk/API
session callers cannot access customer-owned sessions without a customer scope.

Original person photos and uploaded/customer-session outfit copies expire within
7 days. Mobile generated results expire within 30 days **from result creation**.
Saved includes expiry, available original/outfit comparisons, protected download
and early deletion. Other channels retain their existing 7-day policy.

Private asset URLs last at most 60 seconds and never exceed the asset expiry.
Logical expiry/deletion blocks fresh access immediately; already issued signed
links can remain valid for their remaining short TTL until physical deletion.
Cleanup runs every minute, retries failed object deletion using durable metadata
and uses a five-minute grace for an unfinished upload so an in-flight PUT cannot
recreate a just-deleted object. Customer storage I/O has a 60-second timeout.
Account deletion removes access immediately and triggers media cleanup; cleanup
also recognizes deleted accounts. It retains non-image consent/usage records.
Permanent Store erasure removes its QR visits/results, while retaining customer
accounts, personal wallets and consent records with an immutable Store snapshot.

Storage prefixes:

- `customer-mobile/inputs/`: maximum 7-day input retention.
- `customer-mobile/results/`: maximum 30-day mobile result retention.

Use private buckets and matching lifecycle rules as an operational deletion
backstop. Check that an existing bucket-wide seven-day rule does not also match
the new mobile result prefix. No bucket policy/lifecycle was changed by this work.

## Store QR sponsorship

Store details exposes Mobile Store QR to callers with `integrations.view` and
creation/revocation to `integrations.manage`. Both checks run server-side against
the explicit Store resource; impersonation is resolved and the actual staff
actor is recorded. A new random token is returned once as a downloadable QR;
only its SHA-256 hash is stored. QR codes expire after one year and can be revoked.

Scanning in the mobile header opens a two-hour customer-owned Store visit. The
app shows the Store name, Store payer and eligible Store garment catalog.
Generation accepts only a server-resolved eligible product from that Store.
Arbitrary personal outfits cannot be charged to a Store. Explicit Store-session
consent permits merchant access to generated results, never original person
photos. The customer cannot submit a payer, merchant ID or provider override.

The daily limit defaults to 5, configurable 1–100. It counts the customer's
active/completed runs across that Store's codes/visits for the UTC day; rescanning
does not reset it. Failed attempts release their charge/reservation and do not
count as successful daily use. Personal credits are never a fallback.

`MOBILE` in a **Store** plan means Store-sponsored mobile QR usage. The Starter
trial and its trial subscription snapshots include it; other Store plans require
an explicit channel entitlement. Shared prepaid, postpaid and Shopify-managed
admission/billing logic is reused. Failed prepaid runs refund once; failed
Shopify reservations release; successful postpaid results create one billable
generation in the captured cycle. Personal paid subscriptions remain separate.

## Reporting and API

Mobile Dashboard includes aggregate attempts, completed/failed looks, personal
versus Store-sponsored results, Store visits and lifetime trial grant/used/
reserved snapshots. It contains no customer images or customer-identifying
details. Personal runs are excluded from business dashboards; Store-sponsored
usage remains in the paying Store's reporting under Mobile Store QR.

Customer routes are under `/api/v1/customer`: `experience`, `try-on/sessions`,
session `photos/PERSON|GARMENT`, `try-on/runs`, owned `try-on/assets`, protected
result `download`, paginated `looks`, `photos` deletion and `store-visits` with
paginated Store products. Customer responses use `Cache-Control: no-store`.
Store QR administration uses `/api/v1/admin/stores/:storeId/mobile-qrs`.

## Deployment and verification

1. Apply `20261026010000_customer_tryon_trial` to staging, then production through
   the normal approved deployment process. Do not point tests at production.
2. Keep the existing customer auth/JWT/OAuth/mail configuration. The customer
   auth flag, migrated tables, configured object storage and configured central
   provider determine whether generation is available. No extra feature flag is
   needed. Storage/provider credentials stay on the backend.
3. Verify the private storage prefixes/lifecycle, then deploy API and web. Enable
   Mobile Store QR on any paid merchant plans that should sponsor it.
4. Rebuild the customer app later with the normal release signing setup and an
   incremented build number (`0.2.0+2` in this source). Old APKs cannot acquire
   these screens simply by redeploying the API. **No APK is built in this task.**
5. Perform device acceptance: camera permission denial/recovery, system photo
   picker, QR scan/manual-code fallback, background/resume, real configured
   provider success/failure, private downloads, Saved expiry and account deletion.

Automated checks cover real disposable PostgreSQL migration/constraints,
one-time grants, concurrent admission/idempotency, exact-once refunds, expiry
and cleanup retries, ownership isolation, Store prepaid/postpaid admission,
rescan-resistant daily limits, HTTP DTO/auth boundaries, web QR controls and
Flutter consent/navigation/controller states. Provider, storage, OAuth and email
effects are simulated; no production generation, charge or email is sent.

Local PostgreSQL tests require `CUSTOMER_MOBILE_TEST_DATABASE_URL` pointing only
to `postgresql://…@localhost:<port>/customer_mobile_test`. The suite refuses any
other host/database. Run focused API Vitest tests, web workspace Vitest tests,
API/web TypeScript checks, `flutter analyze` and `flutter test`.
For the database suite use `--testTimeout 60000 --hookTimeout 60000 --maxWorkers 1`;
its real SQL/concurrency/erasure checks need a database-test timeout rather than
Vitest's five-second unit-test default, especially during parallel compilation.

Editorial asset generation briefs and sources are recorded in
[`mobile/design/editorial-assets.md`](../mobile/design/editorial-assets.md).
