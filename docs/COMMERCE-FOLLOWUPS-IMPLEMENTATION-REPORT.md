# Commerce follow-ups implementation — 2026-10-25

Implemented locally for the user's approved Shopify/WooCommerce follow-ups. The user's billing choice is **paid plan changes start at the next renewal**. No Change Store feature was added. Production migration/deployment, native paid approvals and public plugin publication were not performed.

## Delivered behavior

| Area | Implementation |
| --- | --- |
| Shopify catalog recovery | Bounded server schedulers, durable page cursor/snapshot, retry backoff, expiring database leases and safe complete-scan finalization. Separate OAuth/API and embedded-app recovery owners avoid duplicate scheduled scans. |
| Shopify storefront button | Hidden initially; signed app-proxy eligibility checks Store, connection, product mapping, enabled product, plan and available credits. Failed checks leave it hidden. Generation still enforces current backend limits. |
| Shopify connection controls | Confirmed disconnect revokes central credentials and clears local secrets. Reconnect retains the approved Store identity. Current/pending native payments must be cancelled first. |
| WooCommerce limits | Capability/nonce-protected settings for per-browser Day/Week/Month and monthly WooCommerce Store allowance. Central credential-scoped persistence and generation-time enforcement apply to existing sessions too. Zero disables only the custom cap. |
| WooCommerce diagnostics | Safe actionable messages for exhausted credits, visitor/monthly caps, invalid limits, broken connection and product/plan failures; last-sync state and retry actions retained. |
| Shopify existing-plan purchases | Native approval from active Shopify-compatible SelfX plans. Frozen approved prices/features, native status/amount/currency/test-mode verification, scheduled renewal activation, cancellation/uninstall handling and renewal checks. Free Starter onboarding remains automatic. |
| Shopify usage pricing | Merchant-approved spending cap reserved atomically across included Store channels. Only durable successful results create charges. Failed reservations release safely; unique generation/receipt IDs and Shopify idempotency keys protect retries. |
| Lifecycle safety | Reject stale activation after cancellation, compensate a disconnected approval with native cancellation, block conflicting manual plan replacement, require cancellation before archive/permanent deletion, clear Shopify identifiers on privacy redaction, and include the new dependencies in Store purge. |
| WooCommerce distribution preparation | Version 0.4.0, service/privacy/support disclosures, local release checker, inspected ZIP and checksum, dashboard download updated, and publication acceptance notes. |

The existing first-party Shopify visitor fix is preserved. Visitors remain anonymous: removing cookies, private browsing or switching devices can reset browser identity. Credits and Store caps remain separate protections. Source-platform inventory, cart, checkout and orders retain their existing ownership.

## Verification

| Check | Result |
| --- | --- |
| Backend integration/entitlement, kiosk, Public API and Store regressions | 33 suites, **265 tests passed**. The broad run used two workers and a 30-second test timeout to avoid local CPU contention. |
| Shopify app and connector tests | 19 suites, **95 tests passed**. Includes native billing boundaries, duplicate usage receipt recovery, disconnect compensation, theme eligibility, worker recovery and resumable scans. |
| SelfX web visitor/API tests | 2 suites, **10 tests passed**, using the web app's own Vitest configuration. |
| WooCommerce package behavior | **33 PHP checks passed**; all six PHP files passed syntax validation. |
| Real PostgreSQL financial/visitor/Woo/PAYG checks | Passed against disposable localhost `woocommerce_catalog_test`; Shopify app migrations also applied successfully to its isolated `shopify_app_test` schema. |
| Financial edge cases | Verified frozen prices/allowances including a later usage billing cycle, deferred activation, cap contention across channels, success-only charging, idempotent renewals/receipts, cancellation denial, disconnected approval rejection and Store-safe dependency purge. |
| Production compilation | API and shared Shopify integration TypeScript build; Shopify client and SSR production build. |
| Types and lint | Backend and Shopify types; changed API/web and Shopify source lint. |
| Schema/config/API operations | Both Prisma schemas validated; Shopify CLI app configuration valid with no issues; four billing operations validated against Admin GraphQL 2026-07. |

Providers and native billing operations were mocked in automated tests. No customer photos, live provider generations or real merchant charges were used. Framework future-flag notices during the Shopify build are non-blocking.

## Artifacts

- `integrations/woocommerce/dist/selfx-woocommerce.zip`
- `integrations/woocommerce/dist/selfx-woocommerce.zip.sha256`
- `frontend/web/public/downloads/selfx-woocommerce.zip`

Version: **0.4.0**. SHA-256: `6856bc4f6cbb07e930b7099d95d8c12732457e6f3e90e353427123683b070676`.

## Deployment and acceptance

1. Apply all pending backend migrations in the target environment, including `20261025000000_storefront_first_party_visitor`, `20261025010000_commerce_reconciliation` and `20261025020000_shopify_billing`. Apply the Shopify app's separate `20261025010000_catalog_reconciliation` migration in its own configured database/schema. Only disposable test databases were migrated here.
2. Deploy matching API/web/Shopify server and theme extension, then update WooCommerce with the 0.4.0 ZIP. Startup/build must generate the Shopify app's isolated Prisma client at `node_modules/@selfx/shopify-prisma-client`; it must not overwrite the central API client. Register the configured subscription-update webhook.
3. Keep billing disabled until staging setup. On **both** servers, set `SHOPIFY_BILLING_ENABLED=true` and matching `SHOPIFY_BILLING_TEST_MODE=true` for native acceptance. Test approval, decline, cancellation, frozen state, a deferred change, actual renewal, usage receipt retry and spending cap behavior. Verify the Partner app is configured for the chosen Manual Pricing flow before enabling production billing. Live-mode enablement needs matching test-mode false on both servers and a separately authorized rollout.
4. Manual Pricing is selected for the existing plan currencies and explicit merchant usage caps. Shopify's current default for supported new public apps is Shopify App Pricing; its documented limitations include USD plan prices and no usage caps. Confirm distribution eligibility/configuration before App Store submission. References: [billing choice](https://shopify.dev/docs/apps/launch/billing), [manual pricing](https://shopify.dev/docs/apps/launch/billing/manual-pricing), [App Pricing limitations](https://shopify.dev/docs/apps/launch/billing/shopify-app-pricing#limitations), [replacement behavior](https://shopify.dev/docs/api/admin-graphql/2026-07/enums/AppSubscriptionReplacementBehavior).
5. Verify a real Shopify proxy/theme browser flow, cookie-preserving repeat launches, server restarts mid-sync, offline-token expiry, safe deletion, closed-browser recovery and same-Store reconnect. Verify the same customer/limit/recovery flows on a public HTTPS WooCommerce staging site. Availability cannot establish a visitor's SelfX cookie while still on Shopify; the visitor allowance is checked in the SelfX flow.
6. Run official WordPress Plugin Check and a real supported-version compatibility matrix, verify publisher ownership and final service/legal/support copy, then obtain separate authorization for directory submission. See `integrations/woocommerce/RELEASE.md`. No public listing or updater is claimed.

Billing failures leave durable pending financial records for retry; operators must monitor unresolved native usage reporting failures. Local automated checks do not replace platform approval, deployed webhook acceptance or real-store testing.
