# SelfX for WooCommerce — WOO-1

Installable WordPress plugin for **one-way website catalog → SelfX Store → assigned kiosks** sync. WooCommerce remains the source of truth. This milestone does not add the storefront Try-On button, customer-photo processing, cart handoff, order sync or stock writeback.

## Install and connect

1. Deploy the current SelfX API and web changes together. No WOO-1 database migration is required.
2. In SelfX **Integrations → WooCommerce**, select the correct Store (Platform users), register the connection and enter the website's canonical home URL, including any WordPress subdirectory. This is the external Store ID, not a WooCommerce API key.
3. Download the plugin from that page, or use `dist/selfx-woocommerce-0.1.0.zip` after building locally.
4. In WordPress **Plugins → Add New → Upload Plugin**, upload the ZIP and activate it with WooCommerce active. Requirements: WordPress 6.5+, WooCommerce 8.0+, PHP 8.1+, OpenSSL AES-GCM and a two-decimal currency such as INR. These are minimum declared requirements, not a certified compatibility matrix. This release targets single-site installations.
5. In SelfX, generate a catalog token. The secret is shown once; copy it directly into **WooCommerce → SelfX** in WordPress. It receives only `catalog:sync`, never Developer/API or AI-provider credentials.
6. Keep the default SelfX API address for production, or enter the public HTTPS origin of your own SelfX API. Choose **Connect and sync**. The plugin verifies the token's integration type, scope, Store identity and configured website binding before saving an encrypted credential. A different Store requires explicit confirmation. Changing API origin requires a freshly supplied token.
7. Allow WooCommerce Scheduled Actions to run. Check **WooCommerce → SelfX** for progress, last successful batch, completed full sync, counts and safe failure codes. **Sync now / retry** reconciles the catalog or resumes an incomplete scan.
8. In SelfX **Products**, enable eligible imported products for Try-On. Imports start disabled; subsequent source updates preserve SelfX eligibility/classification. Eligible products appear through the existing catalog for kiosks assigned to that Store. Refresh the kiosk catalog if already open.

SelfX requires the normal active account/Store, integration permissions and plan entitlement. WordPress connection changes require `manage_woocommerce` and a nonce. Token creation/revocation is hidden from integration viewers and enforced by authorized backend endpoints.

## What synchronizes

| WooCommerce                                               | SelfX reference                                                       |
| --------------------------------------------------------- | --------------------------------------------------------------------- |
| Simple product / variable parent                          | One Store-owned product, never one kiosk card per variation           |
| Product ID, variation ID, SKU                             | Integration-scoped external mappings                                  |
| Name, description, permalink, main image                  | Catalog reference fields                                              |
| Variation size and color/colour                           | Optional normalized mapping metadata                                  |
| Variation image                                           | Optional image URL; falls back to parent image                        |
| Current simple/variation price                            | Integer minor units and currency; parent uses minimum variation price |
| Variation stock/purchasability                            | Availability reference; no quantities or SelfX inventory mutation     |
| Draft/private/password-protected/catalog-hidden           | Inactive reference                                                    |
| Trash/permanent deletion/missing after complete full scan | Archived reference                                                    |

Out-of-stock products remain eligible for Try-On. Imported commerce references remain excluded from native SelfX purchase/stock checkout: purchases stay on the WooCommerce website. Variation metadata is retained for the next storefront milestone, not presented as native kiosk inventory. Attribute recognition uses `size`, `color`, `colour`, and corresponding `pa_` taxonomies; other attributes remain in the variation label. Products without a usable main/gallery image are skipped or archived. Grouped, external/affiliate and custom product types are inactive until separately supported. The variation limit is 2,048 per product; oversized payloads stop sync visibly rather than sending an incomplete destructive snapshot.

Prices are WooCommerce's saved current prices, not customer-specific taxes, coupons, currency-switcher prices or checkout totals. WooCommerce computes the final payable amount.

## Delivery and recovery

- Initial and daily reconciliation scan parent IDs in bounded batches, using a persisted cursor, upper ID bound and fixed SelfX-server snapshot time. Only an acknowledged terminal empty batch finalizes the snapshot.
- Product/variation edits, stock changes, trash/restore/deletion queue their parent. Scheduled sales request reconciliation. Changes coalesce; an edit received during upload is preserved using compare-and-delete acknowledgements.
- WooCommerce Action Scheduler is preferred; WordPress cron is the fallback. A five-minute dispatch recovers queued work; fallback dispatch is hourly. Run a host cron/queue runner on low-traffic sites. No browser tab needs to stay open.
- Temporary HTTP/network/database failures retry with exponential backoff, up to eight attempts per cycle. Manual retry and daily reconciliation recover failed work. Authentication/context failures block until corrected. Status displays codes, never remote error payloads or secrets.
- A WordPress worker lease and PostgreSQL transaction lock per integration serialize competing batches. Earlier snapshots cannot decrease last-seen times or archive a source update newer than that snapshot.
- Disconnecting **in WordPress** clears the local encrypted token and queue while retaining WooCommerce products and SelfX's imported catalog. Revoke the token or disconnect in SelfX to disable server access. Revoking a token does not delete catalog references. Disable a reference's Try-On eligibility in SelfX to hide it from kiosks.
- Deactivation unschedules jobs but retains configuration. Uninstall removes local options and revision metadata. It does not delete WooCommerce products or remotely revoke credentials; revoke unwanted credentials in SelfX.

## Security and privacy

Only catalog data and website identity are sent from WordPress to SelfX. No customer photos, orders, customer contacts, provider keys or raw credentials are exposed to storefront JavaScript. Tokens are encrypted with AES-256-GCM using a key derived from the WordPress authentication salt. Protect backups and salts; this does not defend against administrator/server compromise. Rotating salts or cloning the site requires reconnecting. Saved tokens are never returned to HTML inputs or logs.

HTTP uses validated public HTTPS origins, TLS verification, no redirects, fixed API paths and bounded sizes. Credentials travel in `x-selfx-integration-token`, never query strings. Keep the configured API origin trusted. Store ownership is resolved from the credential on the server, without a client-supplied Store ID. Always configure website binding, though existing unbound credentials remain compatible.

For local development only, define `SELFX_WC_ALLOW_LOCAL_API` as `true` in `wp-config.php` to permit localhost/127.0.0.1 API origins. This bypass is not editable from the plugin UI; do not enable it on hosted sites.

## Build and checks

From the repository root:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File integrations/woocommerce/scripts/build.ps1
php integrations/woocommerce/tests/plugin-test.php
```

The builder creates a ZIP and SHA-256 file in `integrations/woocommerce/dist/` and copies the ZIP to `frontend/web/public/downloads/` for the dashboard link. Only the plugin folder, PHP and readme are packaged, never tests or credentials.

Backend contract test: migrate a disposable localhost database named exactly `woocommerce_catalog_test` first. Never use the application database.

```powershell
$env:WOOCOMMERCE_TEST_DATABASE_URL='postgresql://postgres@127.0.0.1:55441/woocommerce_catalog_test'
$env:PHP_BIN='C:\Program Files\php\php.exe'
Set-Location backend/api
npx vitest run src/integrations/woocommerce-catalog.integration.spec.ts
```

The PHP harness executes real plugin classes with deterministic WordPress/Woo adapters. PostgreSQL tests send its normalized JSON through Nest validation, integration authentication, sync and kiosk catalog queries. These do not replace testing an actual WordPress installation.

## Live-site acceptance before rollout

Use staging WordPress and a dedicated SelfX Store. Verify installation, initial sync, simple/variable products, image fallback, sold-out Try-On, edit/price/stock changes, scheduled sales, trash/restore/permanent deletion, offline retry, token rotation/revocation, deactivation/reactivation and Store isolation. Check the actual Action Scheduler/host cron. Confirm no duplicate cards or customer/provider data in network payloads. The next milestone is storefront Try-On using SelfX's shared backend, then WooCommerce-native purchase continuation.
