# Shared merchant plan selection — 2026-11-26

Implemented the approved merchant plan flow for the same linked SelfX Store across the SelfX application, Shopify and WooCommerce. This is separate from personal mobile plans and shopping-order checkout.

## Behavior

- One central Store subscription, entitlement service and credit ledger continue to determine access everywhere. Current/scheduled plan data and balances are refreshed rather than maintained as independent channel subscriptions.
- Shopify shows Choose plan/Change plan, requests native approval, retains renewal scheduling, permits cancellation of a scheduled replacement and removes the external SelfX upgrade instructions. A stored approval is reused on retry. Interrupted native creation is recovered by the exact server-owned return URL before allowing another request; uncertain outcomes are never retried as new payable approvals.
- SelfX Billing offers terms-confirmed plan selection through the existing encrypted SelfX-owned PhonePe account. Fixed-price INR plans buy one month without automatic renewal/debits. INR usage-only plans record consent to the configured rate and settle successful completed usage monthly. No prices, currencies or exchange rates are invented.
- Paid-to-paid PhonePe changes are scheduled at renewal. Existing access/balances remain during approval and scheduling. A payment received after an incompatible administrative change is retained for review rather than silently applying another plan.
- Completed PhonePe usage cycles generate a single bill from durable BillableGeneration records. Existing manual cycles are excluded. The originating approved plan/account is retained on the cycle. Pending runs must finish before finalization; a database trigger prevents delayed admission to an invoiced cycle. Unpaid completed usage blocks further generation across channels, while Billing remains available to settle the bill.
- WooCommerce adds Manage plan for the authorized linked Store and shows scheduled changes. The plugin still has no payment credentials or independent subscription logic.
- Starter remains one initial Store allowance. It is not a reusable downgrade; linking, reconnecting, cancellation, balance reads and plan changes do not grant another trial.
- Store-scoped payment permission is mandatory; impersonation cannot perform financial mutations. Provider order/amount and approved terms are verified server-side. User-visible results omit encrypted credentials and provider transport details.
- One pending plan change is allowed per Store. Request keys check fingerprints and expire after 30 days; native financial identities and grant/invoice constraints remain durable.

## Existing subscription safeguards

This migration does not reassign existing plans or alter balances. Existing SelfX paid fixed periods must finish before starting Shopify billing, avoiding overlapping paid periods. Existing metered usage retains its original cycle/settlement ownership and is never retrospectively sent to Shopify. Stores with pending PhonePe payments cannot start another provider's approval. New PhonePe bills apply only to cycles explicitly marked PHONEPE; historical manual cycles remain unchanged.

PhonePe supports INR fixed-price and usage-only plans here. Unsupported currencies are unavailable for PhonePe selection. Legacy payment account formats without Dynamic QR retain status checking; safe cancellation is available for Dynamic QR. Unknown native outcomes require verification before another order is issued. Automatic refunds and card/UPI recurring mandates are not introduced.

## New source files

- `backend/api/src/stores/store-plan-selection.service.ts`
- `backend/api/src/stores/store-plan-selection.controller.ts`
- `backend/api/src/stores/store-plan-selection.controller.spec.ts`
- `backend/api/src/stores/store-plan-selection.integration.spec.ts`
- `backend/api/src/entitlements/phonepe-store-billing.ts`
- `frontend/web/components/store-plan-selection.tsx`
- `frontend/web/components/store-plan-selection.test.tsx`
- `backend/database/prisma/migrations/20261126000000_store_plan_selection/migration.sql`
- This implementation report.

## Edited areas

Existing entitlement/cycle services, Shopify billing service/controller/DTO and tests, integration read API, module registrations, Store purge dependency handling, Prisma schema, SelfX Billing page, Shopify plan cards/route/billing server/tests, WooCommerce client allowlist/settings/version/readme/tests, `.env.example` and all six approved project documents. Full paths are available in `git diff --name-only`; new files are shown by `git status --short`.

## Verification

- Focused real-PostgreSQL billing/authorization/Shopify regression checks cover concurrency, duplicate confirmations, shared trial/credit grants, frozen terms, stale quotes, pending scheduling, one invoice per cycle, overdue settlement, foreign Store denial, impersonation denial, reused approval destinations and interrupted native approval recovery.
- Merchant UI checks cover Shopify routing, terms acceptance before payment, duplicate click suppression, view-only/trial restrictions and stale responses after changing Stores. Existing Billing page tests remain included.
- PHP syntax and the offline WooCommerce behavior harness pass, including the linked-Store Manage plan URL and scheduled plan rendering. The source allowlist was extended only for the new read-only endpoint.
- The complete 103-migration chain, including this migration, passed on a fresh isolated PostgreSQL database. An existing empty untracked migration directory (`20261029050000_custom_credit_plan_features`) prevented Prisma deployment; it was preserved under `tmp/pre-existing-empty-custom-credit-plan-features` so the normal deployment command could be validated. No historical migration SQL was edited.
- Final focused results: 45 backend/Shopify checks plus 8 merchant UI/Billing-page checks passed. All 36 offline WooCommerce checks and PHP syntax checks passed. API, web and Shopify production builds passed, as did changed-source lint/typechecks and Shopify GraphQL schema validation. Existing framework/deprecation and unrelated image lint warnings remain outside this change.
- A schema-drift comparison verified that the new payment and cycle definitions match the migration, including composite Store ownership foreign keys. Existing unrelated schema drift was recorded separately under `tmp/store-plan-schema-drift.txt`; it was not expanded into this billing change.
- The broader backend suite reached 974 passing tests with five failures in existing app-release and legacy tenant-management tests. The same five failures were reproduced from an untouched HEAD snapshot under `tmp/store-plan-baseline`; they are not introduced by this change. Unselected integration suites retain their normal environment-based skips.

## Deploy/install order

1. Apply `20261126000000_store_plan_selection` with all prior migrations **before** deploying the updated API. Generate the central Prisma client. The schema additions are additive and do not switch current billing ownership.
2. Deploy matching API and web builds, then the Shopify server build. Preserve its isolated `@selfx/shopify-prisma-client`. Configure `SHOPIFY_APP_URL` on the central API as well as the Shopify server so SelfX can route merchants to their authenticated Shopify Plans page.
3. Keep Shopify Billing API Manual Pricing configured for the existing integration; do not simultaneously enable Shopify hosted App Pricing. Set matching `SHOPIFY_BILLING_ENABLED=true` and test-mode values on API and Shopify server only for acceptance. Verify upgrade, downgrade, decline, scheduled replacement, cancellation, reinstall and merchant application charge history on a test Store. Production uses matching `SHOPIFY_BILLING_TEST_MODE=false` after live rollout approval.
4. Confirm the existing SelfX-owned production PhonePe account in Mobile Payments, encryption/current-previous keys, verified production endpoint and HTTPS callback base. `SELFX_STORE_PHONEPE_ENABLED` is a separate API execution gate and remains false in the example. Verify a real QR/payment/callback, duplicate status/callback, cancelled/unknown payment, scheduled activation and completed usage settlement before enabling it publicly. No merchant gateway is repurposed.
5. Install `integrations/woocommerce/dist/selfx-woocommerce.zip` (version 0.5.4), also copied to `frontend/web/public/downloads/selfx-woocommerce.zip`. No WordPress.org submission or deployment was performed.
6. Verify linked Store identity and current/scheduled plan reflection in all three interfaces. Record the native Shopify upgrade/downgrade and application charge history as proof for review.

No production migration, deployment, real charge, live gateway acceptance or Shopify resubmission was performed by this implementation. Local provider tests use deterministic mocks; live payment and review acceptance are still required.

WooCommerce ZIP SHA-256: `d2920d5b54b5e727b65cfa77677a1ead70b39601f9913c50a96542c948ac512d`.
