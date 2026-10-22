=== SelfX for WooCommerce ===
Contributors: selfx
Tags: woocommerce, catalog, virtual-try-on, kiosk
Requires at least: 6.5
Requires PHP: 8.1
Stable tag: 0.1.0
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Synchronize your website catalog into your connected SelfX Store and retail kiosks.

== Description ==

One-way catalog sync for simple and variable WooCommerce products. WooCommerce controls products, prices, stock and checkout. No customer-facing Try-On button or order sync is included in this release.

Initial and daily full scans plus queued product/variation/stock/deletion changes run in the background. Status and manual retry are under WooCommerce > SelfX. Enable imported products for Try-On in SelfX. Variable products remain one kiosk card; out-of-stock products remain available for Try-On.

Requires WooCommerce 8.0+, OpenSSL AES-GCM and two-decimal currency. Targets single-site WordPress. Background delivery requires cron / WooCommerce Scheduled Actions to run.

== External service and privacy ==

Connects to your SelfX API (default https://selfxapi-production.up.railway.app). Requires a SelfX account, authorized active Store/integration and catalog token. Sends website identity and product IDs, variation IDs, SKUs, names, descriptions, image URLs, prices, size/color and availability. Does not send customers, orders or customer photographs. Connect only with authorization to share this catalog. Your SelfX service agreement/privacy policy governs that service.

Tokens are encrypted using the WordPress authentication salt. Protect salts and backups; reconnect after salt changes/site migration. Saved tokens are not displayed in HTML. Uninstall clears local plugin data but retains products and the remote catalog; revoke tokens in SelfX to terminate server access.

== Installation ==

1. Register WooCommerce in SelfX with the canonical website home URL.
2. Upload this ZIP in Plugins > Add New > Upload Plugin and activate.
3. Generate a catalog token in SelfX Integrations > WooCommerce.
4. Paste it under WooCommerce > SelfX; select Connect and sync.
5. Check status and enable eligible imported products in SelfX Products.

== Changelog ==

= 0.1.0 =
* Secure Store connection and encrypted catalog token.
* Parent/variation catalog sync, retries and reconciliation.
* Deletion handling, source ordering and status reporting.
