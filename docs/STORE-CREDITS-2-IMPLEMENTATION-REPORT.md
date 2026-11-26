# STORE-CREDITS-2 implementation and deployment

Implemented the approved merchant billing model: one-time, non-expiring credit packs and optional usage-only PAYG. Each pack retains its configured features, channels, location and kiosk limits. A verified pack purchase selects that profile immediately, adds credits to the shared Store balance and preserves any separately approved PAYG agreement.

No production deployment, payment approval or production database change was performed.

## Resulting behavior

- A paid credit pack is a repeatable one-time purchase. There is no monthly credit-pack renewal or monthly expiry. Existing configured prices and credit quantities are retained.
- Shopify packs use native one-time app purchases. Eligible non-Shopify Stores use the existing SelfX-owned PhonePe account. Shopify-linked Stores are routed to Shopify from other management surfaces.
- A shared Store wallet reserves credits before generation and consumes them once a successful result is persisted. Failed runs release the reservation. Store/channel authorization, tenant binding and concurrent last-credit admission are enforced server-side.
- Prepaid credits are used before PAYG. A prepaid generation cannot also reserve a Shopify usage charge. Further paid usage requires verified PAYG authority and respects the approved cap or unpaid PhonePe usage-bill restriction.
- Purchasing a pack updates its accepted feature/limit profile without disabling PAYG. Disabling PAYG preserves the balance and last credit-pack profile. Starter is not granted again.
- Native Shopify activation is reconciled as authoritative rather than inventing a future plan date that disagrees with Shopify. Historical monthly credit subscriptions are retired through authenticated native cancellation, followed by verification. New checkout is blocked while such a recurring agreement is still active.
- Legacy prepaid Shopify and WooCommerce receipt keys remain recognized, preventing an in-flight prepaid generation from becoming billable again after the cutover.
- Personal mobile purchase prices/expiry, customer consent/retention, shopping-order payments and separate kiosk rental fees are unchanged. Store-sponsored mobile admission uses the shared merchant wallet.

## New files

| File | Purpose |
| --- | --- |
| `backend/api/src/entitlements/store-billing-policy.ts` | Separate frozen credit-pack profiles from optional PAYG authority; preserve prepaid access when usage billing is disabled. |
| `backend/api/src/entitlements/store-credit-wallet.ts` | Shared reservation, available balance and successful credit settlement. |
| `backend/database/prisma/migrations/20261126030000_store_credit_packs/migration.sql` | Explicit purchase kinds, tenant-bound credit reservations and non-expiring existing active credit profiles. |
| `backend/api/src/entitlements/store-credit-wallet.integration.spec.ts` | Real PostgreSQL credit concurrency, failure release, expiry-free balances, profile preservation and tenant checks. |
| `integrations/shopify/app/credit-purchase.server.spec.ts` | Native one-time approval, recovery, amount/identity verification and legacy retirement checks. |
| This report | Deployment order, verification and operational limits. |

## Edited modules and artifacts

- Central entitlements, PAYG accounting, Shopify billing service/DTOs, PhonePe Store selection/controller and Store purge dependencies.
- Storefront and Store-sponsored mobile run admission, plus Shopify uninstall reconciliation.
- Shopify embedded purchase cards, current balance/PAYG presentation, native purchase verification and approval recovery.
- SelfX merchant billing, platform pricing editor/list and Store onboarding price presentation. The historic `monthlyPriceCents` storage/API field remains compatible; for credit packs its value is the one-time pack total, labelled accordingly in the UI.
- Corresponding authorization, payment, provider-boundary, storefront and mobile tests. The old QR test was updated to the existing short-code public contract; production QR behavior was not changed.
- All six project documents record the approved override of monthly merchant credit plans and the per-pack feature/limit decision.
- WooCommerce source/readme version 0.5.5 and rebuilt dashboard download `frontend/web/public/downloads/selfx-woocommerce.zip`. The build also produces `integrations/woocommerce/dist/selfx-woocommerce.zip`.

## Local database

Applied migration `20261126030000_store_credit_packs` to the actual local API database `localhost:5433/selfx`, schema `public`. All 105 API migrations are current. The isolated Shopify schema `shopify_app` has all seven migrations applied; this feature adds no Shopify-app schema migration.

Before applying it, created local backup `tmp/db-backups/selfx-before-shopify-recovery-1795704862351.dump` (529,249 bytes). The migration does not insert, remove or reconstruct credit-ledger quantities. Pending and historical payment identities/snapshots remain durable.

Tests use disposable databases on `127.0.0.1:55472`, separate from the local application database. Ignored `tmp` baseline copies were explicitly excluded from test discovery.

## Verification

342 automated checks passed: 257 merchant billing/Shopify checks, 33 mobile/public-API checks, 16 web UI tests and 36 WooCommerce plugin checks. There are no failed or skipped tests in these final runs.

- Merchant billing, Shopify app, entitlement, webhook, reinstall, storefront and PostgreSQL regressions passed, including the final Shopify/WooCommerce legacy prepaid coverage regression.
- 33 personal/Store-sponsored mobile and public-API checks passed.
- 16 relevant web UI tests passed.
- WooCommerce PHP syntax and all 36 plugin behavior checks passed; package version 0.5.5 was rebuilt without publication or submission.
- API, Shopify app and SelfX web production builds passed. API, app and web typechecks passed.
- New one-time purchase/recovery and usage-subscription GraphQL operations validated against Admin API 2026-07 through Shopify AI Toolkit.
- Changed API/web TypeScript ESLint and changed Shopify source/test ESLint passed; whitespace checks passed. The workspace Shopify lint script selects an incompatible root ESLint CLI; its app-local ESLint executable and `.eslintrc.cjs` were used for the changed files instead.

The rebuilt dashboard/public ZIP and integration ZIP have matching SHA-256 `0efc4343182ab8e3320e443a258ff7fb0a4867b383fd695069d96da6769f0b36`.

## Production cutover

1. Back up production and briefly prevent new merchant checkout while migration and all affected services are released. Use the existing billing enable switches, recording their prior values; restore only the previously enabled/configured paths afterward. Do not change test/live mode as part of this migration.
2. Apply the API migration with `npm run db:migrate:deploy`. The additive schema must exist before the new API and app code use it. Do not treat SQL migration as cancellation of native Shopify charges.
3. Deploy `@selfx/api`, Shopify server service `Fashion-try-on` and `@selfx/web` together. This source change has no Shopify TOML/extension change and does not itself require `shopify app deploy`. No mobile APK or kiosk binary update is needed for this merchant billing change.
4. Reopen the embedded app for the same approved Store and verify retirement of any old recurring credit charges. Scheduled reconciliation also checks connected shops. If an old unapproved monthly approval is still pending, decline it and retry verification. Do not create another charge to work around an uncertain payment.
5. Install the rebuilt WooCommerce 0.5.5 ZIP where the plugin is already used. Publishing the WordPress.org listing remains a separate action.
6. On the test Store, approve and decline a credit purchase; verify exactly one grant, a second same-pack purchase, unchanged old credits, and native charge history. Verify PAYG approval/disable, prepaid exhaustion before usage billing, spending-cap enforcement and the same balance/profile in SelfX and WooCommerce. Then complete a consented storefront Try-On.
7. Update the Shopify App Store pricing description and review instructions to describe one-time packs, no credit expiry, configured pack entitlements and optional monthly usage billing before resubmission. Source tests and test charges do not establish App Review acceptance.

## Operational boundaries

Lost payment/creation responses remain pending verification; they do not cause replacement charges or free credit grants. A PhonePe payment whose Store/provider state changed before activation remains reviewable instead of silently applying different terms. Existing unresolved legacy payments require reconciliation before another conflicting purchase. Old monthly contracts and their financial evidence are retained rather than erased.

The native test/live mode must agree between the API and Shopify service. One-time checkout and real PhonePe settlement still require a deployed end-to-end check. No real merchant was charged by these tests.

Primary Shopify references: [one-time app purchases](https://shopify.dev/docs/api/admin-graphql/2026-07/mutations/appPurchaseOneTimeCreate), [purchase verification fields](https://shopify.dev/docs/api/admin-graphql/2026-07/objects/AppPurchaseOneTime), [subscription replacement behavior](https://shopify.dev/docs/api/admin-graphql/2026-07/enums/AppSubscriptionReplacementBehavior), [App Store billing requirements](https://shopify.dev/docs/apps/launch/shopify-app-store/app-store-requirements#bill-through-the-shopify-billing-api-or-managed-pricing).
