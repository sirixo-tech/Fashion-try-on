# SelfX for WooCommerce — 0.3.0

One-way website catalog → SelfX Store → assigned kiosks, plus a storefront **Try it on** button. WooCommerce owns products, size/color choices, prices, inventory, cart, checkout and orders. SelfX imports one parent product reference with its image and runs Virtual Try-On through the central backend. There is no stock/order writeback or SelfX checkout for imported products.

## Deploy and connect

1. Deploy API and web together after applying migration `20261024000000_woocommerce_plugin_link_sessions` and the earlier storefront migrations. Configure API `SELFX_WEB_BASE_URL` to the public HTTPS SelfX web origin. Keep normal storage, provider, entitlement and credit configuration working.
2. Download `selfx-woocommerce-0.3.0.zip`. In WordPress **Plugins → Add New → Upload Plugin**, install/update and activate with WooCommerce active. The WordPress home URL must be public HTTPS, including any subdirectory. Minimum declared requirements: WordPress 6.5+, WooCommerce 8.0+, PHP 8.1+, OpenSSL AES-GCM. Single-site support; minimum versions are not a certified compatibility matrix.
3. Open **WooCommerce → SelfX → Connect to SelfX**. Sign in or create an account, select an active SelfX Store and approve the website. Return to WooCommerce; the plugin completes the link server-to-server and queues catalog sync. A newly created eligible Store gets its one-time Starter trial; reconnecting does not add credits. Existing token-based connections remain supported under the advanced option.
4. Let Scheduled Actions/WordPress cron deliver initial sync. **Sync now / retry** recovers interrupted work. In SelfX Products, classify eligible imports and enable Try-On. New imports start disabled; website updates preserve SelfX eligibility.
5. Classic templates show the button automatically after the purchase area. For a block theme, add **SelfX Try-On** to the Single Product template, or a Shortcode block containing `[selfx_try_on]`. Place outside the cart form and choose one placement to avoid duplicates.
6. Visit an enabled product page, click **Try it on**, accept consent on SelfX, upload/take a photo, generate and view/download the result, then **Return to product**. Purchase normally through WooCommerce.

Eligibility is cached for at most 60 seconds. SelfX rechecks Store, integration, mapping, plan and product at launch/during sessions. Sold-out products can still be tried on. Disabled, hidden, archived or unsupported products have no button. Temporary API failure hides the button until eligibility can be checked.

## Public URLs and local testing

The production API cannot fetch `localhost:8881` on your computer. Use public HTTPS staging or a controlled tunnel with WordPress home/permalinks/media configured to that public address; update the SelfX website binding and reconnect. Private/loopback/metadata addresses, unsafe redirects and oversized images are rejected. Do not disable these checks.

For a local SelfX API only, `SELFX_WC_ALLOW_LOCAL_API=true` in `wp-config.php` permits localhost API origins. It does not permit private product/image URLs on a hosted API. Plugin-first linking requires a public HTTPS WordPress home URL and SelfX web origin.

## Ownership and delivery

- Sync sends parent ID, name, description, slug, original URL, main/gallery fallback image, publication state and revision. It does not import size/color inventory, variant prices or quantities. Shopify normalization uses the same boundary.
- Existing bounded full scans, deletion tombstones, stale-update protection, retries and reconciliation remain. Historic variant metadata may remain unchanged in the database; imported price displays and purchasing ignore it. Native SelfX products are preserved.
- Products without usable images are skipped/archived. SelfX controls Try-On eligibility/classification. Edit source details on the website; native SelfX product management and purchasing remain available for native products.
- WordPress disconnect clears local token/queue and retains remote references. Revoke credentials to stop new launches. Disable the integration/product in SelfX to deny existing session eligibility. Deactivation unschedules jobs; uninstall removes local configuration, not WooCommerce products or remote data.

## Security and privacy

Plugin tokens remain server-side, encrypted with AES-GCM using WP salts. Salt rotation/cloning requires reconnecting. Management requires capability/nonces. Launches use a nonce, anonymous HTTP-only visitor cookie and burst checks. SelfX resolves Store ownership from credentials, never browser input.

Customer sessions last 15 minutes. Capability tokens use a URL fragment removed after reading. Photos travel directly to SelfX after durable consent, using private assets and existing seven-day maximum retention. Durable request idempotency prevents concurrent retries from executing twice. Shared credits/channel attribution apply. No provider details or integration secrets appear in customer UI. Visitor-cookie and burst checks deter abuse; they are not strong identity or distributed edge rate limiting.

## Build and verify

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File integrations/woocommerce/scripts/build.ps1
php integrations/woocommerce/tests/plugin-test.php
```

Builder inspects the ZIP, writes SHA-256 in `integrations/woocommerce/dist`, and copies the ZIP to `frontend/web/public/downloads`. Only six PHP files, editor JavaScript and readme are packaged.

The guarded backend suite requires a migrated disposable localhost database named exactly `woocommerce_catalog_test`:

```powershell
$env:WOOCOMMERCE_TEST_DATABASE_URL='postgresql://postgres@127.0.0.1:55441/woocommerce_catalog_test'
$env:PHP_BIN='C:\Program Files\php\php.exe'
Set-Location backend/api
npx vitest run src/integrations/woocommerce-catalog.integration.spec.ts
```

Before rollout test real public WordPress staging: classic/block templates, enabled/disabled/sold-out products, consent/photo/generation/result/return, token revocation, suspended Store, no-credit/plan failures and kiosk refresh. Automated tests mock provider execution; they do not certify live merchant sites or hardware. Rebuild/update the kiosk app to receive imported-product purchase controls.
