<?php
/**
 * Plugin Name: SelfX for WooCommerce
 * Description: Connect your WooCommerce catalog to your SelfX Store and its kiosks.
 * Version: 0.2.0
 * Requires at least: 6.5
 * Requires PHP: 8.1
 * Requires Plugins: woocommerce
 * WC requires at least: 8.0
 * Author: SelfX
 * License: GPL-2.0-or-later
 * Text Domain: selfx-woocommerce
 */
defined('ABSPATH') || exit;
require_once __DIR__ . '/includes/class-selfx-wc-client.php';
require_once __DIR__ . '/includes/class-selfx-wc-product.php';
require_once __DIR__ . '/includes/class-selfx-wc-plugin.php';
require_once __DIR__ . '/includes/class-selfx-wc-storefront.php';
add_action('plugins_loaded', static function () {
    if (!class_exists('WooCommerce')) {
        add_action('admin_notices', static function () {
            echo '<div class="notice notice-error"><p>' . esc_html__('SelfX requires WooCommerce to be active.', 'selfx-woocommerce') . '</p></div>';
        });
        return;
    }
    (new SelfX_WC_Plugin())->register();
    (new SelfX_WC_Storefront())->register();
});
register_activation_hook(__FILE__, static function () { update_option('selfx_wc_reconcile_needed', true, false); });
register_deactivation_hook(__FILE__, array('SelfX_WC_Plugin', 'unschedule'));
