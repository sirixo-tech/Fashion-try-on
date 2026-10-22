# WOO-1 implementation report

Date: 2026-10-22. Status: connection and one-way catalog sync implemented and locally validated. Real WordPress/WooCommerce staging acceptance remains pending. Production has not been deployed or modified.

## Delivered

- Installable **SelfX for WooCommerce 0.1.0**, with native WordPress connection/settings under WooCommerce → SelfX.
- SelfX WooCommerce page: plugin download, installation instructions, catalog-only token generation with one-time secret display, confirmed revocation and a Platform Store selector. Store integration viewers receive read-only controls. WooCommerce copy and usage labels no longer show Shopify-specific instructions.
- Verified integration/Store/website connection, encrypted saved credential, capability/nonce protection, validated HTTPS transport without redirects and safe error codes. A changed API origin never receives the old saved token automatically.
- Initial/manual/daily full catalog reconciliation, incremental product/variation/stock updates, scheduled-sale reconciliation, trash/restore/deletion handling, persistent progress, bounded retry and background queue recovery.
- One SelfX Store product per WooCommerce parent, variation IDs/SKUs, size/color, image fallback, prices/currency and availability in external-reference metadata. Preserve SelfX-owned Try-On eligibility; sold-out products remain eligible for Try-On. Imported products do not become native SelfX inventory or purchase variants.
- Incomplete scans never finalize. Queue acknowledgement preserves edits received during an upload; stale workers cannot overwrite another worker's state. PostgreSQL serializes batches per integration, and older scans cannot regress last-seen observations or archive newer source updates.
- All six primary requirement documents updated with this explicitly requested milestone. No SelfX schema migration or new backend service is needed.

## Package

- Dashboard/installable artifact: `frontend/web/public/downloads/selfx-woocommerce-0.1.0.zip`.
- Local build output: `integrations/woocommerce/dist/selfx-woocommerce-0.1.0.zip` (generated/ignored by Git).
- SHA-256: `829baa0627bf2274de31092925a7a56bb69b311bbd869585d2a742586600a6ab`.
- Rebuild using `integrations/woocommerce/scripts/build.ps1`. Six entries, all under `selfx-woocommerce/`: five PHP files and readme.txt. No tests, credentials or project environment files are packaged.

Full setup/operating guide: [WooCommerce README](../integrations/woocommerce/README.md).

## Verification

| Check | Result |
| --- | --- |
| PHP syntax, all five plugin files | Passed using PHP 8.4.8 |
| Offline real-plugin PHP behavior | 21 checks passed |
| Backend integration/catalog/auth/controller/Shopify webhook regression suites | 98 tests passed across eight files |
| Included real PostgreSQL WooCommerce contract suite | Seven tests passed |
| Included existing PostgreSQL Store kiosk isolation suite | Passed |
| Web plugin controls and integration page | Eight tests passed |
| API and web TypeScript | Passed |
| ESLint for changed/new TypeScript files | Passed with zero warnings |
| Production Next.js build | Passed; four existing image-optimization warnings in unrelated share/Shopify pages |
| ZIP structure and checksum | Passed; public copy matches build artifact |

The PHP fixture feeds actual normalized plugin JSON through Nest DTO validation, token authentication, PostgreSQL catalog sync and Store-scoped kiosk queries. It verifies one parent with multiple variations, optional size/color validation, refusal of client Store overrides, initial disabled eligibility, tenant isolation, sold-out Try-On, preserved manual eligibility, deletion, concurrent import deduplication, old-snapshot ordering and suspended/revoked/scope-denied access.

Plugin checks use deterministic WordPress/WooCommerce adapters, not a running WordPress installation. They cover encryption/tamper rejection, origin/website checks, request headers and no redirects, product normalization, full scans/retries, failed queries, changes arriving during sync, tombstones, blocked authentication, worker leases, capability/nonces, Store-change confirmation, preventing saved-token forwarding to another origin, disconnect and secret-free escaped HTML.

Only a separate `woocommerce_catalog_test` database on the disposable PostgreSQL cluster was created/migrated (68 existing migrations). The normal local application database was untouched. The test cluster was stopped after validation.

## What to do next

1. Deploy the API and web changes together, including the public ZIP.
2. Register your website's canonical home URL under the correct SelfX Store's WooCommerce integration and generate a catalog token.
3. Upload/activate the ZIP on a staging single-site WordPress/WooCommerce installation. Paste the token under WooCommerce → SelfX and connect.
4. Verify initial sync and enable eligible imported products in SelfX Products. Check the assigned kiosk catalog, including one product with multiple variants and an out-of-stock product.
5. Exercise product/price/image/stock edits, sale transitions, deletion/restore, offline recovery, token revocation and reconnection. Confirm Scheduled Actions/host cron runs without an open browser.

Declared minimums: WordPress 6.5, WooCommerce 8.0, PHP 8.1, OpenSSL AES-GCM, two-decimal currency. These versions have not been certified against real WordPress hardware/hosting in this session. Grouped/custom product types, multicurrency checkout calculations and network/multisite administration are outside this milestone.

**Still separate:** the customer-facing WooCommerce Try-On button/page and WooCommerce-native product/cart purchase continuation. This plugin synchronizes catalog references; it does not implement those storefront flows or make real purchases.
