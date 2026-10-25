# WooCommerce 0.5.0 distribution preparation

The installable artifact is `dist/selfx-woocommerce.zip`; its stable filename installs into `selfx-woocommerce/`. The same package is copied to the SelfX dashboard downloads directory. `scripts/release-check.ps1` checks PHP syntax, the behavioral harness, matching plugin/readme versions, service/privacy/support disclosures and the package allowlist, then writes SHA-256.

The plugin remains GPLv2 or later. SelfX is a separately operated account-based service with paid plans. The readme describes catalog/website data transfer, customer photo processing on SelfX, seven-day sensitive-image retention, local token encryption and uninstall behavior. No external updater or directory upload is implemented.

Before public distribution:

1. Deploy the matching API/web and required migrations to staging. Verify the public service, privacy and support URLs and obtain final publisher-approved copy.
2. Install/update the ZIP on a public HTTPS WordPress/WooCommerce staging site. Exercise classic and block product pages, simple/variable/sold-out/disabled products, connection returns, same-Store reconnect, limits on existing sessions, cron retries and safe errors. In the Single Product editor, check Try-On label and native color/palette/gradient, typography, spacing and border controls; save, reload and compare the preview with the live button. Verify two blocks keep independent styles, existing unstyled blocks still work, and shortcodes/automatic placement do not inherit another block's attributes. Check both the declared minimum WordPress 6.5 and current WordPress with themes that expose the corresponding controls.
3. Exercise the customer consent/photo/result/return journey with explicitly authorized provider usage. Verify private media access and cleanup, revoked credentials and suspended Stores.
4. Run the official WordPress Plugin Check and resolve its findings. Test supported WordPress/WooCommerce/PHP combinations; minimum declared versions are not a compatibility certification.
5. Confirm WordPress.org publisher ownership, trademark/readme requirements, service terms and current directory review requirements, then submit for review with separate authorization.

No production migration, live merchant installation or directory publication was performed during implementation.
