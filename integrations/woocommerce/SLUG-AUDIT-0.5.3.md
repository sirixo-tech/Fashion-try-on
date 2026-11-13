# SelfX for WooCommerce 0.5.3: requested-slug submission

## Scope and baseline

The user requested `selfx-tryon` for this new release. That instruction supersedes the previous `selfx-for-woocommerce` packaging target. It does not establish that WordPress.org has assigned or approved the new slug.

Before editing, all nine files in `dist/selfx-for-woocommerce-0.5.2-wordpress-org.zip` were compared with the corrected 0.5.2 source and matched byte for byte. That archive and all older release artifacts remain unchanged. Source edits precede rebuilding; no archive was patched by hand.

Only `integrations/woocommerce` source, tests, scripts and documentation were changed. No Shopify app, backend, frontend download, installed merchant site or deployment configuration was modified. Nothing was uploaded, submitted or published.

## Classification made before edits

| Occurrence category                                                                                                                                          | Decision                                                                                                         |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| `selfx-for-woocommerce` in the plugin header, PHP translation calls, block JavaScript and `block.json`                                                       | Change to `selfx-tryon`; these are WordPress translation identifiers.                                            |
| Submission `$slug` in `scripts/build.ps1`, current submission filename/folder instructions in `RELEASE.md`, block-domain assertion and `plugins_url` fixture | Change to `selfx-tryon`; these depend on the requested directory slug.                                           |
| Source-directory paths and main file `selfx-woocommerce.php` in scripts/tests                                                                                | Preserve. Source location and entry filename are independent of the ZIP's top-level folder.                      |
| `selfx-woocommerce` scheduler group, admin menu/page/return identifiers, and redemption header                                                               | Preserve. Existing jobs, connection returns and SelfX API validation use these contracts.                        |
| Existing stable dashboard filename `selfx-woocommerce.zip` and its frontend download link                                                                    | Preserve and do not rebuild/copy that artifact in submission mode.                                               |
| Old slug in the 0.5.2 changelog and previous Plugin Check review                                                                                             | Preserve as explicitly dated release history. Current release instructions use the new slug.                     |
| Previous ZIPs, SHA-256 sidecars and Plugin Check JSON in `dist`                                                                                              | Preserve as immutable historical artifacts, including their archive folder names and report messages.            |
| Old-folder upgrade instructions                                                                                                                              | Retain both old folder names to explain safe transitions. Do not treat them as the current slug.                 |
| Backend connection-return validation/tests, redemption header reader, frontend download link/tests and old project implementation reports                    | Inspect and preserve. These are compatibility contracts or historical records outside this release's edit scope. |

The API token prefix `selfx_woocommerce_`, stored `selfx_wc_*` options, revision metadata, hooks, REST/API paths, `selfx/try-on` block identity, shortcode, CSS classes and all external SelfX URLs also remain unchanged. These underscore identifiers are not either of the hyphenated slugs searched for. Version header, runtime constant, readme stable tag/changelog and submission filename identify the new release as **0.5.3**. The visible plugin name remains **SelfX for WooCommerce**.

The occurrence inventory below records each pre-edit matching line, including mixed lines that contain both a changed submission identifier and a retained compatibility identifier. Generated historical ZIP contents are classified as a whole rather than searched as compressed binary text; the corrected 0.5.2 ZIP was separately verified against source.

## Safe installed-folder transition

WordPress identifies plugins by folder plus main filename. An installed `selfx-for-woocommerce/selfx-woocommerce.php` or `selfx-woocommerce/selfx-woocommerce.php` is a different plugin entry from `selfx-tryon/selfx-woocommerce.php`; uploading the new ZIP does not replace it automatically.

Deactivate the old copy, install and activate the new copy on the same site, and never activate both together. Keep the database and WordPress salts unchanged so encrypted credentials remain usable. When preserving the connection, remove inactive old files through the filesystem; do not use WordPress's Delete action, which runs `uninstall.php` and removes the shared plugin data. Same-folder updates after moving to `selfx-tryon/` can use normal WordPress replacement. No automatic migration or credential rewrite was added.

## Verification

Prepared on November 13, 2026:

- ZIP: `integrations/woocommerce/dist/selfx-tryon-0.5.3-wordpress-org.zip` (23,521 bytes).
- SHA-256: `3bc09cad829a3115d87b6f2260fa68046c78d67bd8f78e38733c259540800f8c`; sidecar: `selfx-tryon-0.5.3-wordpress-org.zip.sha256`.
- PHP 8.4.8 lint passed for all six packaged PHP files; all **36 behavior checks passed**. Block JavaScript syntax passed. Header/runtime version, stable tag, changelog, PHP/JavaScript translation domains and block metadata checks passed.
- ZIP contains exactly nine files below one `selfx-tryon/` root. All nine match source byte for byte. No tests, scripts, development documents, reports, dependencies, credentials, logs or prior ZIPs are packaged. Old ZIP checksum sidecars still match; the dashboard download retains its previous checksum and was not rebuilt.
- Fresh local ZIP installation/activation passed on **WordPress 7.1.4 / WooCommerce 11.2.2 / PHP 8.4.8**, including visible plugin name, domain, unchanged native block identity and empty initial connection state.
- Installed the actual corrected **0.5.2 ZIP**, paired it against a mocked SelfX service, and exercised sync/finalization, plan rendering, classic form/nonces, styled native block and storefront launch/redirect. Recorded a hash of encrypted connection, Store binding, sync and pending-link state; deactivated the old folder, installed/activated 0.5.3 and verified the hash was unchanged, the stored credential still decrypted correctly, and only the new SelfX copy was active. The same mocked behavior smoke checks passed after transition without re-pairing.
- Local Plugin Check readme parser accepted the existing visible name and 0.5.3 stable tag, with **no parser warnings**. The full Plugin Check run also found no readme errors/warnings.
- Plugin Check **2.2.0**, new-submission mode with its documented CLI runtime bootstrap, reported **0 errors and 9 warnings**. Finding file, line, column, type and code match corrected 0.5.2 exactly. No new slug, text-domain, trademark or translation errors were introduced. Raw output and normalized JSON are in `dist/selfx-tryon-0.5.3-plugin-check-output.txt` and `dist/selfx-tryon-0.5.3-plugin-check.json`.

After the actual folder transition, Plugin Check's **update mode**, also with the CLI runtime bootstrap, independently reported **0 errors and 9 warnings**. Its raw and normalized results are `dist/selfx-tryon-0.5.3-plugin-check-update-output.txt` and `dist/selfx-tryon-0.5.3-plugin-check-update.json`.

The remaining nine warning records are five `WordPress.DB.DirectDatabaseQuery.DirectQuery` and four `WordPress.DB.DirectDatabaseQuery.NoCaching` findings in `includes/class-selfx-wc-plugin.php`, lines 286, 292, 298, 333 and 370. Live queue reads, atomic compare-delete, queue cleanup and bounded product snapshot/cursor queries have the concurrency/freshness reasons already documented in `RELEASE.md`; they remain visible rather than globally suppressed. No new runtime code was needed to resolve findings.

Local SelfX responses are simulated, and WordPress external HTTP is blocked in the disposable test configuration. No live SelfX pairing, paid provider execution or image generation is claimed. Public HTTPS merchant-site testing, declared-minimum-version/theme combinations, directory ownership/slug approval and WordPress.org review remain separate acceptance work. The isolated MySQL test server is stopped after verification.

Reproduction:

```powershell
& integrations/woocommerce/scripts/release-check.ps1 -Submission -PhpPath 'C:\Program Files\php\php.exe'
# On an isolated WordPress installation with WooCommerce and Plugin Check:
# wp plugin check selfx-tryon --format=json --require=<plugin-check-path>/cli.php
# wp plugin check selfx-tryon --mode=update --format=json --require=<plugin-check-path>/cli.php
```

Exact ZIP entries:

```text
selfx-tryon/readme.txt
selfx-tryon/selfx-woocommerce.php
selfx-tryon/uninstall.php
selfx-tryon/assets/block.js
selfx-tryon/assets/block.json
selfx-tryon/includes/class-selfx-wc-client.php
selfx-tryon/includes/class-selfx-wc-plugin.php
selfx-tryon/includes/class-selfx-wc-product.php
selfx-tryon/includes/class-selfx-wc-storefront.php
```

Readme validation runs locally through Plugin Check's readme parser/checks. The readme and plugin archive are not sent to the public WordPress.org validator or upload endpoint. Reference documentation: [WordPress text domains](https://developer.wordpress.org/plugins/internationalization/how-to-internationalize-your-plugin/#text-domains) and [Plugin Check CLI/runtime guidance](https://wordpress.org/plugins/plugin-check/).

## Pre-edit matching-line inventory

The path/line numbers below refer to the corrected 0.5.2 baseline, before this release's edits.

```text
integrations/woocommerce\tests\plugin-test.php:64:function plugins_url($path, $file) { return 'https://website.example/wp-content/plugins/selfx-for-woocommerce/assets/block.js'; }
integrations/woocommerce\tests\plugin-test.php:138:require __DIR__ . '/../selfx-woocommerce/includes/class-selfx-wc-client.php';
integrations/woocommerce\tests\plugin-test.php:139:require __DIR__ . '/../selfx-woocommerce/includes/class-selfx-wc-product.php';
integrations/woocommerce\tests\plugin-test.php:140:require __DIR__ . '/../selfx-woocommerce/includes/class-selfx-wc-plugin.php';
integrations/woocommerce\tests\plugin-test.php:141:require __DIR__ . '/../selfx-woocommerce/includes/class-selfx-wc-storefront.php';
integrations/woocommerce\tests\plugin-test.php:227:    equal($block_registration['textdomain'], 'selfx-for-woocommerce');
integrations/woocommerce\tests\plugin-test.php:414:    equal($redeem[1]['headers']['x-selfx-woocommerce-redeem-secret'] !== '', true);
integrations/woocommerce\tests\plugin-test.php:450:    $_GET = array('page' => 'selfx-woocommerce', 'selfx_return' => '1', 'selfx_state' => str_repeat('x', 43));
integrations/woocommerce\scripts\release-check.ps1:4:$pluginRoot = Join-Path $wooRoot 'selfx-woocommerce'
integrations/woocommerce\scripts\release-check.ps1:5:$header = Get-Content -LiteralPath (Join-Path $pluginRoot 'selfx-woocommerce.php') -Raw
integrations/woocommerce\selfx-woocommerce\selfx-woocommerce.php:12: * Text Domain: selfx-for-woocommerce
integrations/woocommerce\selfx-woocommerce\selfx-woocommerce.php:23:            echo '<div class="notice notice-error"><p>' . esc_html__('SelfX requires WooCommerce to be active.', 'selfx-for-woocommerce') . '</p></div>';
integrations/woocommerce\README.md:8:2. Download `selfx-woocommerce.zip`. In WordPress **Plugins → Add New → Upload Plugin**, install/update and activate with WooCommerce active. The WordPress home URL must be public HTTPS, including any subdirectory. Minimum declared requirements: WordPress 6.5+, WooCommerce 8.0+, PHP 8.1+, OpenSSL AES-GCM. Single-site support; minimum versions are not a certified compatibility matrix.
integrations/woocommerce\RELEASE.md:3:Run `scripts/release-check.ps1 -Submission -PhpPath <php.exe>` to build `dist/selfx-for-woocommerce-<version>-wordpress-org.zip`. The release checker runs PHP lint and the behavior harness, verifies the version and disclosures, and writes the allowlisted ZIP and SHA-256. The WordPress.org package uses the assigned `selfx-for-woocommerce/` folder and translation domain. The source directory and main PHP filename are retained. The dashboard download still uses the stable `selfx-woocommerce.zip` filename and its separate build mode.
integrations/woocommerce\RELEASE.md:5:WordPress treats a manually installed copy in the old `selfx-woocommerce/` folder as a separate plugin. Deactivate that copy before activating the new folder. If retaining the connection, remove the inactive old files through the filesystem because WordPress's Delete action runs the shared-state cleanup in `uninstall.php`. The settings, API routes, action scheduler group and block name use their existing identifiers.
integrations/woocommerce\RELEASE.md:13:Plugin Check 2.2.0 reported zero errors and nine database warnings under `selfx-for-woocommerce`. These are intentional direct queries for the sync queue and snapshot. They remain visible for review.
integrations/woocommerce\selfx-woocommerce\readme.txt:61:* Matched the WordPress.org plugin folder and translation domain to selfx-for-woocommerce.
integrations/woocommerce\scripts\build.ps1:5:$pluginRoot = Join-Path $wooRoot 'selfx-woocommerce'
integrations/woocommerce\scripts\build.ps1:6:$header = Get-Content -LiteralPath (Join-Path $pluginRoot 'selfx-woocommerce.php') -Raw
integrations/woocommerce\scripts\build.ps1:9:$slug = 'selfx-for-woocommerce'
integrations/woocommerce\scripts\build.ps1:16:$filename = if ($Submission) { "$slug-$version-wordpress-org.zip" } else { 'selfx-woocommerce.zip' }
integrations/woocommerce\scripts\build.ps1:22:    'selfx-woocommerce.php',
integrations/woocommerce\selfx-woocommerce\assets\block.json:9:  "textdomain": "selfx-for-woocommerce",
integrations/woocommerce\selfx-woocommerce\assets\block.js:4:  const defaultLabel = i18n.__("Try it on", "selfx-for-woocommerce");
integrations/woocommerce\selfx-woocommerce\assets\block.js:25:            { title: i18n.__("Try-On button", "selfx-for-woocommerce") },
integrations/woocommerce\selfx-woocommerce\assets\block.js:27:              label: i18n.__("Button text", "selfx-for-woocommerce"),
integrations/woocommerce\selfx-woocommerce\assets\block.js:38:                "selfx-for-woocommerce",
integrations/woocommerce\selfx-woocommerce\includes\class-selfx-wc-storefront.php:58:        if ($label === '') { $label = __('Try it on', 'selfx-for-woocommerce'); }
integrations/woocommerce\selfx-woocommerce\includes\class-selfx-wc-storefront.php:69:            wp_die(esc_html__('This Try-On link has expired. Reload the product page and try again.', 'selfx-for-woocommerce'), '', array('response' => 403));
integrations/woocommerce\selfx-woocommerce\includes\class-selfx-wc-plugin.php:11:    public const GROUP = 'selfx-woocommerce';
integrations/woocommerce\selfx-woocommerce\includes\class-selfx-wc-plugin.php:40:        if (!current_user_can('manage_woocommerce')) { wp_die(esc_html__('You cannot manage this connection.', 'selfx-for-woocommerce'), '', array('response' => 403)); }
integrations/woocommerce\selfx-woocommerce\includes\class-selfx-wc-plugin.php:46:    private function redirect(): void { wp_safe_redirect(admin_url('admin.php?page=selfx-woocommerce')); exit; }
integrations/woocommerce\selfx-woocommerce\includes\class-selfx-wc-plugin.php:48:        add_submenu_page('woocommerce', 'SelfX', 'SelfX', 'manage_woocommerce', 'selfx-woocommerce', array($this, 'page'));
integrations/woocommerce\selfx-woocommerce\includes\class-selfx-wc-plugin.php:72:            $admin = admin_url('admin.php?page=selfx-woocommerce&selfx_return=1&selfx_state=' . rawurlencode($return_state));
integrations/woocommerce\selfx-woocommerce\includes\class-selfx-wc-plugin.php:107:        if ($page !== 'selfx-woocommerce' || $return !== '1') { return; }
integrations/woocommerce\selfx-woocommerce\includes\class-selfx-wc-plugin.php:116:            wp_die(esc_html__('This SelfX connection return could not be verified. Open WooCommerce → SelfX and use Retry connection.', 'selfx-for-woocommerce'), '', array('response' => 403, 'back_link' => true));
integrations/woocommerce\selfx-woocommerce\includes\class-selfx-wc-plugin.php:199:        if (!$lock) { wp_die(esc_html__('A catalog batch is running. Try disconnecting again shortly.', 'selfx-for-woocommerce'), '', array('response' => 409)); }
integrations/woocommerce\selfx-woocommerce\includes\class-selfx-wc-plugin.php:209:        if (!$lock) { wp_die(esc_html__('A catalog batch is running. Try again shortly.', 'selfx-for-woocommerce'), '', array('response' => 409)); }
integrations/woocommerce\selfx-woocommerce\includes\class-selfx-wc-client.php:102:        if ($redeem_secret !== '') { $args['headers']['x-selfx-woocommerce-redeem-secret'] = $redeem_secret; }
integrations/woocommerce\dist\selfx-for-woocommerce-0.5.2-wordpress-org.zip.sha256:1:aa1669065959c290f0c48cce028413f3719e97b018989e9bf09421a4a21fe923  selfx-for-woocommerce-0.5.2-wordpress-org.zip
integrations/woocommerce\dist\selfx-woocommerce-0.1.0.zip.sha256:1:829baa0627bf2274de31092925a7a56bb69b311bbd869585d2a742586600a6ab  selfx-woocommerce-0.1.0.zip
integrations/woocommerce\dist\selfx-woocommerce-0.2.0.zip.sha256:1:21356f0ea06002fd3d5d827933f6830c9510537f6d8311397b71b6a43186164c  selfx-woocommerce-0.2.0.zip
integrations/woocommerce\dist\selfx-woocommerce-0.3.0.zip.sha256:1:1ec7234e97a1e3b7252d6813358f962a4ee1cb4eecfa98b5db5150cf04837821  selfx-woocommerce-0.3.0.zip
integrations/woocommerce\dist\selfx-woocommerce-0.5.1-wordpress-org.zip.sha256:1:813b88cecdc1d137f6a8983a26dbbc1528924be7b3cbc4151028e1c66c9f9151  selfx-woocommerce-0.5.1-wordpress-org.zip
integrations/woocommerce\dist\selfx-woocommerce.zip.sha256:1:87256e508d2f6fa424e6fd3149f8c2ec2530a57c95d02ff99f7e377c04981350  selfx-woocommerce.zip
integrations/woocommerce\dist\selfx-woocommerce-0.5.1-plugin-check.json:313:    "message": "The plugin slug includes a restricted term. Your plugin slug - \"selfx-woocommerce\" - contains the restricted term \"woocommerce\" which cannot be used within in your plugin slug, unless your plugin slug contains one of the allowed patterns: \"for woocommerce\", \"with woocommerce\", \"using woocommerce\", or \"and woocommerce\". The term must still not appear anywhere else in your plugin slug.",
```
