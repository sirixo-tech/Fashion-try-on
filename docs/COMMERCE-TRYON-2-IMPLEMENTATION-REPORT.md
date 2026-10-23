# COMMERCE-TRYON-2 implementation report

Date: 2026-10-23. Status: implementation and targeted local verification complete; production deployment and live website/device acceptance remain.

## Result

WooCommerce product pages can launch SelfX Try-On through a server-side plugin connection. Customers accept consent, upload/take a photo on SelfX, generate, view/download the result and return to the original product page. Classic templates have automatic placement; block templates can use SelfX Try-On or `[selfx_try_on]` outside cart forms.

Both WooCommerce and Shopify normalization now import one parent product reference and image. Size/color inventory, prices, cart, checkout and orders remain on the website. Sold-out products remain eligible for Try-On. Native SelfX product management and purchasing remain available for native products.

## Changes

- WooCommerce plugin 0.2.0: server-only credential launch, eligibility cache, nonce and visitor/burst checks, trusted fixed-path redirect, classic hook, dynamic block and shortcode. Dashboard generates a plugin token with `catalog:sync` plus `tryon:create` and links the new ZIP.
- Extracted CommerceStorefrontTryOnService from the Shopify implementation. Existing Shopify imports/DI retain a compatibility export. Both channels share session, upload, private assets, entitlement/credit accounting and provider execution. WooCommerce attribution uses WOOCOMMERCE.
- Woo launch/context resolves Store from the authenticated integration and verifies active Store/integration, matching root product mapping, product eligibility, plan and a same-origin original product URL. Clients cannot choose Store or return URL.
- Explicit consent is recorded as a durable versioned AuditLog record before accepting photo bytes or creating a run. Photos/results retain existing private asset access and at-most-seven-day cleanup. Capabilities expire after 15 minutes and new Woo links carry their token in a fragment removed after reading.
- Generation retries use a stable browser request ID and a unique hashed session/request key in the database. Concurrent identical requests return one run and execute the provider once. New runs do not snapshot imported website prices.
- Public product/image URL validation rejects localhost/private/metadata addresses. Image downloads pin validated DNS addresses, revalidate redirects, bound bytes and time out requests. WordPress reports actionable public-URL failures instead of submitting invalid local catalog URLs.
- Store product rows expose source, website link and SelfX Try-On controls; imported stock/edit/delete controls are hidden. Server-side source-field edits/deletion are rejected. Native stock/purchase services retain their external-product rejection.
- Kiosk catalog/results/My Looks carry nativePurchasingAllowed and hide price/native buying for imported products. Image-cache copies preserve the flag. Catalog revision format is bumped so connected kiosks refresh older payloads. Native buying/download flows remain supported.
- Updated all six main project documents and the plugin installation/privacy instructions. Historic imported variant metadata is not destructively purged; it is ignored by the new UI/purchasing boundary.

## Database

Added migration `20261023000000_storefront_request_idempotency`: nullable unique CHAR(64) `kiosk_try_on_runs.storefront_request_key`. Existing runs retain NULL. No new inventory, order or tenant tables.

Reused the historic ShopifyStorefrontTryOnSession table as internal commerce capability storage. Integration type determines channel; Woo shopDomain stores the canonical website URL. Historic names are internal compatibility details.

Applied all 69 migrations to disposable localhost `woocommerce_catalog_test`. Backed up the local application database to `tmp/selfx-before-commerce-20261023-011352.dump` (394,614 bytes), then applied the additive migration to `localhost:5433/selfx`. Production database was not changed.

## Verification

| Check | Result |
| --- | --- |
| Backend integration/catalog/kiosk/session regressions | 175 passed, 16 DB-guarded tests skipped in that run |
| Focused storefront, URL-fetch, native commerce and real Woo PostgreSQL suite | 46 passed; includes the 9 Woo database integration cases |
| Shopify mapper/connector/admin client/webhook forwarding | 27 passed |
| Web product/editor/integration/consent/customer flow tests | 31 passed |
| PHP harness | 26 passed; all six plugin PHP files passed syntax checks |
| Flutter changed catalog/cache/My Looks and native purchase/catalog UI | 25 passed |
| Flutter analyze | No issues |
| Backend and web types; Shopify integration compilation | Passed |
| Changed TypeScript/JavaScript lint and whitespace checks | Passed |
| Next production build | Passed; existing img optimization warnings remain in the unrelated shared-looks route |
| Android debug APK | Built successfully; existing Java/Kotlin future-compatibility notices only |
| Plugin package | Inspected eight expected files, built ZIP and SHA-256 |

Tests use mocked provider/storage execution and disposable database fixtures; no real AI generation, payment or outgoing mail was performed. A broader kiosk pipeline run was interrupted when its existing async file-based download-expiry test stalled; the 25 focused relevant tests completed independently. This is not a claim that the entire repository test suite completed.

Shopify AI Toolkit schema validation passed for the existing product reference fields against 2026-01. Toolkit documentation search could not fetch from this runtime; no Admin GraphQL operation or app configuration was changed.

## Artifacts

- Plugin: `frontend/web/public/downloads/selfx-woocommerce-0.2.0.zip` (dashboard download path `/downloads/selfx-woocommerce-0.2.0.zip`).
- Build copy/checksum: `integrations/woocommerce/dist/selfx-woocommerce-0.2.0.zip` and `.zip.sha256`.
- Plugin SHA-256: `21356f0ea06002fd3d5d827933f6830c9510537f6d8311397b71b6a43186164c`.
- Kiosk debug APK: `mobile/kiosk/build/app/outputs/flutter-apk/app-debug.apk`. This is a local test build, not a published release.

## Deployment and acceptance

1. Deploy API/web together and run `npm run db:migrate:deploy` against the intended production database using the normal deployment process. Configure API `SELFX_WEB_BASE_URL` to the public HTTPS SelfX web origin.
2. Deploy the Shopify integration build too so its normalizer sends Try-On references only.
3. Install/update Woo plugin 0.2.0, generate a new two-scope token and reconnect. Keep Store identity/website binding correct. Revoke retired credentials when rotation is complete.
4. Use public HTTPS staging product/media URLs. A hosted API cannot fetch this computer's localhost WordPress. Configure WordPress canonical URL/media and the SelfX binding consistently; do not relax SSRF protections.
5. Sync, classify and enable products. Add the block/shortcode for block themes. Rebuild/install the appropriate kiosk release or use the debug APK for controlled device testing, then refresh its catalog.
6. Verify actual classic/block templates, mobile capture, one authorized generation, result/download/return, enabled/disabled/sold-out items, depleted credits, entitlement denial, Store isolation, token revocation and native website checkout. No variant/cart bridge is required.

A token revocation stops new plugin-authenticated launches. Previously issued capabilities expire independently; disabling the integration/product or suspending the Store denies eligibility during existing sessions. Visitor-cookie/burst limits are abuse deterrents rather than strong customer identity or atomic distributed edge rate limiting. Reloading the fragment launch page after its token is removed requires returning to the product page and launching again.
