=== SelfX for WooCommerce ===
Tags: woocommerce, catalog, virtual-try-on, kiosk
Requires at least: 6.5
Tested up to: 7.1
Requires PHP: 8.1
Stable tag: 0.5.2
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Add SelfX Try-On to product pages and synchronize product references to your SelfX Store/kiosks.

== Description ==

WooCommerce owns products, sizes, colors, prices, stock, cart, checkout and orders. SelfX imports one image/reference per simple or variable parent, never variation inventory. Sold-out products can still be tried on. Enable imported products for Try-On in SelfX Products.

Classic templates show Try it on automatically. Block themes can add SelfX Try-On or [selfx_try_on] in a Shortcode block to the Single Product template. Place outside cart forms. Customers consent, upload/take a photo and view their result on SelfX, then return to the original product page to purchase normally.

Requires WooCommerce 8.0+, OpenSSL AES-GCM, active SelfX Store/integration and plan/credits, and public product/image URLs. Localhost media cannot be fetched by hosted SelfX. Single-site WordPress. Background sync requires cron / WooCommerce Scheduled Actions.

= External service and privacy =

SelfX is an external service that provides catalog sync and virtual Try-On. The plugin connects to the [SelfX API](https://selfxapi-production.up.railway.app/) and directs merchants and shoppers to the [SelfX website](https://selfxweb-production.up.railway.app/) for approval and Try-On. See the [Privacy policy](https://selfxweb-production.up.railway.app/privacy), [Terms of service](https://selfxweb-production.up.railway.app/terms) and [Support](https://selfxweb-production.up.railway.app/support).

* **Connection:** When you choose Connect to SelfX, the plugin sends your public website URL and temporary verification details for the approval and return to WordPress. Once you approve the connection, the plugin receives a Store integration credential and stores it encrypted on your WordPress server. The credential authenticates subsequent requests.
* **Catalog sync:** After approval, SelfX receives parent product IDs, names, descriptions, slugs, product URLs, image URLs, publication status and revision timestamps. SelfX can fetch the referenced product images. The plugin does not send WordPress customer accounts, orders, payment details, variant stock or prices.
* **Usage settings:** When you save visitor or monthly Try-On limits in WooCommerce > SelfX, the plugin sends those limits and the visitor reset period to SelfX.
* **Try-On:** For a connected Store, the plugin sends the product ID to check eligibility. When a shopper starts a Try-On, it also sends the site's language and an anonymous identifier held in a browser cookie to enforce usage limits. Shoppers provide consent and upload or take their photo directly on SelfX. SelfX processes the photo there, and sensitive photo and result assets expire within seven days.

Uninstalling clears local plugin data and leaves WooCommerce products and the remote catalog in place. Revoke the integration credential in SelfX to stop new launches. Disable the integration or product in SelfX to block eligibility for existing sessions.

= Account, plans and pricing =

The WordPress plugin is free to install. Catalog sync and Try-On require a SelfX account, an active connected SelfX Store and a plan that supports WooCommerce. Running Try-On also requires available credits or enabled usage billing, depending on the plan.

Eligible new Stores can receive a one-time Starter trial with no monthly fee and a default allowance of 10 shared Try-On credits. Check the allowance shown in your SelfX account. Reconnecting does not grant another trial. Ongoing paid plans and any additional credit or usage charges are billed separately through SelfX. Open [Store billing in SelfX](https://selfxweb-production.up.railway.app/app/billing) after signing in to see the plans, prices, currency and usage rates applicable to your Store before purchasing.

== Installation ==

1. Install and activate WooCommerce on your public HTTPS WordPress site.
2. In WordPress, go to Plugins > Add New and search for SelfX for WooCommerce, or choose Upload Plugin if you have the ZIP. Install and activate the plugin.
3. Open WooCommerce > SelfX and choose Connect to SelfX.
4. Sign in or create a SelfX account, select your active SelfX Store and approve the website. You'll return to WordPress, where the plugin finishes the connection and queues the first sync. Use Retry connection if the connection does not complete.
5. Check the sync status in WooCommerce > SelfX. In SelfX Products, classify the imported products and enable Try-On for the ones you want shoppers to use.
6. Classic product templates show the button automatically. For a block theme, add the SelfX Try-On block or a Shortcode block containing `[selfx_try_on]` to the Single Product template outside the cart form. Use one placement per template.

== Customize the Try-On block ==

In Appearance > Editor, open the Single Product template and select SelfX Try-On.
Change Button text in the block settings. In Styles, choose text/background
colors (including theme palettes/gradients), typography, padding/margins and
border width, style, color and radius. Available controls follow your theme.
The button previews changes in the editor; save the template to publish them.
The preview is illustrative: live buttons still require an eligible product.
Each block has its own styles. Existing blocks use the default Try it on label.
Automatic classic placement and shortcodes retain theme styling; these editor
controls apply to the SelfX Try-On block. Use one placement to avoid duplicates.

== Changelog ==

= 0.5.2 =
* Matched the WordPress.org plugin folder and translation domain to selfx-for-woocommerce.
* Hardened connection return, settings and Try-On input handling, and verified classic form output escaping.

= 0.5.1 =
* Updated WordPress installation, external service, privacy and pricing disclosures.
* Updated a WooCommerce usage-limit message to refer to the Store's Try-On spending cap.

= 0.5.0 =
* Native WordPress Try-On block styling with a live button preview and editable text.
* Theme-aware colors, gradients, typography, spacing and borders on the storefront button.

= 0.4.0 =
* Central Store-owned visitor and monthly allowances with WordPress management controls.
* Clear credit, connection, product and allowance errors with safe recovery guidance.
* Keep reconnections bound to the approved SelfX Store.
* Expanded service/privacy disclosures and release checks.

= 0.3.2 =
* Complete approved connections on a verified WordPress admin return, without an extra click.

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
