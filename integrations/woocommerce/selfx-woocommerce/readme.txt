=== SelfX for WooCommerce ===
Contributors: selfx
Tags: woocommerce, catalog, virtual-try-on, kiosk
Requires at least: 6.5
Requires PHP: 8.1
Stable tag: 0.3.1
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Add SelfX Try-On to product pages and synchronize product references to your SelfX Store/kiosks.

== Description ==

WooCommerce owns products, sizes, colors, prices, stock, cart, checkout and orders. SelfX imports one image/reference per simple or variable parent, never variation inventory. Sold-out products can still be tried on. Enable imported products for Try-On in SelfX Products.

Classic templates show Try it on automatically. Block themes can add SelfX Try-On or [selfx_try_on] in a Shortcode block to the Single Product template. Place outside cart forms. Customers consent, upload/take a photo and view their result on SelfX, then return to the original product page to purchase normally.

Requires WooCommerce 8.0+, OpenSSL AES-GCM, active SelfX Store/integration and plan/credits, and public product/image URLs. Localhost media cannot be fetched by hosted SelfX. Single-site WordPress. Background sync requires cron / WooCommerce Scheduled Actions.

== External service and privacy ==

Connects to your SelfX API (default https://selfxapi-production.up.railway.app). The plugin pairs with a SelfX Store through a short-lived approval link and receives its credential server-to-server. Sends website identity, parent IDs, names, descriptions, URLs, images, publication state and revisions. No order/inventory writeback. Launch uses an anonymous HTTP-only visitor cookie. Photo processing happens directly on SelfX after consent under your SelfX service agreement/privacy policy. Sensitive assets expire within at most seven days.

Tokens are encrypted using WP salts, never shown in storefront HTML. Reconnect after salt changes/site migration. Uninstall clears local data but retains products and remote catalog. Revoke tokens in SelfX to stop new launches; disable integration/product for existing session eligibility denial. Short-lived sessions expire separately.

== Installation ==

1. Deploy current SelfX API/web with WooCommerce linking migration and HTTPS SELFX_WEB_BASE_URL.
2. Upload this ZIP in Plugins > Add New > Upload Plugin and activate on a public HTTPS website.
3. Open WooCommerce > SelfX and choose Connect to SelfX.
4. Sign in or create a SelfX account, choose the active Store and approve the website. Return to WooCommerce to finish and start sync.
5. Check sync status; classify and enable imports in SelfX Products.
6. Use automatic classic placement or block/shortcode for block themes.

== Changelog ==

= 0.3.1 =
* Fix the empty JSON POST that prevented completing a SelfX connection.
* Use a stable plugin ZIP name and installation directory.

= 0.3.0 =
* Plugin-first SelfX Store approval and server-to-server credential exchange.
* Live Store plan, credit balance or pay-as-you-go usage in WooCommerce settings.

= 0.2.0 =
* Product-page Try-On button, block/shortcode and server-side launch.
* Shared SelfX consent/photo/generation/result and return to product.
* Parent reference-only catalog, public URL diagnostics, source-owned purchase controls.

= 0.1.0 =
* Secure connection, encrypted token and background catalog synchronization.
