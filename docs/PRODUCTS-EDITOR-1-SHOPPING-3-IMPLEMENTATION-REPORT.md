# PRODUCTS-EDITOR-1 / SHOPPING-3 implementation report

Implemented locally on 21 October 2026. Production services, merchant credentials,
real payments and published App releases have not been changed.

## What is implemented

- Add/Edit Product now opens a responsive page for garments or jewellery, including
  Platform management of an explicitly selected Store. Basic information, main
  image, pricing, size/colour combinations, quantity and tax override are together.
  Stock & Pricing opens the same editor. View-only users see values without edit
  controls; every write remains protected by server-side products.manage.
- One optional uploaded image per colour, shared across its sizes. Removing a colour
  image restores the main-image fallback. Upload keys are restricted to that Store,
  metadata is saved in stock settings and read URLs are signed. Old stock clients
  that omit colour images preserve existing images.
- One kiosk catalog product per product ID, including sold-out products eligible for
  Try-On. Variable pricing displays the minimum effective price with “From”. Cached
  product serialization preserves that display.
- Buy This Look works from result and My Looks screens. The purchase screen shows
  preview, option price, available size/colour choices, quantity and the session cart.
  Unavailable choices are disabled. An entirely sold-out product shows
  “Out of stock. Please contact {Store name}.” Optional colour previews fall back to
  the main image, including a failed colour-image download.
- The APK uses existing device-authenticated SelfX cart/order/payment routes. Prices,
  currency, taxes, stock and five-minute reservations remain server-authoritative.
  Retried checkout/payment operations reuse their keys. Version conflicts refresh
  the quote for customer review. No employee/provider credentials enter the APK.
- QR payment uses the existing encrypted Store account snapshot, reconciliation,
  callback verification and atomic stock-allocation services. Production order
  execution is explicitly gated separately from account-verification testing.
  The UI distinguishes test mode, pending/unknown, failure, PAID, PAID_REVIEW,
  cancellation and expiry. Only verified PAID shows purchase success. An expired
  QR is hidden even if status polling is interrupted.
- Purchase information is bound to the current customer-session revision. Active
  orders can resume in the same session. A payment reservation can extend idle
  display up to five minutes; it cannot indefinitely prevent session cleanup.
  After a session ends/restarts, authorized Store staff retain durable order access.
- Release builds now require an explicitly configured production signing identity;
  the previous silent debug-signing fallback is removed. An ignored
  android/key.properties file is supported with a safe example file. No signing
  identity has been generated or replaced.

## Save and integration boundaries

The editor validates inputs before saving, then uses the existing product-details
and versioned stock APIs. These are two operations. If stock saving fails after
basic details succeed, the page explicitly reports the partial save and keeps the
option inputs for retry. A stock-version conflict requires reviewing current stock;
it is never silently overwritten. Routine session-token refresh preserves edits.

This purchase flow supports SelfX-created Store products. Stock for imported
Shopify/WooCommerce products remains owned by the external shop; this change does
not invent an external-shop checkout or turn SelfX into a POS. Printing, physical
collection automation, refunds and additional payment gateways remain separate.

## Verification

- Prisma client generated; schema validation passed. New migration applied only to
  the disposable local PostgreSQL test database.
- 144 focused API tests passed across stock, commerce, Store/platform payment
  configuration/testing, order reconciliation, PhonePe protocol and result diagnostics.
  Includes cross-Store image rejection, optional-image persistence, sold-out catalog
  visibility, single product/minimum price, live execution flag, pinned encrypted
  production endpoint and exactly-once paid stock allocation. All payment transport
  in these tests was simulated.
- Complete web suite: 364 tests passed. An additional token-refresh regression was
  then added; all six editor tests passed. Type checks, changed-file lint and the
  web production build passed. Existing unrelated image-element warnings remain.
- Browser review at 1440px desktop and 390px mobile: editor rendered without
  horizontal overflow.
- Focused Flutter purchase/catalog and result/gallery rerun: 41 tests passed.
  Device-request boundary, bounded idle handling and other result/gallery checks
  also passed in the preceding focused run. Old assertions that Buy This Look was
  disabled were updated to expect the newly enabled action.
- A broad Flutter run was not green: existing capture/settings/navigation failures
  and repeated ten-minute preview/share timeouts occurred. It was stopped after
  recording them. A separate copy of the previous committed kiosk reproduced eight
  capture/settings/generation failures (72 passed), including the generation screen's
  setState-during-build failure. This report does not claim a fully passing broad
  kiosk regression suite or certified-device acceptance.
- The broad API sweep likewise was not an all-green gate: database-dependent suites
  lacked their default test DB configuration. Stale PhonePe assertions and a legacy
  result-finalization diagnostic issue found there were corrected and included in
  the passing focused rerun. No production database was used.

## Deployment and release steps

1. Generate Prisma client and apply
   `20261021010000_product_colors_live_checkout` through normal migration deployment.
   Deploy the API and web together. The migration adds bounded colour-image metadata
   to product_stock_settings and permits PRODUCTION order-payment snapshots.
2. Keep payment encryption/storage settings and the reconciliation worker configured.
   Configure `SELFX_PAYMENT_CALLBACK_BASE_URL` to the reachable HTTPS API origin and
   `SELFX_PHONEPE_PRODUCTION_BASE_URL` to the merchant's confirmed PhonePe Dynamic QR
   base. Do not copy an arbitrary endpoint or a frontend URL with a path.
3. In Superadmin, make PhonePe available to Stores. In the intended Store, save the
   correct PRODUCTION account, explicitly confirm Dynamic QR access and select it
   for kiosk checkout. Configure INR prices, stock/options and applicable tax.
4. Enable actual order execution with `SELFX_PHONEPE_CHECKOUT_ENABLED=true` only in
   the intended deployment. It defaults to false in .env.example. This is separate
   from `SELFX_PHONEPE_PRODUCTION_ENABLED` (optional live account verification) and
   `SELFX_PHONEPE_UAT_ENABLED` (test execution). Verification success alone does not
   enable checkout. Disabling gateway policy/selection prevents new attempts.
5. Configure the existing production signing identity in ignored
   `kiosk/android/key.properties`, using `key.properties.example` as a guide.
   Protect the keystore and passwords. Build release APKs with the correct API URL,
   `--release --split-per-abi --target-platform=android-arm,android-arm64` and a
   monotonically increasing build number. Split ABI version codes differ from the
   Flutter build number; inspect each APK before release.
6. Configure the API APK inspector and trusted production signer as described in
   APPS-1-REGIONAL-1-IMPLEMENTATION-REPORT.md. Upload the signed release drafts under
   Apps & Downloads, review, publish and mark the appropriate recommendation.
   Development/debug APKs must not be published as commercial releases.
7. Complete certified-device acceptance: option/image changes, out-of-stock Try-On,
   stock races, cart totals/tax, verified payment, failure, unknown/pending, expiry,
   callback interruption, late confirmation/staff review and customer reset. Check
   Android portrait and supported Windows layouts. Resolve the documented broad
   regression failures before a commercial rollout. No real-payment acceptance
   test or installation was performed in this session.

## Development APKs

The first universal development build succeeded. Final separate ARMv7 and ARM64
builds use version name 1.1.0 and Flutter build number 2, with the API URL compiled
as https://selfxapi-production.up.railway.app. They use the existing Android debug
certificate and are for controlled review only. They do not enable server checkout.
The APK manifest reports package com.selfx.kiosk, minimum Android API 24 and target
API 36. Split version codes are 1002 (ARMv7) and 2002 (ARM64).

Final artifact verification completed. Changed Flutter source/tests pass analysis
with no issues. Both APKs passed signature inspection with the existing Android
Debug certificate; neither has been published. ARMv7/ARM64 manifest version codes
were inspected as 1002/2002.

| Development APK | Bytes | SHA-256 |
| --- | ---: | --- |
| [ARMv7](../tmp/SHOPPING-3-development-apks/selfx-kiosk-1.1.0-armv7-development.apk) | 123565243 | 5e57702787208b2b58dfc2727cb12f55cd6932c0d7a77c1d45fc7563d772acdd |
| [ARM64](../tmp/SHOPPING-3-development-apks/selfx-kiosk-1.1.0-arm64-development.apk) | 155259879 | b8704d0422fdca70b75eb9f6045ae1a487bb30c2cafdae71c06b6f3b144dd751 |

The files are local development artifacts in the ignored tmp folder, not source
assets. Their manifest/checksum companion is checksums.json in the same folder.

A final transport review separated order-checkout and account-verification network
gates. Order requests use a validated endpoint from the encrypted attempt snapshot,
including after the configured endpoint changes. The follow-up real-PostgreSQL
order/protocol/transport/diagnostic suite passed 61 tests with all HTTP responses
simulated. Checkout can run with its own switch while optional account verification
remains disabled. Unapproved hosts/paths, redirects and wrong-purpose switches are
rejected before any HTTP request.

Release signing guard verification: `:app:assembleRelease --dry-run --offline`
failed with the expected explicit “SelfX release signing is missing” message.
This confirms release mode cannot silently produce a debug-signed commercial APK.
