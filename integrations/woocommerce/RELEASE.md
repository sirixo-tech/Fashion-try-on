# WooCommerce release verification

Run `scripts/release-check.ps1 -Submission -PhpPath <php.exe>` to build `dist/selfx-for-woocommerce-<version>-wordpress-org.zip`. The release checker runs PHP lint and the behavior harness, verifies the version and disclosures, and writes the allowlisted ZIP and SHA-256. The WordPress.org package uses the assigned `selfx-for-woocommerce/` folder and translation domain. The source directory and main PHP filename are retained. The dashboard download still uses the stable `selfx-woocommerce.zip` filename and its separate build mode.

WordPress treats a manually installed copy in the old `selfx-woocommerce/` folder as a separate plugin. Deactivate that copy before activating the new folder. If retaining the connection, remove the inactive old files through the filesystem because WordPress's Delete action runs the shared-state cleanup in `uninstall.php`. The settings, API routes, action scheduler group and block name use their existing identifiers.

## Plugin Check review for 0.5.2

The two exception findings were false positives. Both exception messages can contain only exact allowlisted API error codes. The admin and storefront render escaped text, while the unchanged machine codes drive retry and HTTP status decisions. The classic button also assembled already-escaped HTML. It now applies a final allowlist for the form, hidden fields and button. The block render keeps WordPress's generated style attributes.

Connection and limit updates require `manage_woocommerce` and their respective form nonce before reading POST values. The cross-site approval return requires the same capability and a random state token that matches the stored hash. The route flags only select the callback. Invalid state now returns 403 before changing the saved connection or sync status. Origin, credentials, limits and visitor IDs use exact validation. The storefront verifies the product-bound nonce before looking up the product or contacting SelfX, and the rate limiter uses a validated IP address. Inline PHPCS notes apply only to the individual checks that cannot infer these validation paths.

Plugin Check 2.2.0 reported zero errors and nine database warnings under `selfx-for-woocommerce`. These are intentional direct queries for the sync queue and snapshot. They remain visible for review.

| Location in `includes/class-selfx-wc-plugin.php` | Warnings | Reason |
| --- | --- | --- |
| 286 | Direct query, no cache | Reads at most five live queue entries in insertion order. A cached batch could miss a concurrent edit. The prefix is escaped and bound as a prepared parameter. |
| 292 | Direct query | Atomically deletes the exact option value the worker acknowledged. A separate read and delete could remove a newer edit or lease. Successful deletes invalidate the option cache. |
| 298 | Direct query, no cache | Lists current plugin queue keys for disconnect and uninstall by a prepared prefix. Each deletion uses `delete_option()` to update the WordPress cache. |
| 333 | Direct query, no cache | Reads the current maximum product ID once to bound a new full scan. Each scan persists its own snapshot and reuses that boundary on retry. |
| 370 | Direct query, no cache | Fetches at most five live product IDs within the prepared cursor and snapshot bounds. An empty or stale page can affect finalization, so each read uses the database. |

The plugin remains GPLv2 or later. SelfX is a separately operated account-based service with paid plans. The readme describes catalog/website data transfer, customer photo processing on SelfX, seven-day sensitive-image retention, local token encryption and uninstall behavior. No external updater or directory upload is implemented.

Before public distribution:

1. Deploy the matching API/web and required migrations to staging. Verify the public service, privacy and support URLs and obtain final publisher-approved copy.
2. Install/update the ZIP on a public HTTPS WordPress/WooCommerce staging site. Exercise classic and block product pages, simple/variable/sold-out/disabled products, connection returns, same-Store reconnect, limits on existing sessions, cron retries and safe errors. In the Single Product editor, check Try-On label and native color/palette/gradient, typography, spacing and border controls; save, reload and compare the preview with the live button. Verify two blocks keep independent styles, existing unstyled blocks still work, and shortcodes/automatic placement do not inherit another block's attributes. Check both the declared minimum WordPress 6.5 and current WordPress with themes that expose the corresponding controls.
3. Exercise the customer consent/photo/result/return journey with explicitly authorized provider usage. Verify private media access and cleanup, revoked credentials and suspended Stores.
4. Run the official WordPress Plugin Check and resolve its findings. Test supported WordPress/WooCommerce/PHP combinations; minimum declared versions are not a compatibility certification.
5. Confirm WordPress.org publisher ownership, trademark/readme requirements, service terms and current directory review requirements, then submit for review with separate authorization.

No production migration, live merchant installation or directory publication was performed during implementation.
